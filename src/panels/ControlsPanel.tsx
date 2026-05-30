import {
  MAX_FILES_TO_ORGANIZE,
  WARN_FILE_COUNT,
} from "../constants";

type ControlsPanelProps = {
  onSelectFolder: () => void;
  isScanningFolder: boolean;
  selectedFolder: string;
  rootTreeLabel: string;
  fileCount: number;
  dirCount: number;
  folderTotalBytes: number | null;
  totalSizeLabel: string;
  ignorePatterns: string;
  onIgnorePatternsChange: (value: string) => void;
  onOrganize: () => void;
  isProposingChanges: boolean;
  isApplyingChanges: boolean;
  scanTruncated: boolean;
  overFileLimit: boolean;
};

export function ControlsPanel({
  onSelectFolder,
  isScanningFolder,
  selectedFolder,
  rootTreeLabel,
  fileCount,
  dirCount,
  folderTotalBytes,
  totalSizeLabel,
  ignorePatterns,
  onIgnorePatternsChange,
  onOrganize,
  isProposingChanges,
  isApplyingChanges,
  scanTruncated,
  overFileLimit,
}: ControlsPanelProps) {
  const showStats = selectedFolder && rootTreeLabel && !isScanningFolder;
  const busy = isScanningFolder || isProposingChanges || isApplyingChanges;
  const canOrganize =
    showStats && fileCount > 0 && !overFileLimit && !scanTruncated;
  const showFileWarning =
    showStats && fileCount >= WARN_FILE_COUNT && fileCount <= MAX_FILES_TO_ORGANIZE && !scanTruncated;

  return (
    <aside className="panel panel--controls panel-controls" aria-label="Folder actions">
      <header className="panel-terminal__titlebar panel-controls__titlebar">
        <span className="panel-terminal__title">
          <span className="panel-terminal__title-icon ti ti-layout-sidebar" aria-hidden />
          folder organizer
        </span>
      </header>
      <header className="panel-controls__header">
        <h1 className="panel-controls__app-title">Folder Organizer</h1>
        <h2 className="panel-controls__subtitle">AI-powered file organizer</h2>
      </header>

      <button
        type="button"
        className="panel-controls__select-btn"
        onClick={onSelectFolder}
        disabled={busy}
      >
        <span className="panel-controls__select-icon ti ti-folder" aria-hidden />
        {isScanningFolder ? "Scanning…" : "Select Folder"}
      </button>

      <div
        className={
          selectedFolder
            ? "panel-controls__path-box"
            : "panel-controls__path-box panel-controls__path-box--empty"
        }
      >
        {selectedFolder ? (
          <span className="panel-controls__path-text">{selectedFolder}</span>
        ) : (
          <span className="panel-controls__path-placeholder">No folder selected</span>
        )}
      </div>

      <div className="panel-controls__pills" aria-label="Folder statistics">
        <div className="panel-controls__pill">
          <span className="panel-controls__pill-label">Files</span>
          <span className="panel-controls__pill-value">
            {showStats ? `${fileCount} / ${MAX_FILES_TO_ORGANIZE}` : `0 / ${MAX_FILES_TO_ORGANIZE}`}
          </span>
        </div>
        <div className="panel-controls__pill">
          <span className="panel-controls__pill-label">Folders</span>
          <span className="panel-controls__pill-value">{showStats ? dirCount : 0}</span>
        </div>
        <div className="panel-controls__pill">
          <span className="panel-controls__pill-label">Total size</span>
          <span
            className="panel-controls__pill-value"
            title={showStats && folderTotalBytes != null ? `${folderTotalBytes} bytes` : undefined}
          >
            {showStats ? totalSizeLabel : "—"}
          </span>
        </div>
      </div>

      {showStats && scanTruncated ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--error" role="alert">
          Scan stopped at {MAX_FILES_TO_ORGANIZE} files. Choose a smaller folder or add ignore patterns.
        </p>
      ) : null}
      {overFileLimit ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--error" role="alert">
          Folder exceeds the {MAX_FILES_TO_ORGANIZE}-file limit. Propose changes is disabled.
        </p>
      ) : null}
      {showFileWarning ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--warn">
          Large folder ({fileCount} files). Results may be less accurate near the limit.
        </p>
      ) : null}

      <div className="panel-controls__fill" aria-hidden />

      <div className="panel-controls__ignore">
        <label className="panel-controls__ignore-label" htmlFor="ignore-patterns-input">
          Ignore patterns
        </label>
        <input
          id="ignore-patterns-input"
          type="text"
          className="panel-controls__ignore-input"
          placeholder="e.g. desktop.ini, .DS_Store"
          value={ignorePatterns}
          onChange={(e) => onIgnorePatternsChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <p className="panel-controls__ignore-hint">
          Comma-separated names or globs. Matching files are skipped when planning changes.
        </p>
      </div>

      <footer className="panel-controls__footer">
        <button
          type="button"
          className={
            isProposingChanges
              ? "panel-controls__organize-btn panel-controls__organize-btn--proposing"
              : "panel-controls__organize-btn"
          }
          onClick={onOrganize}
          disabled={busy || !canOrganize}
          aria-busy={isProposingChanges}
          title={
            !canOrganize && showStats
              ? scanTruncated || overFileLimit
                ? `Folder exceeds the ${MAX_FILES_TO_ORGANIZE}-file limit`
                : fileCount === 0
                  ? "No files to organize"
                  : undefined
              : undefined
          }
        >
          {isProposingChanges ? "Proposing…" : "Propose changes"}
        </button>
      </footer>
    </aside>
  );
}
