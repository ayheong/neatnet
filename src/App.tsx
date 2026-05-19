import { useEffect, useMemo, useState } from "react";
import { basename, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, size } from "@tauri-apps/plugin-fs";
import { SCAN_TYPING_LINE } from "./constants";
import { ControlsPanel } from "./panels/ControlsPanel";
import { ProposedChangesPanel } from "./panels/ProposedChangesPanel";
import { TerminalPanel } from "./panels/TerminalPanel";
import { organize_folder } from "./lib/claude";
import type { OrganizeResult, TreeNode } from "./types";
import "./App.css";

type FolderScanProgress = {
  onFile: () => void;
};

function format_byte_size(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

/** Counts every file and directory node under the current tree (recursive). */
function count_tree_nodes(nodes: TreeNode[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;
  for (const node of nodes) {
    if (node.isDirectory) {
      dirs += 1;
      if (node.children?.length) {
        const inner = count_tree_nodes(node.children);
        files += inner.files;
        dirs += inner.dirs;
      }
    } else {
      files += 1;
    }
  }
  return { files, dirs };
}

function collect_collapsed_directory_keys(
  nodes: TreeNode[],
  path_prefix: string,
  into: Set<string>,
) {
  nodes.forEach((node, index) => {
    const key = `${path_prefix}:${index}:${node.name}`;
    const has_children =
      node.isDirectory && node.children !== undefined && node.children.length > 0;
    if (has_children) {
      into.add(key);
      collect_collapsed_directory_keys(node.children!, `${key}/`, into);
    }
  });
}

function App() {
  const [selectedFolder, setSelectedFolder] = useState("");
  const [folderContents, setFolderContents] = useState<TreeNode[]>([]);
  const [rootTreeLabel, setRootTreeLabel] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());
  const [isScanningFolder, setIsScanningFolder] = useState(false);
  const [scanLineTyped, setScanLineTyped] = useState("");
  const [filesFoundCount, setFilesFoundCount] = useState(0);
  const [folderTotalBytes, setFolderTotalBytes] = useState<number | null>(null);
  const [ignorePatterns, setIgnorePatterns] = useState("");
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);
  const [isProposingChanges, setIsProposingChanges] = useState(false);

  useEffect(() => {
    if (!isScanningFolder) {
      setScanLineTyped("");
      return;
    }
    setScanLineTyped("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setScanLineTyped(SCAN_TYPING_LINE.slice(0, i));
      if (i >= SCAN_TYPING_LINE.length) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [isScanningFolder]);

  async function open_folder_selector_dialog() {
    const folder = await open({
      multiple: false,
      directory: true,
    });
    if (folder) {
      const path = folder as string;
      setSelectedFolder(path);
      setFolderContents([]);
      setRootTreeLabel("");
      setCollapsedKeys(new Set());
      setFilesFoundCount(0);
      setFolderTotalBytes(null);
      setIsScanningFolder(true);

      let file_count = 0;
      let raf_flush: number = 0;
      const bump_file = () => {
        file_count += 1;
        if (raf_flush !== 0) return;
        raf_flush = window.requestAnimationFrame(() => {
          raf_flush = 0;
          setFilesFoundCount(file_count);
        });
      };

      try {
        const label = await basename(path);
        setRootTreeLabel(label);
        const tree = await read_folder_contents(path, { onFile: bump_file });
        if (raf_flush !== 0) {
          window.cancelAnimationFrame(raf_flush);
          raf_flush = 0;
        }
        setFilesFoundCount(file_count);
        console.log(tree);
        const initially_collapsed = new Set<string>();
        collect_collapsed_directory_keys(tree, "", initially_collapsed);
        setCollapsedKeys(initially_collapsed);
        setFolderContents(tree);
        try {
          const bytes = await size(path);
          setFolderTotalBytes(bytes);
        } catch {
          setFolderTotalBytes(null);
        }
      } finally {
        setIsScanningFolder(false);
      }
    }
  }

  async function read_folder_contents(
    path: string,
    progress?: FolderScanProgress,
  ): Promise<TreeNode[]> {
    const entries = await readDir(path);
    const tree: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.isDirectory && !entry.isSymlink) {
        const childPath = await join(path, entry.name);
        tree.push({
          name: entry.name,
          isDirectory: true,
          isFile: false,
          isSymlink: false,
          children: await read_folder_contents(childPath, progress),
        });
      } else {
        progress?.onFile();
        tree.push({
          name: entry.name,
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
          isSymlink: entry.isSymlink,
        });
      }
    }
    return tree;
  }

  async function organize_folder_click() {
    setIsProposingChanges(true);
    try {
      const result = await organize_folder(
        folderContents,
        ignorePatterns.split(",").map((p) => p.trim()).filter(Boolean),
      );
      setOrganizeResult(result);
      console.log(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProposingChanges(false);
    }
  }

  function toggle_tree_node(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tree_stats = useMemo(() => count_tree_nodes(folderContents), [folderContents]);

  const showStats = selectedFolder && rootTreeLabel && !isScanningFolder;
  const totalSizeLabel =
    showStats && folderTotalBytes != null ? format_byte_size(folderTotalBytes) : "—";

  return (
    <div className="app-shell">
      <ControlsPanel
        onSelectFolder={open_folder_selector_dialog}
        isScanningFolder={isScanningFolder}
        selectedFolder={selectedFolder}
        rootTreeLabel={rootTreeLabel}
        fileCount={tree_stats.files}
        dirCount={tree_stats.dirs}
        folderTotalBytes={folderTotalBytes}
        totalSizeLabel={totalSizeLabel}
        ignorePatterns={ignorePatterns}
        onIgnorePatternsChange={setIgnorePatterns}
        onOrganize={organize_folder_click}
        isProposingChanges={isProposingChanges}
      />
      <TerminalPanel
        scanLineTyped={scanLineTyped}
        isScanningFolder={isScanningFolder}
        filesFoundCount={filesFoundCount}
        rootTreeLabel={rootTreeLabel}
        folderContents={folderContents}
        collapsedKeys={collapsedKeys}
        onToggleTreeNode={toggle_tree_node}
      />
      <ProposedChangesPanel
        isProposingChanges={isProposingChanges}
        organizeResult={organizeResult}
      />
    </div>
  );
}

export default App;
