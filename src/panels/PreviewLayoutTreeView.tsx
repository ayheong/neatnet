import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PREVIEW_ROOT_KEY,
  basename,
  move_preview_file_to_folder,
  parent_folder_path,
  type PreviewFileEntry,
} from "../lib/previewLayout";
import { COPY } from "../copy";
import { next_tree_reveal_style, with_tree_reveal_class } from "../lib/treeReveal";
import type { TreeNode } from "../types";

type PreviewLayoutTreeViewProps = {
  entries: PreviewFileEntry[];
  previewTree: TreeNode[];
  rootLabel: string;
  onMoveFile: (sourcePath: string, newDisplayPath: string) => void;
  onToggleDelete: (sourcePath: string) => void;
  disabled: boolean;
  isTreeRevealing?: boolean;
};

function is_expanded(collapsedKeys: Set<string>, key: string) {
  return !collapsedKeys.has(key);
}

const POINTER_DRAG_THRESHOLD_PX = 5;

type DropHover = {
  dropKey: string;
  insertBefore: boolean;
};

function drop_target_from_point(
  clientX: number,
  clientY: number,
  draggingSourcePath: string | null,
): DropHover & { folderPath: string } | null {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return null;
  const zone = element.closest("[data-drop-folder]");
  if (!zone) return null;

  const source_on_zone = zone.getAttribute("data-source-path");
  if (draggingSourcePath && source_on_zone === draggingSourcePath) {
    return null;
  }

  const dropKey = zone.getAttribute("data-drop-key");
  if (!dropKey) return null;

  const rect = zone.getBoundingClientRect();
  const insertBefore = clientY < rect.top + rect.height / 2;

  return {
    folderPath: zone.getAttribute("data-drop-folder") ?? "",
    dropKey,
    insertBefore,
  };
}

export function PreviewLayoutTreeView({
  entries,
  previewTree,
  rootLabel,
  onMoveFile,
  onToggleDelete,
  disabled,
  isTreeRevealing = false,
}: PreviewLayoutTreeViewProps) {
  const entry_by_source = useMemo(() => {
    const map = new Map<string, PreviewFileEntry>();
    for (const e of entries) map.set(e.sourcePath, e);
    return map;
  }, [entries]);

  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());
  const [dragHover, setDragHover] = useState<DropHover | null>(null);
  const [is_dragging_file, setIsDraggingFile] = useState(false);
  const [draggingSourcePath, setDraggingSourcePath] = useState<string | null>(null);
  const pointer_drag_ref = useRef<{
    sourcePath: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const pointer_capture_ref = useRef<HTMLElement | null>(null);
  const pointer_drag_moved_ref = useRef(false);
  const entries_ref = useRef(entries);
  entries_ref.current = entries;
  const on_move_file_ref = useRef(onMoveFile);
  on_move_file_ref.current = onMoveFile;
  const on_toggle_delete_ref = useRef(onToggleDelete);
  on_toggle_delete_ref.current = onToggleDelete;
  const line_index = { current: 0 };

  useEffect(() => {
    function try_move_to_folder(sourcePath: string, folderDisplayPath: string) {
      if (disabled) return;
      const entry = entries_ref.current.find((e) => e.sourcePath === sourcePath);
      if (!entry) return;
      const newPath = move_preview_file_to_folder(
        sourcePath,
        entry.displayPath,
        folderDisplayPath,
      );
      if (newPath === entry.displayPath) return;
      on_move_file_ref.current(sourcePath, newPath);
    }

    function finish_pointer_drag(clientX: number, clientY: number) {
      const drag = pointer_drag_ref.current;
      pointer_drag_ref.current = null;
      if (!drag?.active) return;

      const target = drop_target_from_point(
        clientX,
        clientY,
        drag.sourcePath,
      );
      if (target) {
        try_move_to_folder(drag.sourcePath, target.folderPath);
      }

      setIsDraggingFile(false);
      setDraggingSourcePath(null);
      setDragHover(null);
    }

    function on_pointer_move(event: PointerEvent) {
      const drag = pointer_drag_ref.current;
      if (!drag) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (dx * dx + dy * dy < POINTER_DRAG_THRESHOLD_PX * POINTER_DRAG_THRESHOLD_PX) {
          return;
        }
        drag.active = true;
        pointer_drag_moved_ref.current = true;
        setDraggingSourcePath(drag.sourcePath);
        setIsDraggingFile(true);
      }

      const target = drop_target_from_point(
        event.clientX,
        event.clientY,
        drag.sourcePath,
      );
      setDragHover(
        target ? { dropKey: target.dropKey, insertBefore: target.insertBefore } : null,
      );
    }

    function release_pointer_capture(event: PointerEvent) {
      const element = pointer_capture_ref.current;
      if (!element) return;
      try {
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* pointer may already be released */
      }
      pointer_capture_ref.current = null;
    }

    function on_pointer_up(event: PointerEvent) {
      const drag = pointer_drag_ref.current;
      release_pointer_capture(event);
      if (!drag) return;
      if (drag.active) {
        finish_pointer_drag(event.clientX, event.clientY);
        return;
      }
      pointer_drag_ref.current = null;
    }

    function on_pointer_cancel(event: PointerEvent) {
      release_pointer_capture(event);
      pointer_drag_ref.current = null;
      setIsDraggingFile(false);
      setDraggingSourcePath(null);
      setDragHover(null);
    }
    window.addEventListener("pointermove", on_pointer_move);
    window.addEventListener("pointerup", on_pointer_up);
    window.addEventListener("pointercancel", on_pointer_cancel);
    return () => {
      window.removeEventListener("pointermove", on_pointer_move);
      window.removeEventListener("pointerup", on_pointer_up);
      window.removeEventListener("pointercancel", on_pointer_cancel);
    };
  }, [disabled]);

  function start_pointer_drag(event: ReactPointerEvent<HTMLDivElement>, sourcePath: string) {
    if (disabled || event.button !== 0) return;
    const element = event.currentTarget;
    pointer_capture_ref.current = element;
    element.setPointerCapture(event.pointerId);
    pointer_drag_moved_ref.current = false;
    pointer_drag_ref.current = {
      sourcePath,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }

  function handle_file_click(sourcePath: string) {
    if (disabled || pointer_drag_moved_ref.current) {
      pointer_drag_moved_ref.current = false;
      return;
    }
    on_toggle_delete_ref.current(sourcePath);
  }

  function folder_drop_attrs(folderDisplayPath: string, dropKey: string) {
    return {
      "data-drop-folder": folderDisplayPath,
      "data-drop-key": dropKey,
    };
  }

  useEffect(() => {
    setCollapsedKeys(new Set());
  }, [previewTree]);

  function toggle_folder(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function render_file_line(
    entry: PreviewFileEntry,
    ancestor_prefix: string,
    branch: string,
  ) {
    const row_class = entry.isPendingDelete
      ? "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--preview-deleted panel-changes__tree-line--clickable"
      : "terminal-tree-line panel-changes__tree-line panel-changes__tree-line--file panel-changes__tree-line--clickable";

    const title = entry.isPendingDelete
      ? `${entry.sourcePath} — click to keep`
      : entry.displayPath !== entry.sourcePath
        ? `${entry.sourcePath} → ${entry.displayPath} — click to mark for deletion`
        : `${entry.sourcePath} — click to mark for deletion`;

    const parent_folder = parent_folder_path(entry.displayPath);
    const drop_key = `file:${entry.sourcePath}`;
    const is_hover = dragHover?.dropKey === drop_key;
    const drop_line_class = is_hover
      ? dragHover.insertBefore
        ? "panel-changes__tree-line--drop-before"
        : "panel-changes__tree-line--drop-after"
      : "";
    const is_source = draggingSourcePath === entry.sourcePath;

    const inner = (
      <>
        <span className="terminal-tree-line__glyphs">
          {ancestor_prefix}
          {branch}
        </span>
        <span className="terminal-tree-line__toggle-spacer" aria-hidden />
        <span
          className="terminal-tree-line__icon ti ti-file terminal-tree-line__icon--file"
          aria-hidden
        />
        <span className="terminal-tree-line__name terminal-tree-line__name--file">
          {basename(entry.displayPath)}
        </span>
      </>
    );

    const pointer_props = disabled
      ? {}
      : {
          onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) =>
            start_pointer_drag(event, entry.sourcePath),
        };

    return (
      <div
        key={entry.sourcePath}
        role="button"
        tabIndex={disabled ? undefined : 0}
        className={with_tree_reveal_class(
          isTreeRevealing,
          `${row_class} panel-changes__tree-drop-zone${disabled || entry.isPendingDelete ? "" : " panel-changes__tree-line--draggable"}${is_source ? " panel-changes__tree-line--dragging-source" : ""}${drop_line_class ? ` ${drop_line_class}` : ""}`,
        )}
        style={next_tree_reveal_style(isTreeRevealing, line_index)}
        title={title}
        aria-pressed={entry.isPendingDelete}
        aria-label={
          entry.isPendingDelete
            ? `${basename(entry.sourcePath)}, marked for deletion`
            : basename(entry.displayPath)
        }
        data-drop-folder={parent_folder}
        data-drop-key={drop_key}
        data-source-path={entry.sourcePath}
        onClick={() => handle_file_click(entry.sourcePath)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            on_toggle_delete_ref.current(entry.sourcePath);
          }
        }}
        {...pointer_props}
      >
        {inner}
      </div>
    );
  }

  function render_nodes(
    nodes: TreeNode[],
    ancestor_prefix: string,
    path_prefix: string,
    relative_prefix: string,
  ): ReactNode {
    return nodes.map((node, index) => {
      const is_last = index === nodes.length - 1;
      const branch = is_last ? "└── " : "├── ";
      const child_ancestor = ancestor_prefix + (is_last ? "    " : "│   ");
      const key = node.previewSourcePath
        ? `file:${node.previewSourcePath}`
        : `${path_prefix}:${index}:${node.name}`;
      const relative = relative_prefix ? `${relative_prefix}/${node.name}` : node.name;

      if (node.previewSourcePath) {
        const entry = entry_by_source.get(node.previewSourcePath);
        if (!entry) return null;
        return render_file_line(entry, ancestor_prefix, branch);
      }

      if (node.isDirectory) {
        const has_children = node.children !== undefined && node.children.length > 0;
        const expanded = is_expanded(collapsedKeys, key);
        const drop_active = dragHover?.dropKey === key;

        const folder_row = (
          <>
            <span className="terminal-tree-line__glyphs">
              {ancestor_prefix}
              {branch}
            </span>
            {has_children ? (
              <button
                type="button"
                className="terminal-tree-line__toggle"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle_folder(key);
                }}
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
              {node.name}/
            </span>
          </>
        );

        const folder_drop = folder_drop_attrs(relative, key);

        return (
          <Fragment key={key}>
            <div
              className={with_tree_reveal_class(
                isTreeRevealing,
                `terminal-tree-line panel-changes__tree-line panel-changes__tree-drop-zone${drop_active ? " panel-changes__tree-line--drop-target" : ""}`,
              )}
              style={next_tree_reveal_style(isTreeRevealing, line_index)}
              {...folder_drop}
            >
              <div className="panel-changes__tree-folder-row">{folder_row}</div>
            </div>
            {has_children && expanded
              ? render_nodes(node.children!, child_ancestor, `${key}/`, relative)
              : null}
          </Fragment>
        );
      }

      return null;
    });
  }

  const root_expanded = is_expanded(collapsedKeys, PREVIEW_ROOT_KEY);
  const root_has_children = previewTree.length > 0;
  const root_drop_active = dragHover?.dropKey === PREVIEW_ROOT_KEY;

  if (!rootLabel) return null;

  return (
    <div
      className={
        isTreeRevealing
          ? "panel-changes__tree panel-changes__tree--revealing"
          : is_dragging_file
            ? "panel-changes__tree panel-changes__tree--dragging"
            : "panel-changes__tree"
      }
    >
      <p className="panel-changes__tree-hint">{COPY.preview.hint}</p>
      <div
        className={with_tree_reveal_class(
          isTreeRevealing,
          `terminal-tree-line terminal-tree-line--root panel-changes__tree-line panel-changes__tree-drop-zone${root_drop_active ? " panel-changes__tree-line--drop-target" : ""}`,
        )}
        style={next_tree_reveal_style(isTreeRevealing, line_index)}
        {...folder_drop_attrs("", PREVIEW_ROOT_KEY)}
      >
        {root_has_children ? (
          <button
            type="button"
            className="terminal-tree-line__toggle"
            aria-expanded={root_expanded}
            aria-label={`${root_expanded ? "Collapse" : "Expand"} ${rootLabel}`}
            disabled={disabled}
            onClick={() => toggle_folder(PREVIEW_ROOT_KEY)}
          >
            {root_expanded ? "▾" : "▸"}
          </button>
        ) : null}
        <span
          className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
          aria-hidden
        />
        <span className="terminal-tree-line__name terminal-tree-line__name--dir">
          {rootLabel}/
        </span>
      </div>
      {root_expanded && root_has_children
        ? render_nodes(previewTree, "", "preview", "")
        : null}
    </div>
  );
}
