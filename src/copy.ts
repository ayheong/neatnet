function file_count_label(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

export const COPY = {
  tagline: "Organize folders with AI",

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
    partialScanWarning: (shown: number, limit: number) =>
      `Preview shows ${shown} of the files we scanned (${limit} file max). Open a smaller folder for a complete preview.`,
    emptyNoFolder: "Open a folder to get started.",
    emptyReady: "Tap Preview layout in the sidebar when you're ready.",
    planning: "Building your preview…",
    applying: "Applying changes…",
    footerWaiting: "Use Preview layout in the sidebar first.",
    startOver: "Start over",
    apply: "Apply changes",
    applyingBtn: "Applying…",
  },

  confirm: {
    title: "Apply changes?",
    movesBody: (n: number) =>
      `Neatnet will move ${file_count_label(n)} in this folder. This can't be undone from the app.`,
    deletesOnlyBody: (n: number) =>
      `Neatnet will permanently delete ${file_count_label(n)} from this folder. This can't be undone from the app.`,
    deleteNote: (n: number) =>
      `\n\n${file_count_label(n)} will also be deleted permanently.`,
    ok: "Apply",
    cancel: "Cancel",
  },

  errors: {
    organizeFailed: "We couldn't build a preview. Check your connection and try again.",
    emptyProposal:
      "No moves to preview. The model may have suggested renames only, paths that don't match your folder, or nothing to change — try different instructions.",
    applyFailed: "Something went wrong while applying changes.",
    claudeKey: "Add your Claude API key to continue.",
    ollamaSelectModel: "Choose an Ollama model to continue.",
    ollamaNotInstalled: (name: string) => `Model "${name}" isn't installed in Ollama yet.`,
  },
} as const;
