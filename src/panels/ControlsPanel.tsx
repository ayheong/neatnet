import {
  MAX_FILES_TO_ORGANIZE,
  APP_DISPLAY_NAME,
  APP_TAGLINE,
  WARN_FILE_COUNT,
} from "../constants";
import { COPY } from "../copy";
import type { OrganizeModelHost } from "../lib/claude";
import {
  format_ollama_pull_command,
  format_ollama_recommendation_specs,
  get_primary_ollama_pull_recommendation,
  is_ollama_tag_installed,
  OLLAMA_PULL_RECOMMENDATIONS,
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
      : !ollamaModelsLoading &&
        ollamaModels.length > 0 &&
        selectedOllamaModel.trim() !== "";
  const canOrganize =
    showStats && fileCount > 0 && !overFileLimit && !scanTruncated && hostReady;
  const showFileWarning =
    showStats && fileCount >= WARN_FILE_COUNT && fileCount <= MAX_FILES_TO_ORGANIZE && !scanTruncated;

  const recommended_pull = get_primary_ollama_pull_recommendation();
  const show_pull_recommendation =
    modelHost === "ollama" &&
    !ollamaModelsLoading &&
    !ollamaListError &&
    ollamaModels.length === 0;
  const recommended_already_installed = is_ollama_tag_installed(
    ollamaModels,
    recommended_pull.tag,
  );
  return (
    <aside className="panel panel--controls panel-controls" aria-label="Sidebar">
      <header className="panel-terminal__titlebar panel-controls__titlebar">
        <span className="panel-terminal__title">
          <span className="panel-terminal__title-icon ti ti-layout-sidebar" aria-hidden />
          {APP_DISPLAY_NAME.toLowerCase()}
        </span>
      </header>
      <header className="panel-controls__header">
        <h1 className="panel-controls__app-title">{APP_DISPLAY_NAME}</h1>
        <h2 className="panel-controls__subtitle">{APP_TAGLINE}</h2>
      </header>

      <button
        type="button"
        className="panel-controls__select-btn"
        onClick={onSelectFolder}
        disabled={busy}
      >
        <span className="panel-controls__select-icon ti ti-folder" aria-hidden />
        {isScanningFolder ? COPY.sidebar.scanning : COPY.sidebar.openFolder}
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
          <span className="panel-controls__path-placeholder">{COPY.sidebar.noFolder}</span>
        )}
      </div>

      <div className="panel-controls__pills" aria-label={COPY.sidebar.statsAria}>
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
          This folder is larger than we can scan in one go ({MAX_FILES_TO_ORGANIZE} file max).
          Try a smaller folder, or add skip rules under Instructions.
        </p>
      ) : null}
      {overFileLimit ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--error" role="alert">
          Too many files in this folder (limit is {MAX_FILES_TO_ORGANIZE}). Open a smaller folder
          to continue.
        </p>
      ) : null}
      {showFileWarning ? (
        <p className="panel-controls__limit-msg panel-controls__limit-msg--warn">
          Large folder ({fileCount} files). Previews may be less accurate near the limit.
        </p>
      ) : null}

      <div className="panel-controls__fill" aria-hidden />

      <div className="panel-controls__provider">
        <span className="panel-controls__api-key-label" id="model-provider-label">
          {COPY.sidebar.modelSection}
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
            title="Cloud AI — fast and accurate; requires an Anthropic API key"
            disabled={busy}
            onClick={() => onModelHostChange("claude")}
          >
            <span className="panel-controls__provider-recommended" aria-hidden>
              Recommended
            </span>
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
            title="Runs on this computer — private, no API key"
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
            Stored only on this device.{" "}
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
              {COPY.errors.claudeKey}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="panel-controls__ollama-section">
          <div className="panel-controls__ollama-notice" role="note">
            <p className="panel-controls__ollama-notice-text">
              Larger models usually organize better but need more RAM and a capable GPU. Smaller
              models are faster and work better on everyday laptops.
            </p>
          </div>
          {ollamaModelsLoading ? (
            <p className="panel-controls__api-key-hint" role="status">
              Looking for installed models…
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
                <option value="" disabled>
                  Choose a model
                </option>
                {ollamaModels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <p id="ollama-model-hint" className="panel-controls__api-key-hint">
                Pick a model you've already downloaded in Ollama.
              </p>
            </div>
          ) : !ollamaModelsLoading && !ollamaListError ? (
            <p className="panel-controls__api-key-hint" role="status">
              No models yet. Install one with the command below.
            </p>
          ) : null}

          {show_pull_recommendation && !recommended_already_installed ? (
            <div className="panel-controls__ollama-recommend" role="note">
              <p className="panel-controls__ollama-recommend-title">
                Start here: {recommended_pull.title}
              </p>
              <p className="panel-controls__ollama-recommend-specs">
                {format_ollama_recommendation_specs(recommended_pull)}
              </p>
              <p className="panel-controls__ollama-recommend-label">Run in Terminal or PowerShell:</p>
              <p className="panel-controls__ollama-recommend-cmd">
                <code>{format_ollama_pull_command(recommended_pull.tag)}</code>
              </p>
              <p className="panel-controls__api-key-hint">
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
                      {format_ollama_recommendation_specs(rec)}
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
          {COPY.sidebar.instructionsLabel}
        </label>
        <textarea
          id="user-preferences-input"
          className="panel-controls__preferences-input"
          placeholder={COPY.sidebar.instructionsPlaceholder}
          value={userPreferences}
          onChange={(e) => onUserPreferencesChange(e.target.value)}
          rows={2}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <p className="panel-controls__preferences-hint">{COPY.sidebar.instructionsHint}</p>
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
                ? COPY.errors.claudeKey
                : modelHost === "ollama" && ollamaModels.length === 0
                  ? "Install an Ollama model to continue"
                  : modelHost === "ollama" && !selectedOllamaModel.trim()
                    ? COPY.errors.ollamaSelectModel
                    : scanTruncated || overFileLimit
                      ? `This folder exceeds the ${MAX_FILES_TO_ORGANIZE}-file limit`
                      : fileCount === 0
                        ? "This folder has no files to organize"
                        : undefined
              : undefined
          }
        >
          {isProposingChanges ? COPY.sidebar.organizing : COPY.sidebar.organize}
        </button>
      </footer>
    </aside>
  );
}
