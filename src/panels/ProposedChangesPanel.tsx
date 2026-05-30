import { useEffect, useState } from "react";
import type { ApplyChangesResult } from "../lib/applyChanges";
import type { Change, ChangePreview, OrganizeResult } from "../types";

function ChangesSection({
  rows,
  selectedIds,
  onToggle,
  disabled,
}: {
  rows: ChangePreview[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="panel-changes__section">
      <div className="panel-changes__divider" role="separator" />
      <ul className="panel-changes__list">
        {rows.map((row) => (
          <li key={row.id} className="panel-changes__item">
            <label className="panel-changes__item-label">
              <span className="panel-changes__item-body">
                <span className="panel-changes__item-top">
                  <span className="panel-changes__old">{row.from}</span>
                  <span className="panel-changes__arrow"> →</span>
                </span>
                <span className="panel-changes__new">{row.to}</span>
              </span>
              <input
                type="checkbox"
                className="panel-changes__checkbox"
                checked={selectedIds.has(row.id)}
                onChange={() => onToggle(row.id)}
                disabled={disabled}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ProposedChangesPanelProps = {
  isProposingChanges?: boolean;
  isApplyingChanges?: boolean;
  organizeResult?: OrganizeResult | null;
  selectedFolder?: string;
  applyReport?: ApplyChangesResult | null;
  applyError?: string | null;
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
  onAccept,
  onReject,
}: ProposedChangesPanelProps) {
  const proposed_changes_rows: ChangePreview[] = (organizeResult?.changes ?? []).map((change, i) => ({
    id: `dump-${i}`,
    from: change.from,
    to: change.type === "delete" ? "(remove)" : (change.to ?? ""),
  }));

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selected_count = selectedIds.size;
  const total_count = proposed_changes_rows.length;
  const busy = isProposingChanges || isApplyingChanges;

  const title_suffix = isApplyingChanges
    ? " — applying…"
    : isProposingChanges
      ? " — planning…"
      : organizeResult
        ? ` — ${selected_count} / ${total_count} selected`
        : "";

  useEffect(() => {
    setSelectedIds(new Set(proposed_changes_rows.map((row) => row.id)));
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
            <p className="panel-changes__proposing-hint">Asking the model for a proposal…</p>
          ) : !selectedFolder ? (
            <p className="panel-changes__placeholder">
              Select a folder and click "Propose changes" to propose changes…
            </p>
          ) : organizeResult ? (
            <ChangesSection
              rows={proposed_changes_rows}
              selectedIds={selectedIds}
              onToggle={toggle_selected}
              disabled={busy}
            />
          ) : applyReport || applyError ? null : (
            <p className="panel-changes__placeholder">No proposed changes yet.</p>
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
