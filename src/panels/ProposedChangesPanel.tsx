import { useEffect, useState } from "react";
import type { ApplyChangesResult } from "../lib/applyChanges";
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
  const selected_count = selectedIds.size;
  const total_count = proposed_changes.length;
  const busy = isProposingChanges || isApplyingChanges;

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

  function toggle_selected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
            <p className="panel-changes__proposing-hint">
              We are teaching the AI your file organization preferences... Your brand spanking new folder will be ready in just a moment!
            </p>
          ) : !selectedFolder ? (
            <p className="panel-changes__placeholder">
              Select a folder and click "Propose changes" to propose changes…
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
              disabled={busy}
            />
          ) : organizeResult ? (
            <p className="panel-changes__placeholder">The model returned no changes. It seems your folder is already well organized! 😊</p>
          ) : applyReport || applyError ? null : (
            <p className="panel-changes__placeholder">
              Click "Propose changes" to generate an organization plan for this folder.
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
        <footer className="panel-changes__footer">
          {organizeResult ? (
            <span className="panel-changes__selected-count" aria-live="polite">
              {selected_count} of {total_count} selected
            </span>
          ) : null}
          <button
            type="button"
            className="panel-changes__btn panel-changes__btn--reject"
            onClick={onReject}
            disabled={busy || !organizeResult}
          >
            Reject
          </button>
          <button
            type="button"
            className="panel-changes__btn panel-changes__btn--accept"
            disabled={busy || selected_count === 0 || !organizeResult}
            onClick={accept_click}
          >
            {isApplyingChanges
              ? "Applying…"
              : selected_count === total_count
                ? "Accept all"
                : `Accept selected (${selected_count})`}
          </button>
        </footer>
      </div>
    </section>
  );
}
