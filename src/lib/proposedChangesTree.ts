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
