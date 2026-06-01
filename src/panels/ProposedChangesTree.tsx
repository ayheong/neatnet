import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  build_proposed_changes_tree,
  collect_proposed_folder_keys,
  type ProposedChangeFolder,
  type ProposedChangeLeaf,
} from "../lib/proposedChangesTree";
import type { Change } from "../types";

type ProposedChangesTreeViewProps = {
  changes: Change[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
};

function is_expanded(collapsedKeys: Set<string>, key: string) {
  return !collapsedKeys.has(key);
}

function ProposedChangeFileLine({
  leaf,
  ancestor_prefix,
  branch,
  selectedIds,
  onToggle,
  disabled,
}: {
  leaf: ProposedChangeLeaf;
  ancestor_prefix: string;
  branch: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const is_delete = leaf.type === "delete";
  const selected = selectedIds.has(leaf.id);

  return (
    <button
      type="button"
      className={
        selected
          ? "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--selected"
          : "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--unselected"
      }
      aria-pressed={selected}
      aria-label={`${selected ? "Exclude" : "Include"} ${leaf.type}: ${leaf.from} → ${leaf.to || "remove"}`}
      title={is_delete ? `Remove: ${leaf.from}` : `${leaf.from} → ${leaf.to}`}
      disabled={disabled}
      onClick={() => onToggle(leaf.id)}
    >
      <span className="terminal-tree-line__glyphs">
        {ancestor_prefix}
        {branch}
      </span>
      <span className="terminal-tree-line__toggle-spacer" aria-hidden />
      <span
        className={
          is_delete
            ? "terminal-tree-line__icon ti ti-trash terminal-tree-line__icon--delete"
            : "terminal-tree-line__icon ti ti-file terminal-tree-line__icon--file"
        }
        aria-hidden
      />
      <span
        className={
          is_delete
            ? "terminal-tree-line__name terminal-tree-line__name--delete"
            : "terminal-tree-line__name terminal-tree-line__name--file"
        }
      >
        {leaf.fileName}
      </span>
    </button>
  );
}

function render_folder_tree(
  folders: ProposedChangeFolder[],
  ancestor_prefix: string,
  key_prefix: string,
  collapsedKeys: Set<string>,
  onToggleFolder: (key: string) => void,
  selectedIds: Set<string>,
  onToggleFile: (id: string) => void,
  disabled: boolean,
): ReactNode {
  return folders.map((folder, index) => {
    const is_last = index === folders.length - 1;
    const branch = is_last ? "└── " : "├── ";
    const child_ancestor = ancestor_prefix + (is_last ? "    " : "│   ");
    const key = `${key_prefix}/${folder.fullPath}`;
    const expanded = is_expanded(collapsedKeys, key);
    const has_children = folder.folders.length > 0 || folder.files.length > 0;

    return (
      <Fragment key={key}>
        <div className="terminal-tree-line panel-changes__tree-line">
          <span className="terminal-tree-line__glyphs">
            {ancestor_prefix}
            {branch}
          </span>
          {has_children ? (
            <button
              type="button"
              className="terminal-tree-line__toggle"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} folder ${folder.segment}`}
              onClick={() => onToggleFolder(key)}
            >
              {expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="terminal-tree-line__toggle-spacer" aria-hidden />
          )}
          <span
            className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
            aria-hidden
          />
          <span className="terminal-tree-line__name terminal-tree-line__name--dir">
            {folder.segment}/
          </span>
        </div>
        {expanded ? (
          <>
            {render_folder_tree(
              folder.folders,
              child_ancestor,
              key_prefix,
              collapsedKeys,
              onToggleFolder,
              selectedIds,
              onToggleFile,
              disabled,
            )}
            {folder.files.map((file, file_index) => {
              const file_branch =
                file_index === folder.files.length - 1 ? "└── " : "├── ";
              return (
                <ProposedChangeFileLine
                  key={file.id}
                  leaf={file}
                  ancestor_prefix={child_ancestor}
                  branch={file_branch}
                  selectedIds={selectedIds}
                  onToggle={onToggleFile}
                  disabled={disabled}
                />
              );
            })}
          </>
        ) : null}
      </Fragment>
    );
  });
}

function render_root_files(
  files: ProposedChangeLeaf[],
  ancestor_prefix: string,
  selectedIds: Set<string>,
  onToggle: (id: string) => void,
  disabled: boolean,
): ReactNode {
  return files.map((file, index) => {
    const is_last = index === files.length - 1;
    const branch = is_last ? "└── " : "├── ";
    return (
      <ProposedChangeFileLine
        key={file.id}
        leaf={file}
        ancestor_prefix={ancestor_prefix}
        branch={branch}
        selectedIds={selectedIds}
        onToggle={onToggle}
        disabled={disabled}
      />
    );
  });
}

export function ProposedChangesTreeView({
  changes,
  selectedIds,
  onToggle,
  disabled,
}: ProposedChangesTreeViewProps) {
  const tree = useMemo(() => build_proposed_changes_tree(changes), [changes]);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());

  useEffect(() => {
    const keys = collect_proposed_folder_keys(tree);
    setCollapsedKeys(new Set(keys.filter((key) => key !== "proposed:root")));
  }, [tree]);

  function toggle_folder(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const root_expanded = is_expanded(collapsedKeys, "proposed:root");
  const deletions_expanded = is_expanded(collapsedKeys, "proposed:deletions");
  const has_content =
    tree.folders.length > 0 || tree.rootFiles.length > 0 || tree.deletions.length > 0;

  if (!has_content) {
    return null;
  }

  const root_child_count =
    tree.folders.length + tree.rootFiles.length + (tree.deletions.length > 0 ? 1 : 0);

  return (
    <div className="panel-changes__tree">
      <p className="panel-changes__tree-hint">
        Click a change to include or exclude it.
      </p>
      <div className="terminal-tree-line terminal-tree-line--root panel-changes__tree-line">
        {root_child_count > 0 ? (
          <button
            type="button"
            className="terminal-tree-line__toggle"
            aria-expanded={root_expanded}
            aria-label={`${root_expanded ? "Collapse" : "Expand"} proposed layout`}
            onClick={() => toggle_folder("proposed:root")}
          >
            {root_expanded ? "▾" : "▸"}
          </button>
        ) : null}
        <span className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir" aria-hidden />
        <span className="terminal-tree-line__name terminal-tree-line__name--dir">proposed layout/</span>
      </div>
      {root_expanded ? (
        <>
          {render_folder_tree(
            tree.folders,
            "",
            "proposed",
            collapsedKeys,
            toggle_folder,
            selectedIds,
            onToggle,
            disabled,
          )}
          {render_root_files(tree.rootFiles, "", selectedIds, onToggle, disabled)}
          {tree.deletions.length > 0 ? (
            <>
              <div className="terminal-tree-line panel-changes__tree-line">
                <span className="terminal-tree-line__glyphs">
                  {tree.folders.length + tree.rootFiles.length > 0 ? "└── " : "├── "}
                </span>
                <button
                  type="button"
                  className="terminal-tree-line__toggle"
                  aria-expanded={deletions_expanded}
                  aria-label={`${deletions_expanded ? "Collapse" : "Expand"} deletions`}
                  onClick={() => toggle_folder("proposed:deletions")}
                >
                  {deletions_expanded ? "▾" : "▸"}
                </button>
                <span
                  className="terminal-tree-line__icon ti ti-trash terminal-tree-line__icon--delete-dir"
                  aria-hidden
                />
                <span className="terminal-tree-line__name terminal-tree-line__name--delete-dir">
                  (deletions)/
                </span>
              </div>
              {deletions_expanded
                ? tree.deletions.map((file, index) => {
                    const is_last = index === tree.deletions.length - 1;
                    const branch = is_last ? "└── " : "├── ";
                    return (
                      <ProposedChangeFileLine
                        key={file.id}
                        leaf={file}
                        ancestor_prefix="    "
                        branch={branch}
                        selectedIds={selectedIds}
                        onToggle={onToggle}
                        disabled={disabled}
                      />
                    );
                  })
                : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
