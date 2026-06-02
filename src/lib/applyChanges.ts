import { dirname, join, normalize } from "@tauri-apps/api/path";
import { exists, mkdir, remove, rename } from "@tauri-apps/plugin-fs";
import {
  build_path_index,
  normalize_changes_against_index,
  normalize_slashes,
} from "./folderPaths";
import type { Change } from "../types";

export type ApplyItemResult = {
  change: Change;
  status: "applied" | "failed" | "skipped";
  error?: string;
};

export type ApplyOutcomeCounts = {
  movedApplied: number;
  deletedApplied: number;
  movedFailed: number;
  deletedFailed: number;
  skipped: number;
};

export type ApplyChangesResult = {
  results: ApplyItemResult[];
  outcomes: ApplyOutcomeCounts;
};

export function total_applied(outcomes: ApplyOutcomeCounts): number {
  return outcomes.movedApplied + outcomes.deletedApplied;
}

export function total_failed(outcomes: ApplyOutcomeCounts): number {
  return outcomes.movedFailed + outcomes.deletedFailed;
}

/** Counts applied / failed / skipped moves vs deletes from apply results. */
export function count_apply_outcomes(results: ApplyItemResult[]): ApplyOutcomeCounts {
  const counts: ApplyOutcomeCounts = {
    movedApplied: 0,
    deletedApplied: 0,
    movedFailed: 0,
    deletedFailed: 0,
    skipped: 0,
  };

  for (const result of results) {
    const is_delete = result.change.type === "delete";
    if (result.status === "applied") {
      if (is_delete) counts.deletedApplied += 1;
      else counts.movedApplied += 1;
    } else if (result.status === "failed") {
      if (is_delete) counts.deletedFailed += 1;
      else counts.movedFailed += 1;
    } else if (result.status === "skipped") {
      counts.skipped += 1;
    }
  }

  return counts;
}

export class ApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyValidationError";
  }
}

export function is_safe_relative_path(path: string): boolean {
  const normalized = normalize_slashes(path.trim());
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((segment) => segment === ".." || segment === ".");
}

// ensure path is safe and is within the root folder
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
  return normalized_absolute;  // normalized absolute path
}

function is_rename_or_move(change: Change): boolean {
  return change.type === "rename" || change.type === "move";
}

export async function validate_changes(  // if changes are invalid, freak out safely
  root: string,
  changes: Change[],
): Promise<void> {
  if (changes.length === 0) {  // if no changes, throw error
    throw new ApplyValidationError("No changes selected.");
  }

  const from_paths = new Set<string>();  // store unique from paths
  const to_paths = new Set<string>();  // store unique to paths

  for (const change of changes) {
    if (!change.from?.trim()) {  // if missing source path, throw error
      throw new ApplyValidationError("Change missing source path.");
    }
    if (!is_safe_relative_path(change.from)) {  // if source path is not safe, throw error
      throw new ApplyValidationError(`Invalid source path: ${change.from}`);
    }

    if (from_paths.has(change.from)) {  // if duplicate source path, throw error
      throw new ApplyValidationError(`Duplicate source path: ${change.from}`);
    }
    from_paths.add(change.from);  // record source so we can detect duplicates

    if (change.type === "delete") {  // deletes have no destination to validate
      continue;
    }

    if (!change.to?.trim()) {  // if missing destination, throw error
      throw new ApplyValidationError(`Missing destination for ${change.from}`);
    }
    if (!is_safe_relative_path(change.to)) {  // if destination path is not safe, throw error
      throw new ApplyValidationError(`Invalid destination path: ${change.to}`);
    }
    if (to_paths.has(change.to)) {  // if duplicate destination path, throw error
      throw new ApplyValidationError(`Duplicate destination path: ${change.to}`);
    }
    to_paths.add(change.to);  // record destination so we can detect duplicates
  }

  // Every change: source path must exist on disk.
  for (const change of changes) {
    const from_abs = await resolve_under_root(root, change.from);
    if (!(await exists(from_abs))) {
      throw new ApplyValidationError(`Source not found: ${change.from}`);
    }

    if (!is_rename_or_move(change) || !change.to) continue;

    const to_abs = await resolve_under_root(root, change.to);
    if (!(await exists(to_abs))) continue;

    // Target path is taken — OK only if another change moves that file/folder away,
    // or from and to are the same (no real move).
    const other_change_moves_from_target = changes.some(
      (other) => is_rename_or_move(other) && other.from === change.to,
    );
    const same_path = change.from === change.to;

    if (!other_change_moves_from_target && !same_path) {
      throw new ApplyValidationError(`Destination already exists: ${change.to}`);
    }
  }
}

// Order rename/move changes: run those with no incoming dependency first (repeat until done).
function order_rename_changes(changes: Change[]): Change[] {
  const remaining = changes.filter(is_rename_or_move);
  const ordered: Change[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter(
      (change) => !remaining.some((other) => other !== change && other.to === change.from),
    );  // ready = no other remaining change targets this change's source

    if (ready.length === 0) {
      ordered.push(...remaining);  // cycle (e.g. swap): order doesn't help, apply will use temp paths
      break;
    }

    for (const change of ready) {
      ordered.push(change);  // add ready changes to ordered list
      const index = remaining.indexOf(change);
      remaining.splice(index, 1);  // remove ready changes from remaining list
    }
  }

  return ordered;  // return ordered list
}

// Create parent folders for the given paths; skip creating ones that already exist.
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

// Apply a single rename/move change
async function apply_rename_change(
  root: string,
  change: Change,
  current_paths: Map<string, string>,
  pending_from_paths: Set<string>,
): Promise<void> {
  // get absolute paths
  const from_abs = current_paths.get(change.from) ?? (await resolve_under_root(root, change.from));
  const to_abs = await resolve_under_root(root, change.to!);

  let source_abs = from_abs;
  // check if something already exists at the destination
  const dest_exists = await exists(to_abs);
  // check if another change in this batch will move that file away from the destination
  const dest_will_be_moved_later = change.to ? pending_from_paths.has(change.to) : false;

  // destination is taken, but another change will clear it, put source in temp first
  if (dest_exists && dest_will_be_moved_later && to_abs !== from_abs) {
    source_abs = await break_rename_cycle(root, change, source_abs);
  } else if (dest_exists && to_abs !== from_abs) {
    // destination is taken and nothing else will move it, cannot overwrite
    throw new Error(`Destination already exists: ${change.to}`);
  }

  // create parent folders if needed, then perform the rename
  await mkdir(await dirname(to_abs), { recursive: true });
  await rename(source_abs, to_abs);
  current_paths.set(change.from, to_abs);  // logical from path → where the file lives now
  pending_from_paths.delete(change.from);  // this change has been applied
}

/** Applies the changes to the folder. */
export async function apply_changes(
  root: string,
  changes: Change[],
  known_relative_paths?: string[],
): Promise<ApplyChangesResult> {
  let resolved_changes = changes;  // store changes
  if (known_relative_paths && known_relative_paths.length > 0) {  // normalize paths if found
    const path_index = build_path_index(known_relative_paths);  //   ground truth paths
    const { changes: normalized, unresolved } = normalize_changes_against_index(
      changes,
      path_index,
    );
    if (unresolved.length > 0) {
      throw new ApplyValidationError(
        `Could not resolve path(s): ${unresolved.join(", ")}. Re-scan the folder and propose changes again.`,
      );
    }
    resolved_changes = normalized;  // store normalized changes
  }

  await validate_changes(root, resolved_changes);  // validate changes

  const results: ApplyItemResult[] = [];  // store results
  const renames = order_rename_changes(resolved_changes);  // rename + move changes, ordered
  const deletes = resolved_changes.filter((change) => change.type === "delete");  // "delete" changes

  const rename_destinations = renames  // "rename" destinations
    .map((change) => change.to)  // get destinations
    .filter((path): path is string => Boolean(path));  // filter out undefined

  try {
    await ensure_parent_dirs(root, rename_destinations);  // ensure parent directories exist, else create them
  } catch (error) {
    throw new ApplyValidationError(
      error instanceof Error ? error.message : "Failed to create destination folders.",
    );
  }

  const current_paths = new Map<string, string>();  //  store successfully applied changes
  const failed_sources = new Set<string>();  // store failures
  const pending_from_paths = new Set(renames.map((change) => change.from));  // store changes pending processing

  
  for (const change of renames) {
    if (failed_sources.has(change.from)) {  // if source failed, skip
      results.push({
        change,
        status: "skipped",
        error: "Source unavailable due to an earlier failure.",
      });
      continue;
    }

    try {  // try to apply change
      await apply_rename_change(root, change, current_paths, pending_from_paths);
      results.push({ change, status: "applied" });  // store success
    } catch (error) {
      failed_sources.add(change.from);  // store failure for later handling
      pending_from_paths.delete(change.from);  // remove from pending
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const change of deletes) {  // "delete" changes
    if (failed_sources.has(change.from)) {  // if source failed, skip
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
      await remove(from_abs);  // delete file or folder from disk
      results.push({ change, status: "applied" });  // store success
    } catch (error) {
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // count results and return
  return { results, outcomes: count_apply_outcomes(results) };
}
