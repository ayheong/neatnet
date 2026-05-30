export const ROOT_TREE_KEY = "__root__";
export const SCAN_TYPING_LINE = "Scanning folder…";

/** Conservative limits for scan + Claude payload size. */
export const MAX_FILES_TO_ORGANIZE = 500;
export const WARN_FILE_COUNT = 250;

export const DEFAULT_SKIP_DIR_NAMES = [
  "node_modules",
  ".git",
  "dist",
  "target",
  "__pycache__",
  ".venv",
] as const;

export const DEFAULT_SKIP_DIR_NAME_SET = new Set(
  DEFAULT_SKIP_DIR_NAMES.map((name) => name.toLowerCase()),
);
