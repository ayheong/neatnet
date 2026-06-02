import type { Change } from "../types";

export type ProposedChangeLeaf = {
  id: string;
  changeIndex: number;
  from: string;
  to: string;
  type: Change["type"];
  fileName: string;
};

export type ProposedChangeFolder = {
  segment: string;
  fullPath: string;
  folders: ProposedChangeFolder[];
  files: ProposedChangeLeaf[];
};

export type ProposedChangesTree = {
  folders: ProposedChangeFolder[];
  rootFiles: ProposedChangeLeaf[];
  deletions: ProposedChangeLeaf[];
};

function split_path(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function sort_folders(folders: ProposedChangeFolder[]): void {
  folders.sort((a, b) => a.segment.localeCompare(b.segment));
  for (const folder of folders) {
    folder.files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    sort_folders(folder.folders);
  }
}

function sort_leaves(leaves: ProposedChangeLeaf[]): void {
  leaves.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export function build_proposed_changes_tree(changes: Change[]): ProposedChangesTree {
  const folders: ProposedChangeFolder[] = [];
  const rootFiles: ProposedChangeLeaf[] = [];
  const deletions: ProposedChangeLeaf[] = [];

  changes.forEach((change, changeIndex) => {
    const id = `dump-${changeIndex}`;
    const from = change.from;

    if (change.type === "delete") {
      deletions.push({
        id,
        changeIndex,
        from,
        to: "",
        type: "delete",
        fileName: split_path(from).pop() ?? from,
      });
      return;
    }

    if (!change.to) return;

    const parts = split_path(change.to);
    if (parts.length === 0) return;

    const fileName = parts.pop()!;
    const leaf: ProposedChangeLeaf = {
      id,
      changeIndex,
      from,
      to: change.to,
      type: change.type,
      fileName,
    };

    let current_folders = folders;
    let path_so_far = "";
    let parent_folder: ProposedChangeFolder | null = null;

    for (const segment of parts) {
      path_so_far = path_so_far ? `${path_so_far}/${segment}` : segment;
      let folder = current_folders.find((entry) => entry.segment === segment);
      if (!folder) {
        folder = { segment, fullPath: path_so_far, folders: [], files: [] };
        current_folders.push(folder);
      }
      parent_folder = folder;
      current_folders = folder.folders;
    }

    if (parent_folder) {
      parent_folder.files.push(leaf);
    } else {
      rootFiles.push(leaf);
    }
  });

  sort_folders(folders);
  sort_leaves(rootFiles);
  sort_leaves(deletions);

  return { folders, rootFiles, deletions };
}

export function collect_folder_leaf_ids(folder: ProposedChangeFolder): string[] {
  const ids: string[] = [];
  for (const file of folder.files) {
    ids.push(file.id);
  }
  for (const child of folder.folders) {
    ids.push(...collect_folder_leaf_ids(child));
  }
  return ids;
}

type FolderSelectionState = "all" | "none" | "partial";

export function folder_selection_state(
  leaf_ids: string[],
  selectedIds: Set<string>,
): FolderSelectionState {
  if (leaf_ids.length === 0) return "all";
  let selected_count = 0;
  for (const id of leaf_ids) {
    if (selectedIds.has(id)) selected_count += 1;
  }
  if (selected_count === 0) return "none";
  if (selected_count === leaf_ids.length) return "all";
  return "partial";
}

export function initial_proposed_tree_collapsed_keys(tree: ProposedChangesTree): Set<string> {
  return new Set(
    collect_proposed_folder_keys(tree).filter((key) => key !== "proposed:root"),
  );
}

/** Matches visible rows in ProposedChangesTreeView for the current collapse state. */
export function count_visible_proposed_tree_lines(
  tree: ProposedChangesTree,
  collapsedKeys: Set<string>,
): number {
  let count = 1;
  if (collapsedKeys.has("proposed:root")) return count;

  function walk_folders(folders: ProposedChangeFolder[], key_prefix: string): number {
    let n = 0;
    for (const folder of folders) {
      const key = `${key_prefix}/${folder.fullPath}`;
      n += 1;
      if (!collapsedKeys.has(key)) {
        n += walk_folders(folder.folders, key_prefix);
        n += folder.files.length;
      }
    }
    return n;
  }

  count += walk_folders(tree.folders, "proposed");
  count += tree.rootFiles.length;

  if (tree.deletions.length > 0) {
    count += 1;
    if (!collapsedKeys.has("proposed:deletions")) {
      count += tree.deletions.length;
    }
  }

  return count;
}

export function collect_proposed_folder_keys(tree: ProposedChangesTree): string[] {
  const keys: string[] = ["proposed:root"];

  function walk(folders: ProposedChangeFolder[], prefix: string) {
    for (const folder of folders) {
      const key = `${prefix}/${folder.fullPath}`;
      keys.push(key);
      walk(folder.folders, prefix);
    }
  }

  walk(tree.folders, "proposed");
  if (tree.deletions.length > 0) {
    keys.push("proposed:deletions");
  }
  return keys;
}
