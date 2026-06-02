const STORAGE_KEY = "folder_organizer_anthropic_api_key";

export function load_claude_api_key(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function save_claude_api_key(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable
  }
}

export function has_claude_api_key(user_key: string): boolean {
  if (user_key.trim()) return true;
  return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY?.trim());
}
