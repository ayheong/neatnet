import { useEffect, useMemo, useState } from "react";
import { total_failed, type ApplyChangesResult } from "../lib/applyChanges";
import {
  apply_override_to_working_changes,
  build_preview_entries,
  collect_preview_folder_keys,
  count_visible_preview_tree_lines,
  derive_apply_changes,
  initial_pending_deletes_from_changes,
  preview_entries_to_tree,
} from "../lib/previewLayout";
import { tree_reveal_animation_ms } from "../lib/terminalTreeLines";
import { COPY, format_apply_report_message } from "../copy";
import { normalize_slashes } from "../lib/folderPaths";
import type { Change, OrganizeResult, TreeNode } from "../types";
import { PreviewLayoutTreeView } from "./PreviewLayoutTreeView";

type ProposedChangesPanelProps = {
  isProposingChanges?: boolean;
  isApplyingChanges?: boolean;
  organizeResult?: OrganizeResult | null;
  selectedFolder?: string;
  folderContents?: TreeNode[];
  rootTreeLabel?: string;
  applyReport?: ApplyChangesResult | null;
  applyError?: string | null;
  proposeError?: string | null;
  onAccept: (selectedChanges: Change[]) => void;
  onReject: () => void;
};

export function ProposedChangesPanel({
  isProposingChanges = false,
  isApplyingChanges = false,
  organizeResult = null,
  selectedFolder = "",
  folderContents = [],
  rootTreeLabel = "",
  applyReport = null,
  applyError = null,
  proposeError = null,
  onAccept,
  onReject,
}: ProposedChangesPanelProps) {
  const proposed_changes = organizeResult?.changes ?? [];

  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(() => new Set());
  const [pathOverrides, setPathOverrides] = useState<Map<string, string>>(new Map());
  const [workingChanges, setWorkingChanges] = useState<Change[]>([]);
  const [isTreeRevealing, setIsTreeRevealing] = useState(false);

  const changes_for_preview =
    workingChanges.length > 0 ? workingChanges : proposed_changes;

  const preview_entries = useMemo(
    () =>
      build_preview_entries(
        folderContents,
        changes_for_preview,
        pathOverrides,
        pendingDeletes,
      ),
    [folderContents, changes_for_preview, pathOverrides, pendingDeletes],
  );
  const preview_tree = useMemo(
    () => preview_entries_to_tree(preview_entries),
    [preview_entries],
  );

  const apply_changes = useMemo(
    () =>
      derive_apply_changes(
        changes_for_preview,
        pathOverrides,
        folderContents,
        pendingDeletes,
      ),
    [changes_for_preview, pathOverrides, folderContents, pendingDeletes],
  );

  const apply_count = apply_changes.length;
  const busy = isProposingChanges || isApplyingChanges;
  const has_proposal = Boolean(organizeResult);
  const show_preview = has_proposal && Boolean(rootTreeLabel);
  const show_waiting_for_preview = Boolean(selectedFolder) && !has_proposal && !busy;

  useEffect(() => {
    const changes = organizeResult?.changes ?? [];
    setPendingDeletes(initial_pending_deletes_from_changes(changes));
    setPathOverrides(new Map());
    setWorkingChanges(changes);
  }, [organizeResult]);

  useEffect(() => {
    if (!organizeResult || !show_preview) {
      setIsTreeRevealing(false);
      return;
    }
    setIsTreeRevealing(true);
  }, [organizeResult, show_preview]);

  useEffect(() => {
    if (!isTreeRevealing || !show_preview) return;
    const collapsed = new Set(collect_preview_folder_keys(preview_tree));
    const line_count = count_visible_preview_tree_lines(
      preview_tree,
      collapsed,
      Boolean(rootTreeLabel),
    );
    const id = window.setTimeout(
      () => setIsTreeRevealing(false),
      tree_reveal_animation_ms(line_count),
    );
    return () => window.clearTimeout(id);
  }, [isTreeRevealing, show_preview, preview_tree, rootTreeLabel]);

  function handle_toggle_delete(sourcePath: string) {
    const key = normalize_slashes(sourcePath);
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handle_move_file(sourcePath: string, newDisplayPath: string) {
    const normalized_source = normalize_slashes(sourcePath);
    const normalized_dest = normalize_slashes(newDisplayPath);
    setPathOverrides((prev) => {
      const next = new Map(prev);
      next.set(normalized_source, normalized_dest);
      return next;
    });
    setWorkingChanges((prev) =>
      apply_override_to_working_changes(prev, normalized_source, normalized_dest),
    );
  }

  function accept_click() {
    onAccept(apply_changes);
  }

  return (
    <section className="panel panel--changes" aria-label={COPY.preview.ariaLabel}>
      <header className="panel-terminal__titlebar">
        <span className="panel-terminal__title">
          <span className="panel-terminal__title-icon ti ti-wand" aria-hidden />
          {COPY.preview.title}
        </span>
      </header>
      <div className="panel-changes__frame">
        <div className="panel-changes__scroll" aria-busy={busy}>
          {isApplyingChanges ? (
            <p className="panel-changes__proposing-hint">{COPY.preview.applying}</p>
          ) : isProposingChanges ? (
            <p className="panel-changes__proposing-hint panel-changes__proposing-hint--pulse">
              {COPY.preview.planning}
            </p>
          ) : !selectedFolder ? (
            <p className="panel-changes__placeholder">{COPY.preview.emptyNoFolder}</p>
          ) : proposeError ? (
            <p className="panel-changes__apply-msg panel-changes__apply-msg--error" role="alert">
              {proposeError}
            </p>
          ) : show_preview ? (
            <PreviewLayoutTreeView
              entries={preview_entries}
              previewTree={preview_tree}
              rootLabel={rootTreeLabel}
              onMoveFile={handle_move_file}
              onToggleDelete={handle_toggle_delete}
              disabled={busy}
              isTreeRevealing={isTreeRevealing}
            />
          ) : applyReport || applyError ? null : (
            <p className="panel-changes__placeholder">{COPY.preview.emptyReady}</p>
          )}

          {applyError ? (
            <p className="panel-changes__apply-msg panel-changes__apply-msg--error" role="alert">
              {applyError}
            </p>
          ) : null}

          {applyReport ? (
            <p
              className={
                total_failed(applyReport.outcomes) > 0
                  ? "panel-changes__apply-msg panel-changes__apply-msg--warn"
                  : "panel-changes__apply-msg panel-changes__apply-msg--success"
              }
              role="status"
            >
              {format_apply_report_message(applyReport)}
            </p>
          ) : null}
        </div>
        <footer
          className={
            show_waiting_for_preview
              ? "panel-changes__footer panel-changes__footer--awaiting-proposal"
              : "panel-changes__footer"
          }
        >
          {show_waiting_for_preview ? (
            <span className="panel-changes__footer-hint">{COPY.preview.footerWaiting}</span>
          ) : null}
          <div className="panel-changes__footer-actions">
            <button
              type="button"
              className="panel-changes__btn panel-changes__btn--reject"
              onClick={onReject}
              disabled={busy || !has_proposal}
            >
              {COPY.preview.startOver}
            </button>
            <button
              type="button"
              className="panel-changes__btn panel-changes__btn--accept"
              disabled={busy || !has_proposal || apply_count === 0}
              onClick={accept_click}
            >
              {isApplyingChanges ? COPY.preview.applyingBtn : COPY.preview.apply}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
