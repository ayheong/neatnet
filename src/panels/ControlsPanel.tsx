import {
  MAX_FILES_TO_ORGANIZE,
  WARN_FILE_COUNT,
} from "../constants";
import type { OrganizeModelHost } from "../lib/claude";
import {
  format_ollama_pull_command,
  get_primary_ollama_pull_recommendation,
  is_ollama_tag_installed,
  OLLAMA_PULL_RECOMMENDATIONS,
  should_suggest_stronger_ollama_pull,
} from "../lib/ollamaRecommendations";

type ControlsPanelProps = {
  onSelectFolder: () => void;
  isScanningFolder: boolean;
  selectedFolder: string;
  rootTreeLabel: string;
  fileCount: number;
  dirCount: number;
  folderTotalBytes: number | null;
  totalSizeLabel: string;
  userPreferences: string;
  onUserPreferencesChange: (value: string) => void;
  modelHost: OrganizeModelHost;
  onModelHostChange: (host: OrganizeModelHost) => void;
  claudeApiKey: string;
  onClaudeApiKeyChange: (value: string) => void;
  hasClaudeApiKey: boolean;
  ollamaModels: string[];
  selectedOllamaModel: string;
  onSelectedOllamaModelChange: (model: string) => void;
  ollamaModelsLoading: boolean;
  ollamaListError: string | null;
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
  userPreferences,
  onUserPreferencesChange,
  modelHost,
  onModelHostChange,
  claudeApiKey,
  onClaudeApiKeyChange,
  hasClaudeApiKey,
  ollamaModels,
  selectedOllamaModel,
  onSelectedOllamaModelChange,
  ollamaModelsLoading,
  ollamaListError,
  onOrganize,
  isProposingChanges,
  isApplyingChanges,
  scanTruncated,
  overFileLimit,
}: ControlsPanelProps) {
  const showStats = selectedFolder && rootTreeLabel && !isScanningFolder;
  const busy = isScanningFolder || isProposingChanges || isApplyingChanges;
  const hostReady =
    modelHost === "claude"
      ? hasClaudeApiKey
      : !ollamaModelsLoading && ollamaModels.length > 0;
  const canOrganize =
    showStats && fileCount > 0 && !overFileLimit && !scanTruncated && hostReady;
  const showFileWarning =
    showStats && fileCount >= WARN_FILE_COUNT && fileCount <= MAX_FILES_TO_ORGANIZE && !scanTruncated;

  const recommended_pull = get_primary_ollama_pull_recommendation();
  const show_pull_recommendation =
    modelHost === "ollama" &&
    !ollamaModelsLoading &&
    !ollamaListError &&
    (ollamaModels.length === 0 || should_suggest_stronger_ollama_pull(ollamaModels));
  const recommended_already_installed = is_ollama_tag_installed(
    ollamaModels,
    recommended_pull.tag,
  );
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
        <h2 className="panel-controls__subtitle">Get AI help tidying your files</h2>
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
          This folder has more than {MAX_FILES_TO_ORGANIZE} files, so we only scanned part of it. Try a smaller folder or tell the AI what to skip in Instructions below.
        </p>
      ) : null}
      {overFileLimit ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--error" role="alert">
          This folder has too many files (over {MAX_FILES_TO_ORGANIZE}). Choose a smaller folder to get suggestions.
        </p>
      ) : null}
      {showFileWarning ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--warn">
          Large folder ({fileCount} files). Suggestions may be less accurate when you're near the limit.
        </p>
      ) : null}

      <div className="panel-controls__fill" aria-hidden />

      <div className="panel-controls__provider">
        <span className="panel-controls__api-key-label" id="model-provider-label">
          Your choice
        </span>
        <div
          className="panel-controls__provider-toggle"
          role="radiogroup"
          aria-labelledby="model-provider-label"
        >
          <button
            type="button"
            className={
              modelHost === "claude"
                ? "panel-controls__provider-btn panel-controls__provider-btn--active"
                : "panel-controls__provider-btn"
            }
            role="radio"
            aria-checked={modelHost === "claude"}
            title="Claude in the cloud — needs an Anthropic API key"
            disabled={busy}
            onClick={() => onModelHostChange("claude")}
          >
            <span className="panel-controls__provider-btn-icon ti ti-cloud" aria-hidden />
            <span className="panel-controls__provider-btn-title">Claude</span>
          </button>
          <button
            type="button"
            className={
              modelHost === "ollama"
                ? "panel-controls__provider-btn panel-controls__provider-btn--active"
                : "panel-controls__provider-btn"
            }
            role="radio"
            aria-checked={modelHost === "ollama"}
            title="Ollama on this computer — runs locally, no API key"
            disabled={busy}
            onClick={() => onModelHostChange("ollama")}
          >
            <span className="panel-controls__provider-btn-icon ti ti-cpu" aria-hidden />
            <span className="panel-controls__provider-btn-title">Ollama</span>
          </button>
        </div>
      </div>

      {modelHost === "claude" ? (
        <div className="panel-controls__api-key">
          <label className="panel-controls__api-key-label" htmlFor="claude-api-key-input">
            Claude API key
          </label>
          <input
            id="claude-api-key-input"
            className="panel-controls__api-key-input"
            type="password"
            placeholder="sk-ant-api03-…"
            value={claudeApiKey}
            onChange={(e) => onClaudeApiKeyChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <p className="panel-controls__api-key-hint">
            Claude runs in the cloud. Key is saved only on this computer.{" "}
            <a
              className="panel-controls__api-key-link"
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get a key from Anthropic
            </a>
            .
          </p>
          {!hasClaudeApiKey ? (
            <p className="panel-controls__limit-msg panel-controls__limit-msg--warn" role="status">
              Add your Claude API key above to get suggestions.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="panel-controls__ollama-section">
          <div className="panel-controls__ollama-notice" role="note">
            <p className="panel-controls__ollama-notice-text">
              Performance with Ollama models is heavily dependent on your selected model
              — larger models (like 70B) usually do much better; small models often
              struggle, especially on big folders.
            </p>
          </div>
          {ollamaModelsLoading ? (
            <p className="panel-controls__api-key-hint" role="status">
              Checking which Ollama models you have…
            </p>
          ) : ollamaListError ? (
            <p className="panel-controls__limit-msg panel-controls__limit-msg--error" role="alert">
              {ollamaListError}
            </p>
          ) : null}

          {ollamaModels.length > 0 ? (
            <div className="panel-controls__ollama-active">
              <label className="panel-controls__api-key-label" htmlFor="ollama-model-select">
                Ollama model
              </label>
              <select
                id="ollama-model-select"
                className="panel-controls__ollama-select"
                value={selectedOllamaModel}
                onChange={(e) => onSelectedOllamaModelChange(e.target.value)}
                disabled={busy}
                aria-describedby="ollama-model-hint"
                aria-live="polite"
              >
                {ollamaModels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <p id="ollama-model-hint" className="panel-controls__api-key-hint">
                Select your ollama model using the above dropdown.
              </p>
            </div>
          ) : !ollamaModelsLoading && !ollamaListError ? (
            <p className="panel-controls__api-key-hint" role="status">
              No Ollama models installed yet. Download one with the command below (Terminal or PowerShell).
            </p>
          ) : null}

          {show_pull_recommendation && !recommended_already_installed ? (
            <div className="panel-controls__ollama-recommend" role="note">
              <p className="panel-controls__ollama-recommend-title">
                We recommend: {recommended_pull.title}
              </p>
              <p className="panel-controls__ollama-recommend-blurb">{recommended_pull.blurb}</p>
              <p className="panel-controls__ollama-recommend-label">Run in Terminal or PowerShell:</p>
              <p className="panel-controls__ollama-recommend-cmd">
                <code>{format_ollama_pull_command(recommended_pull.tag)}</code>
              </p>
              <p className="panel-controls__api-key-hint">
                Download size is about {recommended_pull.approx_size_gb} GB.{" "}
                <a
                  className="panel-controls__api-key-link"
                  href={`https://ollama.com/library/${recommended_pull.tag.split(":")[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  More info on ollama.com
                </a>
              </p>
            </div>
          ) : null}

          <details className="panel-controls__ollama-alternatives">
            <summary className="panel-controls__ollama-alternatives-summary">
              {ollamaModels.length > 0
                ? "Other Ollama models to download"
                : "Ollama models to download"}
            </summary>
            <ul className="panel-controls__ollama-alternatives-list">
              {(ollamaModels.length > 0
                ? OLLAMA_PULL_RECOMMENDATIONS.slice(1)
                : OLLAMA_PULL_RECOMMENDATIONS
              ).map((rec) => (
                <li key={rec.tag}>
                  <span className="panel-controls__ollama-alternatives-name">
                    {rec.title}
                    <span className="panel-controls__ollama-alternatives-size">
                      ~{rec.approx_size_gb} GB download
                    </span>
                  </span>
                  <code className="panel-controls__ollama-alternatives-cmd">
                    {format_ollama_pull_command(rec.tag)}
                  </code>
                </li>
              ))}
            </ul>
          </details>

        </div>
      )}

      <div className="panel-controls__preferences">
        <label className="panel-controls__preferences-label" htmlFor="user-preferences-input">
          Instructions
        </label>
        <textarea
          id="user-preferences-input"
          className="panel-controls__preferences-input"
          placeholder="e.g. Don't touch my Photos folder; group PDFs by year; never delete files"
          value={userPreferences}
          onChange={(e) => onUserPreferencesChange(e.target.value)}
          rows={2}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <p className="panel-controls__preferences-hint">
          Optional. Applies to Claude or Ollama, depending on your choice above.
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
              ? modelHost === "claude" && !hasClaudeApiKey
                ? "Add your Claude API key first"
                : modelHost === "ollama" && ollamaModels.length === 0
                  ? "Install an Ollama model first"
                  : scanTruncated || overFileLimit
                    ? `This folder has too many files (over ${MAX_FILES_TO_ORGANIZE})`
                    : fileCount === 0
                      ? "This folder has no files to organize"
                      : undefined
              : undefined
          }
        >
          {isProposingChanges ? "Getting suggestions…" : "Propose changes"}
        </button>
      </footer>
    </aside>
  );
}
