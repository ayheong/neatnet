import {
  build_path_index,
  flatten_tree_to_file_paths,
  list_directory_paths,
  normalize_slashes,
  resolve_move_destination_path,
} from "./folderPaths";
import type { Change, TreeNode } from "../types";

export const PREVIEW_ROOT_KEY = "preview:root";

/** AI-proposed deletes start marked for deletion in the preview. */
export function initial_pending_deletes_from_changes(changes: Change[]): Set<string> {
  const pending = new Set<string>();
  for (const change of changes) {
    if (change.type === "delete") {
      pending.add(normalize_slashes(change.from));
    }
  }
  return pending;
}

/** One file in the post-apply preview (stable identity = sourcePath on disk). */
export type PreviewFileEntry = {
  sourcePath: string;
  displayPath: string;
  changeIndex: number | null;
  isPendingDelete: boolean;
};

function split_path(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function join_path(dir: string, name: string): string {
  if (!dir) return name;
  return `${dir}/${name}`;
}

export function basename(path: string): string {
  const parts = split_path(path);
  return parts[parts.length - 1] ?? path;
}

/** Parent directory path relative to scan root (empty string = root). */
export function parent_folder_path(displayPath: string): string {
  const parts = split_path(displayPath);
  parts.pop();
  return parts.join("/");
}

function sort_tree_nodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children?.length) sort_tree_nodes(node.children);
  }
}

/** Build preview rows from scan + AI changes + optional manual path overrides. */
export function build_preview_entries(
  folderContents: TreeNode[],
  changes: Change[],
  pathOverrides: Map<string, string>,
  pendingDeletes: Set<string>,
): PreviewFileEntry[] {
  const file_paths = flatten_tree_to_file_paths(folderContents);
  const file_index = build_path_index(file_paths);
  const directory_paths = list_directory_paths(folderContents);
  const change_by_from = new Map<string, { change: Change; index: number }>();
  changes.forEach((change, index) => {
    const from = normalize_slashes(change.from);
    change_by_from.set(from, { change, index });
  });

  const entries: PreviewFileEntry[] = [];

  for (const sourcePath of file_paths) {
    const normalized_source = normalize_slashes(sourcePath);
    const hit =
      change_by_from.get(normalized_source) ??
      change_by_from.get(sourcePath);
    const changeIndex = hit?.index ?? null;
    const isPendingDelete = pendingDeletes.has(normalized_source);

    let displayPath = normalized_source;
    const override =
      pathOverrides.get(normalized_source) ?? pathOverrides.get(sourcePath);
    if (override) {
      displayPath = normalize_slashes(override);
    } else if (changeIndex !== null && hit!.change.type !== "delete" && hit!.change.to) {
      displayPath = resolve_move_destination_path(
        normalized_source,
        hit!.change.to,
        file_index,
        directory_paths,
      );
    }

    entries.push({
      sourcePath: normalized_source,
      displayPath,
      changeIndex,
      isPendingDelete,
    });
  }

  return entries;
}

/** Flat file paths → TreeNode tree (folders inferred from paths). */
export function preview_entries_to_tree(entries: PreviewFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  function parent_container_for_path(segments: string[], nodes: TreeNode[]): TreeNode[] {
    if (segments.length === 0) return nodes;
    const [head, ...rest] = segments;
    let dir = nodes.find((n) => n.isDirectory && n.name === head);
    if (!dir) {
      dir = {
        name: head!,
        isDirectory: true,
        isFile: false,
        isSymlink: false,
        children: [],
      };
      nodes.push(dir);
    }
    dir.children = dir.children ?? [];
    if (rest.length === 0) return dir.children;
    return parent_container_for_path(rest, dir.children);
  }

  for (const entry of entries) {
    const normalized = normalize_slashes(entry.displayPath);
    const parts = split_path(normalized);
    let fileName = parts.pop();
    if (!fileName) {
      fileName = basename(entry.sourcePath);
    }
    const parents = parent_container_for_path(parts, root);
    parents.push({
      name: fileName,
      isDirectory: false,
      isFile: true,
      isSymlink: false,
      previewSourcePath: entry.sourcePath,
    });
  }

  sort_tree_nodes(root);
  return root;
}

export function collect_preview_folder_keys(nodes: TreeNode[], path_prefix = "preview"): string[] {
  const keys: string[] = [PREVIEW_ROOT_KEY];

  function walk(list: TreeNode[], prefix: string) {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index]!;
      const key = `${prefix}:${index}:${node.name}`;
      if (node.isDirectory && node.children?.length) {
        keys.push(key);
        walk(node.children, `${key}/`);
      }
    }
  }

  walk(nodes, path_prefix);
  return keys;
}

export function count_visible_preview_tree_lines(
  nodes: TreeNode[],
  collapsedKeys: Set<string>,
  showRoot: boolean,
): number {
  let count = showRoot ? 1 : 0;
  if (nodes.length === 0 || collapsedKeys.has(PREVIEW_ROOT_KEY)) {
    return count;
  }

  function walk(list: TreeNode[], path_prefix: string) {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index]!;
      const key = `${path_prefix}:${index}:${node.name}`;
      count += 1;
      const has_children =
        node.isDirectory && node.children !== undefined && node.children.length > 0;
      if (has_children && !collapsedKeys.has(key)) {
        walk(node.children!, `${key}/`);
      }
    }
  }

  walk(nodes, "preview");
  return count;
}

/** Move a file to a folder (or root if folderPath empty). Returns new display path. */
export function move_preview_file_to_folder(
  _sourcePath: string,
  currentDisplayPath: string,
  folderPath: string,
): string {
  const name = basename(currentDisplayPath);
  const normalized_folder = normalize_slashes(folderPath).replace(/\/+$/, "");
  return join_path(normalized_folder, name);
}

/** Changes to apply: AI proposals (with overrides), manual moves, and pending deletes. */
export function derive_apply_changes(
  changes: Change[],
  pathOverrides: Map<string, string>,
  folderContents: TreeNode[],
  pendingDeletes: Set<string>,
): Change[] {
  const entries = build_preview_entries(
    folderContents,
    changes,
    pathOverrides,
    pendingDeletes,
  );
  const apply: Change[] = [];

  for (const entry of entries) {
    if (pendingDeletes.has(entry.sourcePath)) {
      apply.push({ type: "delete", from: entry.sourcePath });
      continue;
    }

    const override =
      pathOverrides.get(entry.sourcePath) ??
      pathOverrides.get(normalize_slashes(entry.sourcePath));
    if (entry.changeIndex !== null) {
      const base = changes[entry.changeIndex]!;
      if (base.type === "delete") {
        continue;
      }
      const to = override ?? base.to;
      if (to && to !== base.from) {
        apply.push({ ...base, to });
      }
      continue;
    }

    if (override && override !== entry.sourcePath) {
      apply.push({
        type: "move",
        from: entry.sourcePath,
        to: override,
      });
    }
  }

  return apply;
}

/** Update working copy of AI changes when user drags a proposed file. */
export function apply_override_to_working_changes(
  workingChanges: Change[],
  sourcePath: string,
  newDisplayPath: string,
): Change[] {
  return workingChanges.map((change) => {
    if (normalize_slashes(change.from) !== normalize_slashes(sourcePath)) return change;
    if (change.type === "delete") return change;
    return { ...change, to: newDisplayPath };
  });
}
