/** User-facing product name (window title, sidebar header). */
export const APP_DISPLAY_NAME = "Neatnet";

import { COPY } from "./copy";

export { COPY };
export const APP_TAGLINE = COPY.tagline;

export const ROOT_TREE_KEY = "__root__";
export const SCAN_TYPING_LINE = COPY.scan.inProgress;

/** Scan UI: typewriter speed and minimum time before the tree appears. */
export const SCAN_TYPING_MS_PER_CHAR = 40;
export const SCAN_MIN_DISPLAY_MS = 1100;

/** Staggered tree line reveal after scan completes. */
export const TREE_LINE_REVEAL_STAGGER_MS = 50;
export const TREE_LINE_REVEAL_DURATION_MS = 140;

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
