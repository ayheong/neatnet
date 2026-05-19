import type { ChangePreview, OrganizeResult } from "../types";

const PLACEHOLDER_RENAME: ChangePreview[] = [
  { id: "r1", from: "misc_exports.pdf", to: "taxes_2025.pdf" },
  { id: "r2", from: "IMG_0001.JPG", to: "vacation_photo_01.jpg" },
  { id: "r3", from: "notes.txt", to: "readme.txt" },
];

const PLACEHOLDER_MOVE: ChangePreview[] = [
  { id: "m1", from: "drafts/chapter1.md", to: "manuscript/chapter1.md" },
  { id: "m2", from: "Desktop/screenshot.png", to: "assets/screenshots/window_layout.png" },
];

const PLACEHOLDER_DELETE: ChangePreview[] = [
  { id: "d1", from: "old_backup.zip", to: "(remove)" },
  { id: "d2", from: "temp/cache.bin", to: "(remove)" },
];

function ChangesSection({
  title,
  rows,
}: {
  title: string;
  rows: ChangePreview[];
}) {
  return (
    <div className="panel-changes__section">
      <h2 className="panel-changes__heading">{title}</h2>
      <div className="panel-changes__divider" role="separator" />
      <ul className="panel-changes__list">
        {rows.map((row) => (
          <li key={row.id} className="panel-changes__item">
            <div className="panel-changes__item-top">
              <span className="panel-changes__old">{row.from}</span>
              <span className="panel-changes__arrow"> →</span>
            </div>
            <div className="panel-changes__new">{row.to}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ProposedChangesPanelProps = {
  isProposingChanges?: boolean;
  organizeResult?: OrganizeResult | null;
};

export function ProposedChangesPanel({
  isProposingChanges = false,
  organizeResult = null,
}: ProposedChangesPanelProps) {
  const title_suffix =
    isProposingChanges ? " — planning…" : organizeResult ? ` — ${organizeResult.changes.length} items` : "";

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
        <div className="panel-changes__scroll" aria-busy={isProposingChanges}>
          {isProposingChanges ? (
            <p className="panel-changes__proposing-hint">Asking the model for a proposal…</p>
          ) : null}
          <ChangesSection title="RENAME" rows={PLACEHOLDER_RENAME} />
          <ChangesSection title="MOVE" rows={PLACEHOLDER_MOVE} />
          <ChangesSection title="DELETE" rows={PLACEHOLDER_DELETE} />
        </div>
        <footer className="panel-changes__footer">
          <button type="button" className="panel-changes__btn panel-changes__btn--reject">
            Reject
          </button>
          <button type="button" className="panel-changes__btn panel-changes__btn--accept">
            Accept all
          </button>
        </footer>
      </div>
    </section>
  );
}
