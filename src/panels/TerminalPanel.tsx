import { Fragment, type ReactNode } from "react";
import { ROOT_TREE_KEY, SCAN_TYPING_LINE } from "../constants";
import type { TreeNode } from "../types";

type TerminalPanelProps = {
  scanLineTyped: string;
  isScanningFolder: boolean;
  filesFoundCount: number;
  rootTreeLabel: string;
  folderContents: TreeNode[];
  collapsedKeys: Set<string>;
  onToggleTreeNode: (key: string) => void;
};

function is_tree_node_expanded(collapsedKeys: Set<string>, key: string) {
  return !collapsedKeys.has(key);
}

function render_tree_lines(
  nodes: TreeNode[],
  ancestor_prefix: string,
  path_prefix: string,
  collapsedKeys: Set<string>,
  onToggleTreeNode: (key: string) => void,
): ReactNode {
  return nodes.map((node, index) => {
    const is_last = index === nodes.length - 1;
    const branch = is_last ? "└── " : "├── ";
    const child_ancestor = ancestor_prefix + (is_last ? "    " : "│   ");
    const key = `${path_prefix}:${index}:${node.name}`;
    const has_children =
      node.isDirectory && node.children !== undefined && node.children.length > 0;
    const expanded = is_tree_node_expanded(collapsedKeys, key);

    const toggle_column = has_children ? (
      <button
        type="button"
        className="terminal-tree-line__toggle"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} folder ${node.name}`}
        onClick={() => onToggleTreeNode(key)}
      >
        {expanded ? "▾" : "▸"}
      </button>
    ) : (
      <span className="terminal-tree-line__toggle-spacer" aria-hidden />
    );

    return (
      <Fragment key={key}>
        <div className="terminal-tree-line">
          <span className="terminal-tree-line__glyphs">
            {ancestor_prefix}
            {branch}
          </span>
          {toggle_column}
          <span
            className={
              node.isDirectory
                ? "terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
                : "terminal-tree-line__icon ti ti-file terminal-tree-line__icon--file"
            }
            aria-hidden
          />
          <span
            className={
              node.isDirectory
                ? "terminal-tree-line__name terminal-tree-line__name--dir"
                : "terminal-tree-line__name terminal-tree-line__name--file"
            }
          >
            {node.isDirectory ? `${node.name}/` : node.name}
          </span>
        </div>
        {has_children && expanded
          ? render_tree_lines(
              node.children!,
              child_ancestor,
              `${key}/`,
              collapsedKeys,
              onToggleTreeNode,
            )
          : null}
      </Fragment>
    );
  });
}

export function TerminalPanel({
  scanLineTyped,
  isScanningFolder,
  filesFoundCount,
  rootTreeLabel,
  folderContents,
  collapsedKeys,
  onToggleTreeNode,
}: TerminalPanelProps) {
  const root_has_children = rootTreeLabel !== "" && folderContents.length > 0;
  const root_expanded =
    rootTreeLabel !== "" && is_tree_node_expanded(collapsedKeys, ROOT_TREE_KEY);

  return (
    <section className="panel panel--terminal" aria-label="Folder tree output">
      <header className="panel-terminal__titlebar">
        <span className="panel-terminal__title">
          <span className="panel-terminal__title-icon ti ti-folder-open" aria-hidden />
          current tree{rootTreeLabel ? ` — ${rootTreeLabel}` : ""}
        </span>
      </header>
      <div className="panel-terminal__body">
        {isScanningFolder ? (
          <div className="panel-terminal__scan" aria-live="polite">
            <p className="panel-terminal__scan-line">
              <span className="terminal-tree-line__glyphs">$  </span>
              <span
                className={
                  scanLineTyped.length >= SCAN_TYPING_LINE.length
                    ? "panel-terminal__scan-typed panel-terminal__scan-typed--done"
                    : "panel-terminal__scan-typed"
                }
              >
                {scanLineTyped}
              </span>
              {scanLineTyped.length < SCAN_TYPING_LINE.length && (
                <span className="panel-terminal__scan-caret" aria-hidden>
                  █
                </span>
              )}
            </p>
            <p className="panel-terminal__scan-counter">
              <span className="terminal-tree-line__glyphs">&gt; </span>
              <span className="panel-terminal__scan-counter-label">files found:</span>{" "}
              <span className="panel-terminal__scan-counter-value">{filesFoundCount}</span>
              <span className="panel-terminal__scan-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </p>
          </div>
        ) : rootTreeLabel === "" ? (
          <p className="panel-terminal__placeholder">
            <span className="terminal-tree-line__glyphs">$ </span>
            <span className="panel-terminal__muted">Select a folder to list contents…</span>
          </p>
        ) : (
          <>
            <div className="terminal-tree-line terminal-tree-line--root">
              {root_has_children ? (
                <button
                  type="button"
                  className="terminal-tree-line__toggle"
                  aria-expanded={root_expanded}
                  aria-label={`${root_expanded ? "Collapse" : "Expand"} folder ${rootTreeLabel}`}
                  onClick={() => onToggleTreeNode(ROOT_TREE_KEY)}
                >
                  {root_expanded ? "▾" : "▸"}
                </button>
              ) : null}
              <span
                className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
                aria-hidden
              />
              <span className="terminal-tree-line__name terminal-tree-line__name--dir">
                {rootTreeLabel}/
              </span>
            </div>
            {root_has_children && root_expanded
              ? render_tree_lines(folderContents, "", "", collapsedKeys, onToggleTreeNode)
              : null}
          </>
        )}
        <span className="panel-terminal__cursor" aria-hidden>
          █
        </span>
      </div>
    </section>
  );
}
