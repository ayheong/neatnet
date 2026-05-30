import type { Change, TreeNode } from "../types";

function normalize_slashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Collects every file and directory path relative to the scan root. */
export function flatten_tree_to_relative_paths(
  nodes: TreeNode[],
  prefix = "",
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const relative = prefix ? `${prefix}/${node.name}` : node.name;
    paths.push(relative);
    if (node.isDirectory && node.children?.length) {
      paths.push(...flatten_tree_to_relative_paths(node.children, relative));
    }
  }
  return paths;
}

export function build_path_index(paths: string[]): Set<string> {
  return new Set(paths.map((path) => normalize_slashes(path)));
}

/**
 * Maps a model-provided path to an exact path from the scan index.
 * Prefers exact match, then case-insensitive, then unique basename match.
 */
export function resolve_path_in_index(
  requested: string,
  index: Set<string>,
): string | null {
  const normalized = normalize_slashes(requested.trim());
  if (!normalized) return null;

  if (index.has(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const case_insensitive = [...index].filter((path) => path.toLowerCase() === lower);
  if (case_insensitive.length === 1) return case_insensitive[0];

  const basename = normalized.split("/").pop() ?? normalized;
  const basename_matches = [...index].filter(
    (path) => (path.split("/").pop() ?? path).toLowerCase() === basename.toLowerCase(),
  );
  if (basename_matches.length === 1) return basename_matches[0];

  return null;
}

/** Resolves "to" paths: exact match only if already in the folder; otherwise keeps the new path. */
function resolve_destination_path(requested: string, index: Set<string>): string {
  const normalized = normalize_slashes(requested.trim());
  if (index.has(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const case_insensitive = [...index].filter((path) => path.toLowerCase() === lower);
  if (case_insensitive.length === 1) return case_insensitive[0];

  return normalized;
}

export function normalize_changes_against_index(
  changes: Change[],
  index: Set<string>,
): { changes: Change[]; unresolved: string[] } {
  const unresolved: string[] = [];
  const normalized: Change[] = [];

  for (const change of changes) {
    const from_resolved = resolve_path_in_index(change.from, index);
    if (!from_resolved) {
      unresolved.push(change.from);
      continue;
    }

    if (change.type === "delete") {
      normalized.push({ ...change, from: from_resolved });
      continue;
    }

    if (!change.to) {
      unresolved.push(`${change.from} (missing destination)`);
      continue;
    }

    const to_path = resolve_destination_path(change.to, index);
    normalized.push({
      ...change,
      from: from_resolved,
      to: to_path,
    });
  }

  return { changes: normalized, unresolved };
}
