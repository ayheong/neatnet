import { openUrl } from "@tauri-apps/plugin-opener";

function is_tauri_runtime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function open_external_url(url: string): Promise<void> {
  if (is_tauri_runtime()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
