import { dirname, join, normalize } from "@tauri-apps/api/path";
import { exists, mkdir, remove, rename } from "@tauri-apps/plugin-fs";
import {
  build_path_index,
  normalize_changes_against_index,
} from "./folderPaths";
import type { Change } from "../types";

export type ApplyItemResult = {
  change: Change;
  status: "applied" | "failed" | "skipped";
  error?: string;
};

export type ApplyChangesResult = {
  results: ApplyItemResult[];
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
};

export class ApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyValidationError";
  }
}

function normalize_slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

export function is_safe_relative_path(path: string): boolean {
  const normalized = normalize_slashes(path.trim());
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((segment) => segment === ".." || segment === ".");
}

export async function resolve_under_root(root: string, relative_path: string): Promise<string> {
  if (!is_safe_relative_path(relative_path)) {
    throw new ApplyValidationError(`Unsafe path: ${relative_path}`);
  }
  const segments = relative_path.replace(/\\/g, "/").split("/");
  let absolute = root;
  for (const segment of segments) {
    absolute = await join(absolute, segment);
  }
  const normalized_root = await normalize(root);
  const normalized_absolute = await normalize(absolute);
  const root_prefix =
    normalized_root.endsWith("/") || normalized_root.endsWith("\\")
      ? normalized_root
      : `${normalized_root}/`;
  if (
    normalized_absolute !== normalized_root &&
    !normalized_absolute.startsWith(root_prefix) &&
    !normalized_absolute.startsWith(`${normalized_root}\\`)
  ) {
    throw new ApplyValidationError(`Path escapes folder root: ${relative_path}`);
  }
  return normalized_absolute;
}

function is_rename_or_move(change: Change): boolean {
  return change.type === "rename" || change.type === "move";
}

export async function validate_changes(
  root: string,
  changes: Change[],
): Promise<void> {
  if (changes.length === 0) {
    throw new ApplyValidationError("No changes selected.");
  }

  const from_paths = new Set<string>();
  const to_paths = new Set<string>();

  for (const change of changes) {
    if (!change.from?.trim()) {
      throw new ApplyValidationError("Change missing source path.");
    }
    if (!is_safe_relative_path(change.from)) {
      throw new ApplyValidationError(`Invalid source path: ${change.from}`);
    }

    if (from_paths.has(change.from)) {
      throw new ApplyValidationError(`Duplicate source path: ${change.from}`);
    }
    from_paths.add(change.from);

    if (change.type === "delete") {
      continue;
    }

    if (!change.to?.trim()) {
      throw new ApplyValidationError(`Missing destination for ${change.from}`);
    }
    if (!is_safe_relative_path(change.to)) {
      throw new ApplyValidationError(`Invalid destination path: ${change.to}`);
    }
    if (to_paths.has(change.to)) {
      throw new ApplyValidationError(`Duplicate destination path: ${change.to}`);
    }
    to_paths.add(change.to);
  }

  for (const change of changes) {
    const from_abs = await resolve_under_root(root, change.from);
    if (!(await exists(from_abs))) {
      throw new ApplyValidationError(`Source not found: ${change.from}`);
    }

    if (!is_rename_or_move(change) || !change.to) continue;

    const to_abs = await resolve_under_root(root, change.to);
    const to_exists = await exists(to_abs);
    if (!to_exists) continue;

    const to_is_moved_away = changes.some(
      (other) => is_rename_or_move(other) && other.from === change.to,
    );
    const to_is_same_as_from = change.from === change.to;

    if (!to_is_moved_away && !to_is_same_as_from) {
      throw new ApplyValidationError(`Destination already exists: ${change.to}`);
    }
  }
}

function order_rename_changes(changes: Change[]): Change[] {
  const remaining = changes.filter(is_rename_or_move);
  const ordered: Change[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter(
      (change) => !remaining.some((other) => other !== change && other.to === change.from),
    );

    if (ready.length === 0) {
      ordered.push(...remaining);
      break;
    }

    for (const change of ready) {
      ordered.push(change);
      const index = remaining.indexOf(change);
      remaining.splice(index, 1);
    }
  }

  return ordered;
}

async function ensure_parent_dirs(root: string, relative_paths: string[]): Promise<void> {
  const parent_dirs = new Set<string>();
  for (const relative_path of relative_paths) {
    const parent = await dirname(relative_path);
    if (parent && parent !== "." && parent !== "/") {
      parent_dirs.add(parent);
    }
  }

  for (const parent of parent_dirs) {
    const parent_abs = await resolve_under_root(root, parent);
    await mkdir(parent_abs, { recursive: true });
  }
}

async function break_rename_cycle(
  root: string,
  change: Change,
  current_from: string,
): Promise<string> {
  const temp_relative = `.folder_organizer_tmp/${crypto.randomUUID()}_${change.from.split("/").pop() ?? "item"}`;
  const temp_abs = await resolve_under_root(root, temp_relative);
  await mkdir(await dirname(temp_abs), { recursive: true });
  await rename(current_from, temp_abs);
  return temp_abs;
}

async function apply_rename_change(
  root: string,
  change: Change,
  current_paths: Map<string, string>,
  pending_from_paths: Set<string>,
): Promise<void> {
  const from_abs = current_paths.get(change.from) ?? (await resolve_under_root(root, change.from));
  const to_abs = await resolve_under_root(root, change.to!);

  let source_abs = from_abs;
  const dest_exists = await exists(to_abs);
  const dest_is_pending_source = change.to ? pending_from_paths.has(change.to) : false;

  if (dest_exists && dest_is_pending_source && to_abs !== from_abs) {
    source_abs = await break_rename_cycle(root, change, source_abs);
  } else if (dest_exists && to_abs !== from_abs) {
    throw new Error(`Destination already exists: ${change.to}`);
  }

  await mkdir(await dirname(to_abs), { recursive: true });
  await rename(source_abs, to_abs);
  current_paths.set(change.from, to_abs);
  pending_from_paths.delete(change.from);
}

export async function apply_changes(
  root: string,
  changes: Change[],
  known_relative_paths?: string[],
): Promise<ApplyChangesResult> {
  let resolved_changes = changes;
  if (known_relative_paths && known_relative_paths.length > 0) {
    const path_index = build_path_index(known_relative_paths);
    const { changes: normalized, unresolved } = normalize_changes_against_index(
      changes,
      path_index,
    );
    if (unresolved.length > 0) {
      throw new ApplyValidationError(
        `Could not resolve path(s): ${unresolved.join(", ")}. Re-scan the folder and propose changes again.`,
      );
    }
    resolved_changes = normalized;
  }

  await validate_changes(root, resolved_changes);

  const results: ApplyItemResult[] = [];
  const renames = order_rename_changes(resolved_changes);
  const deletes = resolved_changes.filter((change) => change.type === "delete");

  const rename_destinations = renames
    .map((change) => change.to)
    .filter((path): path is string => Boolean(path));

  try {
    await ensure_parent_dirs(root, rename_destinations);
  } catch (error) {
    throw new ApplyValidationError(
      error instanceof Error ? error.message : "Failed to create destination folders.",
    );
  }

  const current_paths = new Map<string, string>();
  const failed_sources = new Set<string>();
  const pending_from_paths = new Set(renames.map((change) => change.from));

  for (const change of renames) {
    if (failed_sources.has(change.from)) {
      results.push({
        change,
        status: "skipped",
        error: "Source unavailable due to an earlier failure.",
      });
      continue;
    }

    try {
      await apply_rename_change(root, change, current_paths, pending_from_paths);
      results.push({ change, status: "applied" });
    } catch (error) {
      failed_sources.add(change.from);
      pending_from_paths.delete(change.from);
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const change of deletes) {
    if (failed_sources.has(change.from)) {
      results.push({
        change,
        status: "skipped",
        error: "Source unavailable due to an earlier failure.",
      });
      continue;
    }

    try {
      const from_abs =
        current_paths.get(change.from) ?? (await resolve_under_root(root, change.from));
      if (!(await exists(from_abs))) {
        results.push({
          change,
          status: "failed",
          error: "Source not found.",
        });
        continue;
      }
      await remove(from_abs);
      results.push({ change, status: "applied" });
    } catch (error) {
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const appliedCount = results.filter((result) => result.status === "applied").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;

  return { results, appliedCount, failedCount, skippedCount };
}
