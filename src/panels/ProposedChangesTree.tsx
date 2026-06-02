import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  build_proposed_changes_tree,
  collect_folder_leaf_ids,
  folder_selection_state,
  initial_proposed_tree_collapsed_keys,
  type ProposedChangeFolder,
  type ProposedChangeLeaf,
} from "../lib/proposedChangesTree";
import { next_tree_reveal_style, with_tree_reveal_class } from "../lib/treeReveal";
import type { Change } from "../types";

type ProposedChangesTreeViewProps = {
  changes: Change[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSetSelection: (ids: string[], selected: boolean) => void;
  disabled: boolean;
  isTreeRevealing?: boolean;
};

function click_folder_selection(
  leaf_ids: string[],
  selectedIds: Set<string>,
  onSetSelection: (ids: string[], selected: boolean) => void,
) {
  if (leaf_ids.length === 0) return;
  const state = folder_selection_state(leaf_ids, selectedIds);
  onSetSelection(leaf_ids, state !== "all");
}

function ProposedChangeFolderLine({
  ancestor_prefix,
  branch,
  label,
  leaf_ids,
  selectedIds,
  onSetSelection,
  disabled,
  isTreeRevealing,
  line_index,
  expanded,
  has_children,
  onToggleExpand,
  expand_label,
  icon_class,
  name_class,
  extra_line_class = "",
}: {
  ancestor_prefix: string;
  branch: string;
  label: string;
  leaf_ids: string[];
  selectedIds: Set<string>;
  onSetSelection: (ids: string[], selected: boolean) => void;
  disabled: boolean;
  isTreeRevealing: boolean;
  line_index: { current: number };
  expanded: boolean;
  has_children: boolean;
  onToggleExpand: () => void;
  expand_label: string;
  icon_class: string;
  name_class: string;
  extra_line_class?: string;
}) {
  const selection = folder_selection_state(leaf_ids, selectedIds);
  const all_selected = selection === "all";
  const can_select = leaf_ids.length > 0 && !disabled;

  return (
    <div
      className={with_tree_reveal_class(
        isTreeRevealing,
        `terminal-tree-line panel-changes__tree-line${extra_line_class}`,
      )}
      style={next_tree_reveal_style(isTreeRevealing, line_index)}
    >
      <span className="terminal-tree-line__glyphs">
        {ancestor_prefix}
        {branch}
      </span>
      {has_children ? (
        <button
          type="button"
          className="terminal-tree-line__toggle"
          aria-expanded={expanded}
          aria-label={expand_label}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="terminal-tree-line__toggle-spacer" aria-hidden />
      )}
      <button
        type="button"
        className="panel-changes__tree-folder-hit"
        aria-pressed={all_selected}
        aria-label={`${all_selected ? "Exclude" : "Include"} all changes in ${label}`}
        title={
          selection === "partial"
            ? "Click to include all changes in this folder"
            : all_selected
              ? "Click to exclude all changes in this folder"
              : "Click to include all changes in this folder"
        }
        disabled={!can_select}
        onClick={() => click_folder_selection(leaf_ids, selectedIds, onSetSelection)}
      >
        <span className={icon_class} aria-hidden />
        <span className={name_class}>{label}</span>
      </button>
    </div>
  );
}

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
  isTreeRevealing,
  line_index,
}: {
  leaf: ProposedChangeLeaf;
  ancestor_prefix: string;
  branch: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
  isTreeRevealing: boolean;
  line_index: { current: number };
}) {
  const is_delete = leaf.type === "delete";
  const selected = selectedIds.has(leaf.id);
  const base_class = selected
    ? "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--selected"
    : "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--unselected";

  return (
    <button
      type="button"
      className={with_tree_reveal_class(isTreeRevealing, base_class)}
      style={next_tree_reveal_style(isTreeRevealing, line_index)}
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
  onSetSelection: (ids: string[], selected: boolean) => void,
  disabled: boolean,
  isTreeRevealing: boolean,
  line_index: { current: number },
): ReactNode {
  return folders.map((folder, index) => {
    const is_last = index === folders.length - 1;
    const branch = is_last ? "└── " : "├── ";
    const child_ancestor = ancestor_prefix + (is_last ? "    " : "│   ");
    const key = `${key_prefix}/${folder.fullPath}`;
    const expanded = is_expanded(collapsedKeys, key);
    const has_children = folder.folders.length > 0 || folder.files.length > 0;
    const leaf_ids = collect_folder_leaf_ids(folder);

    return (
      <Fragment key={key}>
        <ProposedChangeFolderLine
          ancestor_prefix={ancestor_prefix}
          branch={branch}
          label={`${folder.segment}/`}
          leaf_ids={leaf_ids}
          selectedIds={selectedIds}
          onSetSelection={onSetSelection}
          disabled={disabled}
          isTreeRevealing={isTreeRevealing}
          line_index={line_index}
          expanded={expanded}
          has_children={has_children}
          onToggleExpand={() => onToggleFolder(key)}
          expand_label={`${expanded ? "Collapse" : "Expand"} folder ${folder.segment}`}
          icon_class="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
          name_class="terminal-tree-line__name terminal-tree-line__name--dir"
        />
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
              onSetSelection,
              disabled,
              isTreeRevealing,
              line_index,
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
                  isTreeRevealing={isTreeRevealing}
                  line_index={line_index}
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
  isTreeRevealing: boolean,
  line_index: { current: number },
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
        isTreeRevealing={isTreeRevealing}
        line_index={line_index}
      />
    );
  });
}

export function ProposedChangesTreeView({
  changes,
  selectedIds,
  onToggle,
  onSetSelection,
  disabled,
  isTreeRevealing = false,
}: ProposedChangesTreeViewProps) {
  const tree = useMemo(() => build_proposed_changes_tree(changes), [changes]);
  const [collapsedKeys, setCollapsedKeys] = useState(() =>
    initial_proposed_tree_collapsed_keys(tree),
  );
  const line_index = { current: 0 };

  useEffect(() => {
    setCollapsedKeys(initial_proposed_tree_collapsed_keys(tree));
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
    <div
      className={
        isTreeRevealing
          ? "panel-changes__tree panel-changes__tree--revealing"
          : "panel-changes__tree"
      }
    >
      <p className="panel-changes__tree-hint">
        Click a file or folder to include or exclude changes.
      </p>
      <div
        className={with_tree_reveal_class(
          isTreeRevealing,
          "terminal-tree-line terminal-tree-line--root panel-changes__tree-line",
        )}
        style={next_tree_reveal_style(isTreeRevealing, line_index)}
      >
        {root_child_count > 0 ? (
          <button
            type="button"
            className="terminal-tree-line__toggle"
            aria-expanded={root_expanded}
            aria-label={`${root_expanded ? "Collapse" : "Expand"} proposed layout`}
            disabled={disabled}
            onClick={() => toggle_folder("proposed:root")}
          >
            {root_expanded ? "▾" : "▸"}
          </button>
        ) : null}
        <span
          className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
          aria-hidden
        />
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
            onSetSelection,
            disabled,
            isTreeRevealing,
            line_index,
          )}
          {render_root_files(
            tree.rootFiles,
            "",
            selectedIds,
            onToggle,
            disabled,
            isTreeRevealing,
            line_index,
          )}
          {tree.deletions.length > 0 ? (
            <>
              <ProposedChangeFolderLine
                ancestor_prefix=""
                branch={tree.folders.length + tree.rootFiles.length > 0 ? "└── " : "├── "}
                label="(deletions)/"
                leaf_ids={tree.deletions.map((file) => file.id)}
                selectedIds={selectedIds}
                onSetSelection={onSetSelection}
                disabled={disabled}
                isTreeRevealing={isTreeRevealing}
                line_index={line_index}
                expanded={deletions_expanded}
                has_children
                onToggleExpand={() => toggle_folder("proposed:deletions")}
                expand_label={`${deletions_expanded ? "Collapse" : "Expand"} deletions`}
                icon_class="terminal-tree-line__icon ti ti-trash terminal-tree-line__icon--delete-dir"
                name_class="terminal-tree-line__name terminal-tree-line__name--delete-dir"
              />
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
                        isTreeRevealing={isTreeRevealing}
                        line_index={line_index}
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
