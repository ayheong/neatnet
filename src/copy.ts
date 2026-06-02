/** User-facing strings — keep tone consistent across the app. */

import {
  total_applied,
  total_failed,
  type ApplyChangesResult,
  type ApplyOutcomeCounts,
} from "./lib/applyChanges";
import type { Change } from "./types";

function file_count_label(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function files_phrase(count: number, verb: string): string {
  return `${file_count_label(count)} ${verb}`;
}

function outcome_success_phrase(moved: number, deleted: number): string {
  const parts: string[] = [];
  if (moved > 0) parts.push(files_phrase(moved, "moved or renamed"));
  if (deleted > 0) parts.push(files_phrase(deleted, "deleted"));
  return parts.join(", ");
}

export const COPY = {
  tagline: "Tidy folders with AI",

  scan: {
    inProgress: "Reading your folder…",
    filesFound: "Files found",
  },

  sidebar: {
    openFolder: "Open folder",
    scanning: "Reading folder…",
    noFolder: "No folder open",
    statsAria: "Folder summary",
    organize: "Preview layout",
    organizing: "Creating preview…",
    instructionsLabel: "Instructions",
    instructionsPlaceholder:
      "Leave photos in place, group PDFs by year, never delete anything…",
    instructionsHint: "Optional. Tell the AI how you like things organized.",
    modelSection: "AI model",
  },

  currentFolder: {
    title: "Current folder",
    empty: "Open a folder to see what's inside.",
  },

  preview: {
    title: "Preview",
    ariaLabel: "Organized folder preview",
    hint: "Click a file to mark delete or keep. Drag to rearrange. Names stay sorted A–Z within each folder.",
    emptyNoFolder: "Open a folder to get started.",
    emptyReady: "Tap Preview layout in the sidebar when you're ready.",
    planning: "Building your preview…",
    applying: "Applying changes…",
    footerWaiting: "Use Preview layout in the sidebar first.",
    startOver: "Start over",
    apply: "Apply changes",
    applyingBtn: "Applying…",
    applySuccess: (outcomes: ApplyOutcomeCounts) => {
      const phrase = outcome_success_phrase(
        outcomes.movedApplied,
        outcomes.deletedApplied,
      );
      return phrase ? `All set — ${phrase}.` : "All set.";
    },
    applyPartial: (outcomes: ApplyOutcomeCounts) => {
      const phrase = outcome_success_phrase(
        outcomes.movedApplied,
        outcomes.deletedApplied,
      );
      const failed = outcomes.movedFailed + outcomes.deletedFailed;
      const failed_noun = failed === 1 ? "change" : "changes";
      return phrase
        ? `All set — ${phrase}. ${failed} ${failed_noun} couldn't be applied.`
        : `No changes applied; ${failed} ${failed_noun} failed.`;
    },
    applyAllFailed: (outcomes: ApplyOutcomeCounts) => {
      const failed = outcomes.movedFailed + outcomes.deletedFailed;
      const noun = failed === 1 ? "change" : "changes";
      return `Couldn't apply ${failed} ${noun}. Try again or adjust the preview.`;
    },
  },

  confirm: {
    title: "Apply changes?",
    movesBody: (n: number) =>
      `Neatnet will move or rename ${file_count_label(n)} in this folder. This can't be undone from the app.`,
    deletesOnlyBody: (n: number) =>
      `Neatnet will permanently delete ${file_count_label(n)} from this folder. This can't be undone from the app.`,
    deleteNote: (n: number) =>
      `\n\n${file_count_label(n)} will also be deleted permanently.`,
    ok: "Apply",
    cancel: "Cancel",
  },

  errors: {
    organizeFailed: "We couldn't build a preview. Check your connection and try again.",
    applyFailed: "Something went wrong while applying changes.",
    claudeKey: "Add your Claude API key to continue.",
    ollamaSelectModel: "Choose an Ollama model to continue.",
    ollamaNotInstalled: (name: string) => `Model "${name}" isn't installed in Ollama yet.`,
  },
} as const;

export function build_apply_confirm_message(changes: Change[]): string {
  const move_count = changes.filter((change) => change.type !== "delete").length;
  const delete_count = changes.filter((change) => change.type === "delete").length;
  if (move_count > 0) {
    return (
      COPY.confirm.movesBody(move_count) +
      (delete_count > 0 ? COPY.confirm.deleteNote(delete_count) : "")
    );
  }
  return COPY.confirm.deletesOnlyBody(delete_count);
}

export function format_apply_report_message(report: ApplyChangesResult): string {
  const { outcomes } = report;
  const failed = total_failed(outcomes);
  const applied = total_applied(outcomes);

  let message = "";
  if (failed === 0) {
    message = COPY.preview.applySuccess(outcomes);
  } else if (applied === 0) {
    message = COPY.preview.applyAllFailed(outcomes);
  } else {
    message = COPY.preview.applyPartial(outcomes);
  }

  if (outcomes.skipped > 0) {
    const skipped_noun = outcomes.skipped === 1 ? "change" : "changes";
    message += ` ${outcomes.skipped} ${skipped_noun} skipped.`;
  }

  const first_failed = report.results.find((result) => result.status === "failed");
  if (first_failed?.error) {
    message += ` ${first_failed.error}`;
  }

  return message;
}
