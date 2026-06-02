import { useEffect, useMemo, useState } from "react";
import type { ApplyChangesResult } from "../lib/applyChanges";
import {
  build_proposed_changes_tree,
  count_visible_proposed_tree_lines,
  initial_proposed_tree_collapsed_keys,
} from "../lib/proposedChangesTree";
import { tree_reveal_animation_ms } from "../lib/terminalTreeLines";
import type { Change, OrganizeResult } from "../types";
import { ProposedChangesTreeView } from "./ProposedChangesTree";

type ProposedChangesPanelProps = {
  isProposingChanges?: boolean;
  isApplyingChanges?: boolean;
  organizeResult?: OrganizeResult | null;
  selectedFolder?: string;
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
  applyReport = null,
  applyError = null,
  proposeError = null,
  onAccept,
  onReject,
}: ProposedChangesPanelProps) {
  const proposed_changes = organizeResult?.changes ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor_popout, setCursorPopout] = useState<{ x: number; y: number } | null>(null);
  const [isTreeRevealing, setIsTreeRevealing] = useState(false);
  const proposed_tree = useMemo(
    () => (proposed_changes.length > 0 ? build_proposed_changes_tree(proposed_changes) : null),
    [proposed_changes],
  );
  const selected_count = selectedIds.size;
  const total_count = proposed_changes.length;
  const busy = isProposingChanges || isApplyingChanges;
  const has_proposal = Boolean(organizeResult);
  const show_propose_first_hint = Boolean(selectedFolder) && !has_proposal && !busy;

  const title_suffix = isApplyingChanges
    ? " — applying…"
    : isProposingChanges
      ? " — planning…"
      : organizeResult
        ? ` — ${selected_count} / ${total_count} selected`
        : "";

  useEffect(() => {
    setSelectedIds(
      new Set((organizeResult?.changes ?? []).map((_, index) => `dump-${index}`)),
    );
  }, [organizeResult]);

  useEffect(() => {
    if (!show_propose_first_hint) {
      setCursorPopout(null);
    }
  }, [show_propose_first_hint]);

  useEffect(() => {
    if (!organizeResult || proposed_changes.length === 0) {
      setIsTreeRevealing(false);
      return;
    }
    setIsTreeRevealing(true);
  }, [organizeResult, proposed_changes.length]);

  useEffect(() => {
    if (!isTreeRevealing || !proposed_tree) return;
    const collapsed = initial_proposed_tree_collapsed_keys(proposed_tree);
    const line_count = count_visible_proposed_tree_lines(proposed_tree, collapsed);
    const id = window.setTimeout(
      () => setIsTreeRevealing(false),
      tree_reveal_animation_ms(line_count),
    );
    return () => window.clearTimeout(id);
  }, [isTreeRevealing, proposed_tree]);

  function update_cursor_popout(event: React.MouseEvent) {
    setCursorPopout({ x: event.clientX, y: event.clientY });
  }

  function toggle_selected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function set_ids_selected(ids: string[], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function accept_click() {
    const selectedChanges = (organizeResult?.changes ?? []).filter((_, i) =>
      selectedIds.has(`dump-${i}`),
    );
    onAccept(selectedChanges);
  }

  const first_failed = applyReport?.results.find((result) => result.status === "failed");

  return (
    <section className="panel panel--changes" aria-label="Proposed changes">
      <header className="panel-terminal__titlebar">
        <span className="panel-terminal__title">
          <span className="panel-terminal__title-icon ti ti-wand" aria-hidden />
          proposed changes
          <span className="panel-changes__title-suffix" aria-live="polite">
            {title_suffix}
          </span>
        </span>
      </header>
      <div className="panel-changes__frame">
        <div className="panel-changes__scroll" aria-busy={busy}>
          {isApplyingChanges ? (
            <p className="panel-changes__proposing-hint">Applying selected changes to disk…</p>
          ) : isProposingChanges ? (
            <p className="panel-changes__proposing-hint panel-changes__proposing-hint--pulse">
              Thinking about how to organize your files…
            </p>
          ) : !selectedFolder ? (
            <p className="panel-changes__placeholder">
              Select a folder, then ask for organization suggestions from the sidebar.
            </p>
          ) : proposeError ? (
            <p className="panel-changes__apply-msg panel-changes__apply-msg--error" role="alert">
              {proposeError}
            </p>
          ) : organizeResult && proposed_changes.length > 0 ? (
            <ProposedChangesTreeView
              changes={proposed_changes}
              selectedIds={selectedIds}
              onToggle={toggle_selected}
              onSetSelection={set_ids_selected}
              disabled={busy}
              isTreeRevealing={isTreeRevealing}
            />
          ) : organizeResult ? (
            <p className="panel-changes__placeholder">
              No changes suggested — your folder might already be in good shape.
            </p>
          ) : applyReport || applyError ? null : (
            <p className="panel-changes__placeholder">
              Ask for suggestions from the sidebar to see a plan for this folder.
            </p>
          )}

          {applyError ? (
            <p className="panel-changes__apply-msg panel-changes__apply-msg--error" role="alert">
              {applyError}
            </p>
          ) : null}

          {applyReport ? (
            <p
              className={
                applyReport.failedCount > 0
                  ? "panel-changes__apply-msg panel-changes__apply-msg--warn"
                  : "panel-changes__apply-msg panel-changes__apply-msg--success"
              }
              role="status"
            >
              {applyReport.appliedCount} applied
              {applyReport.failedCount > 0 ? `, ${applyReport.failedCount} failed` : ""}
              {applyReport.skippedCount > 0 ? `, ${applyReport.skippedCount} skipped` : ""}.
              {first_failed?.error ? ` First error: ${first_failed.error}` : ""}
            </p>
          ) : null}
        </div>
        <footer
          className={
            show_propose_first_hint
              ? "panel-changes__footer panel-changes__footer--awaiting-proposal"
              : "panel-changes__footer"
          }
        >
          {has_proposal ? (
            <span className="panel-changes__selected-count" aria-live="polite">
              {selected_count} of {total_count} selected
            </span>
          ) : null}
          <div
            className="panel-changes__footer-actions"
            onMouseEnter={show_propose_first_hint ? update_cursor_popout : undefined}
            onMouseMove={show_propose_first_hint ? update_cursor_popout : undefined}
            onMouseLeave={show_propose_first_hint ? () => setCursorPopout(null) : undefined}
          >
            <button
              type="button"
              className="panel-changes__btn panel-changes__btn--reject"
              onClick={onReject}
              disabled={busy || !has_proposal}
            >
              Reject
            </button>
            <button
              type="button"
              className="panel-changes__btn panel-changes__btn--accept"
              disabled={busy || !has_proposal || selected_count === 0}
              onClick={accept_click}
            >
              {isApplyingChanges
                ? "Applying…"
                : selected_count === total_count
                  ? "Accept all"
                  : `Accept selected (${selected_count})`}
            </button>
          </div>
        </footer>
        {show_propose_first_hint && cursor_popout ? (
          <p
            className="panel-changes__footer-popout panel-changes__footer-popout--at-cursor"
            role="tooltip"
            style={{
              left: cursor_popout.x + 14,
              top: cursor_popout.y + 14,
            }}
          >
            Get suggestions from the sidebar first.
          </p>
        ) : null}
      </div>
    </section>
  );
}
