import type { Change, TreeNode } from "../types";

export function normalize_slashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

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

function resolve_path_in_index(
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

function join_relative_path(dir: string, fileName: string): string {
  if (!dir) return fileName;
  return `${dir}/${fileName}`;
}

function basename_from_path(path: string): string {
  const parts = normalize_slashes(path).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Keep the source filename; only the folder path may change. */
export function preserve_move_filename(from: string, to: string): string {
  const from_norm = normalize_slashes(from);
  const to_norm = normalize_slashes(to.trim()).replace(/\/+$/, "");
  const source_name = basename_from_path(from_norm);
  if (!to_norm) return to_norm;

  const parts = to_norm.split("/").filter(Boolean);
  if (parts.length === 0) return source_name;

  parts[parts.length - 1] = source_name;
  return parts.join("/");
}

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

export function normalize_changes_against_index(
  changes: Change[],
  index: Set<string>,
  directoryPaths: string[] = [],
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
      normalized.push({ type: "delete", from: from_resolved });
      continue;
    }

    // Models may still emit legacy "rename"; treat as move (filename preserved below).
    if (change.type !== "move" && (change.type as string) !== "rename") {
      continue;
    }

    if (!change.to) {
      unresolved.push(`${change.from} (missing destination)`);
      continue;
    }

    const to_path = preserve_move_filename(
      from_resolved,
      resolve_move_destination_path(
        from_resolved,
        change.to,
        index,
        directoryPaths,
      ),
    );
    if (normalize_slashes(to_path) === normalize_slashes(from_resolved)) {
      continue;
    }
    normalized.push({
      type: "move",
      from: from_resolved,
      to: to_path,
    });
  }

  return { changes: normalized, unresolved };
}
