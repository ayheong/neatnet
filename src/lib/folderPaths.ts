import type { Change, TreeNode } from "../types";

// \ --> /
export function normalize_slashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Collects file paths only (excludes directories). Used for AI proposals and apply "from" resolution. */
export function flatten_tree_to_file_paths(
  nodes: TreeNode[],
  prefix = "",
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const relative = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.isDirectory) {
      if (node.children?.length) {
        paths.push(...flatten_tree_to_file_paths(node.children, relative));
      }
    } else {
      paths.push(normalize_slashes(relative));
    }
  }
  return paths;
}

/** Lists existing directory paths relative to the scan root. */
export function list_directory_paths(nodes: TreeNode[], prefix = ""): string[] {
  const dirs: string[] = [];
  for (const node of nodes) {
    if (!node.isDirectory) continue;
    const relative = prefix ? `${prefix}/${node.name}` : node.name;
    dirs.push(relative);
    if (node.children?.length) {
      dirs.push(...list_directory_paths(node.children, relative));
    }
  }
  return dirs;
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
  const normalized = normalize_slashes(requested.trim());  // \ --> /
  if (!normalized) return null;

  if (index.has(normalized)) return normalized;  // exact match

  const lower = normalized.toLowerCase();  // case-insensitive match
  const case_insensitive = [...index].filter((path) => path.toLowerCase() === lower);  // compare 
  if (case_insensitive.length === 1) return case_insensitive[0];  // if one match, return

  const basename = normalized.split("/").pop() ?? normalized;  // get last part of path
  const basename_matches = [...index].filter(
    (path) => (path.split("/").pop() ?? path).toLowerCase() === basename.toLowerCase(),  // compare 
  );
  if (basename_matches.length === 1) return basename_matches[0];  // if one match, return

  return null;  // no match
}

function join_relative_path(dir: string, fileName: string): string {
  if (!dir) return fileName;
  return `${dir}/${fileName}`;
}

function basename_from_path(path: string): string {
  const parts = normalize_slashes(path).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * When the model's "to" is a folder path (e.g. "Downloads"), append the source file name
 * so the preview does not show a phantom file called "Downloads" beside the real folder.
 */
export function resolve_move_destination_path(
  from: string,
  requestedTo: string,
  fileIndex: Set<string>,
  directoryPaths: string[],
): string {
  const to = normalize_slashes(requestedTo.trim()).replace(/\/+$/, "");
  if (!to) return to;

  const fromNorm = normalize_slashes(from);
  const sourceName = basename_from_path(fromNorm);

  if (fileIndex.has(to)) return to;

  const dirByLower = new Map<string, string>();
  for (const dir of directoryPaths) {
    const normalized = normalize_slashes(dir);
    dirByLower.set(normalized.toLowerCase(), normalized);
  }

  const matchedDir = dirByLower.get(to.toLowerCase());
  if (matchedDir) {
    return join_relative_path(matchedDir, sourceName);
  }

  const lower = to.toLowerCase();
  const case_insensitive = [...fileIndex].filter((path) => path.toLowerCase() === lower);
  if (case_insensitive.length === 1) return case_insensitive[0]!;

  return to;
}

/** Resolves "to" paths: exact match only if already in the folder; otherwise keeps the new path. */
function resolve_destination_path(
  from: string,
  requested: string,
  index: Set<string>,
  directoryPaths: string[],
): string {
  return resolve_move_destination_path(from, requested, index, directoryPaths);
}

export function normalize_changes_against_index(
  changes: Change[],
  index: Set<string>,
  directoryPaths: string[] = [],
): { changes: Change[]; unresolved: string[] } {
  const unresolved: string[] = [];  // paths that were not found in the index
  const normalized: Change[] = [];  // changes that were resolved against the index

  for (const change of changes) {
    const from_resolved = resolve_path_in_index(change.from, index);  // try to match path to index
    if (!from_resolved) {
      unresolved.push(change.from);  // if no match, add to unresolved
      continue;
    }

    if (change.type === "delete") {
      normalized.push({ ...change, from: from_resolved });  // if delete, add to normalized
      continue;
    }

    if (!change.to) {
      unresolved.push(`${change.from} (missing destination)`);  // if missing destination, add to unresolved
      continue;
    }

    const to_path = resolve_destination_path(
      from_resolved,
      change.to,
      index,
      directoryPaths,
    );
    normalized.push({  // if rename or move, add to normalized
      ...change,
      from: from_resolved,
      to: to_path,
    });
  }

  return { changes: normalized, unresolved };  // return the normalized changes and unresolved paths
}
