import { useEffect, useMemo, useState } from "react";
import { basename, join } from "@tauri-apps/api/path";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { readDir, size } from "@tauri-apps/plugin-fs";
import {
  SCAN_TYPING_LINE,
  SCAN_TYPING_MS_PER_CHAR,
  SCAN_MIN_DISPLAY_MS,
  MAX_FILES_TO_ORGANIZE,
  DEFAULT_SKIP_DIR_NAME_SET,
} from "./constants";
import { build_apply_confirm_message, COPY } from "./copy";
import {
  count_visible_terminal_tree_lines,
  tree_reveal_animation_ms,
} from "./lib/terminalTreeLines";
import { ControlsPanel } from "./panels/ControlsPanel";
import { ProposedChangesPanel } from "./panels/ProposedChangesPanel";
import { TerminalPanel } from "./panels/TerminalPanel";
import { apply_changes, ApplyValidationError } from "./lib/applyChanges";
import type { ApplyChangesResult } from "./lib/applyChanges";
import { flatten_tree_to_file_paths } from "./lib/folderPaths";
import { organize_folder } from "./lib/claude";
import {
  has_claude_api_key,
  load_claude_api_key,
  save_claude_api_key,
} from "./lib/claudeApiKey";
import type { Change, OrganizeResult, TreeNode } from "./types";
import "./App.css";
import { list_ollama_model_infos } from "./lib/ollama";
import type { OrganizeModelHost } from "./lib/claude";

type FolderScanProgress = {
  onFile: () => void;
};

type FolderScanState = {
  fileCount: number;
  stopped: boolean;
  truncated: boolean;
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
  const [userPreferences, setUserPreferences] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState(() => load_claude_api_key());
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);
  const [isProposingChanges, setIsProposingChanges] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [applyReport, setApplyReport] = useState<ApplyChangesResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [scanTruncated, setScanTruncated] = useState(false);
  const [isTreeRevealing, setIsTreeRevealing] = useState(false);
  const [modelHost, setModelHost] = useState<OrganizeModelHost>("claude");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaListError, setOllamaListError] = useState<string | null>(null);

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
    }, SCAN_TYPING_MS_PER_CHAR);
    return () => window.clearInterval(id);
  }, [isScanningFolder]);

  useEffect(() => {
    if (!isTreeRevealing) return;
    const line_count = count_visible_terminal_tree_lines(
      folderContents,
      collapsedKeys,
      rootTreeLabel,
    );
    const id = window.setTimeout(
      () => setIsTreeRevealing(false),
      tree_reveal_animation_ms(line_count),
    );
    return () => window.clearTimeout(id);
  }, [isTreeRevealing, folderContents, collapsedKeys, rootTreeLabel]);

  useEffect(() => {
    if (modelHost !== "ollama") return;
    let cancelled = false;
    setOllamaModelsLoading(true);
    setOllamaListError(null);
    list_ollama_model_infos()
      .then((models) => {
        if (cancelled) return;
        const names = models.map((m) => m.name);
        setOllamaModels(names);
        setSelectedOllamaModel((current) =>
          current && names.includes(current) ? current : "",
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setOllamaModels([]);
        setOllamaListError(
          e instanceof Error
            ? e.message
            : "Can't connect to Ollama. Open the Ollama app and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setOllamaModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelHost]);

  async function rescan_selected_folder(path: string) {
    setIsTreeRevealing(false);
    setFolderContents([]);
    setCollapsedKeys(new Set());
    setFilesFoundCount(0);
    setFolderTotalBytes(null);
    setScanTruncated(false);
    setIsScanningFolder(true);
    const scan_started_at = Date.now();

    const scan: FolderScanState = { fileCount: 0, stopped: false, truncated: false };
    let raf_flush: number = 0;
    const bump_file = () => {
      if (scan.stopped) return;
      scan.fileCount += 1;
      if (raf_flush !== 0) return;
      raf_flush = window.requestAnimationFrame(() => {
        raf_flush = 0;
        setFilesFoundCount(scan.fileCount);
      });
    };

    try {
      const label = await basename(path);
      setRootTreeLabel(label);
      const tree = await read_folder_contents(path, scan, { onFile: bump_file });
      if (raf_flush !== 0) {
        window.cancelAnimationFrame(raf_flush);
        raf_flush = 0;
      }
      setFilesFoundCount(scan.fileCount);
      setScanTruncated(scan.truncated);
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
      const typing_ms = SCAN_TYPING_LINE.length * SCAN_TYPING_MS_PER_CHAR;
      const min_display_ms = Math.max(SCAN_MIN_DISPLAY_MS, typing_ms + 320);
      const elapsed = Date.now() - scan_started_at;
      if (elapsed < min_display_ms) {
        await new Promise((resolve) => window.setTimeout(resolve, min_display_ms - elapsed));
      }
      setIsScanningFolder(false);
      setIsTreeRevealing(true);
    }
  }

  async function open_folder_selector_dialog() {
    const folder = await open({
      multiple: false,
      directory: true,
    });
    if (folder) {
      const path = folder as string;
      setSelectedFolder(path);
      setOrganizeResult(null);
      setProposeError(null);
      setApplyReport(null);
      setApplyError(null);
      await rescan_selected_folder(path);
    }
  }

  async function read_folder_contents(
    path: string,
    scan: FolderScanState,
    progress?: FolderScanProgress,
    depth = 0,
  ): Promise<TreeNode[]> {
    if (scan.stopped || depth > 48) return [];

    const entries = await readDir(path);
    const tree: TreeNode[] = [];
    for (const entry of entries) {
      if (scan.stopped) break;

      if (entry.isDirectory) {
        if (DEFAULT_SKIP_DIR_NAME_SET.has(entry.name.toLowerCase())) continue;

        const childPath = await join(path, entry.name);
        tree.push({
          name: entry.name,
          isDirectory: true,
          isFile: false,
          isSymlink: entry.isSymlink,
          children: await read_folder_contents(childPath, scan, progress, depth + 1),
        });
      } else {
        if (scan.fileCount >= MAX_FILES_TO_ORGANIZE) {
          scan.stopped = true;
          scan.truncated = true;
          break;
        }
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

  const tree_stats = useMemo(() => count_tree_nodes(folderContents), [folderContents]);

  async function organize_folder_click() {
    if (!selectedFolder || tree_stats.files === 0 || tree_stats.files > MAX_FILES_TO_ORGANIZE) {
      return;
    }
    setApplyReport(null);
    setApplyError(null);
    setProposeError(null);
    setOrganizeResult(null);
    setIsProposingChanges(true);
    try {
      const result = await organize_folder(folderContents, userPreferences, {
        host: modelHost,
        claude_api_key: claudeApiKey,
        ollama_model: selectedOllamaModel,
        ollama_installed_models: ollamaModels,
      });
      setOrganizeResult(result);
    } catch (e) {
      console.error(e);
      setProposeError(
        e instanceof Error ? e.message : COPY.errors.organizeFailed,
      );
    } finally {
      setIsProposingChanges(false);
    }
  }

  async function apply_changes_click(selectedChanges: Change[]) {
    if (!selectedFolder || selectedChanges.length === 0 || isApplyingChanges) {
      return;
    }

    const confirmed = await confirm(
      build_apply_confirm_message(selectedChanges),
      {
        title: COPY.confirm.title,
        kind: "warning",
        okLabel: COPY.confirm.ok,
        cancelLabel: COPY.confirm.cancel,
      },
    );
    if (!confirmed) return;

    setApplyReport(null);
    setApplyError(null);
    setIsApplyingChanges(true);
    try {
      const report = await apply_changes(
        selectedFolder,
        selectedChanges,
        flatten_tree_to_file_paths(folderContents),
      );
      setApplyReport(report);
      setOrganizeResult(null);
      await rescan_selected_folder(selectedFolder);
    } catch (error) {
      const message =
        error instanceof ApplyValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : COPY.errors.applyFailed;
      setApplyError(message);
    } finally {
      setIsApplyingChanges(false);
    }
  }

  function reject_proposed_changes() {
    setOrganizeResult(null);
    setProposeError(null);
    setApplyReport(null);
    setApplyError(null);
  }

  function toggle_tree_node(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const showStats = selectedFolder && rootTreeLabel && !isScanningFolder;
  const totalSizeLabel =
    showStats && folderTotalBytes != null ? format_byte_size(folderTotalBytes) : "—";

  function update_claude_api_key(value: string) {
    setClaudeApiKey(value);
    save_claude_api_key(value);
  }

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
        userPreferences={userPreferences}
        onUserPreferencesChange={setUserPreferences}
        claudeApiKey={claudeApiKey}
        onClaudeApiKeyChange={update_claude_api_key}
        hasClaudeApiKey={has_claude_api_key(claudeApiKey)}
        modelHost={modelHost}
        onModelHostChange={setModelHost}
        ollamaModels={ollamaModels}
        selectedOllamaModel={selectedOllamaModel}
        onSelectedOllamaModelChange={setSelectedOllamaModel}
        ollamaModelsLoading={ollamaModelsLoading}
        ollamaListError={ollamaListError}
        onOrganize={organize_folder_click}
        isProposingChanges={isProposingChanges}
        isApplyingChanges={isApplyingChanges}
        scanTruncated={scanTruncated}
        overFileLimit={tree_stats.files > MAX_FILES_TO_ORGANIZE}
      />
      <TerminalPanel
        scanLineTyped={scanLineTyped}
        isScanningFolder={isScanningFolder}
        isTreeRevealing={isTreeRevealing}
        filesFoundCount={filesFoundCount}
        rootTreeLabel={rootTreeLabel}
        folderContents={folderContents}
        collapsedKeys={collapsedKeys}
        onToggleTreeNode={toggle_tree_node}
      />
      <ProposedChangesPanel
        isProposingChanges={isProposingChanges}
        isApplyingChanges={isApplyingChanges}
        organizeResult={organizeResult}
        selectedFolder={selectedFolder}
        folderContents={folderContents}
        rootTreeLabel={rootTreeLabel}
        applyReport={applyReport}
        applyError={applyError}
        proposeError={proposeError}
        onAccept={apply_changes_click}
        onReject={reject_proposed_changes}
      />
    </div>
  );
}

export default App;
