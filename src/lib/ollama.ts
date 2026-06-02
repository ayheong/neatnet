import {
  format_ollama_pull_command,
  get_primary_ollama_pull_recommendation,
} from "./ollamaRecommendations";

/** Fallback when no model is installed; matches primary pull recommendation. */
export const DEFAULT_OLLAMA_MODEL_NAME =
  get_primary_ollama_pull_recommendation().tag;

const OLLAMA_BASE_URL =
  import.meta.env.VITE_OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";

/** Ollama defaults to temperature 0.8; lower values stabilize JSON + path copying. */
const OLLAMA_ORGANIZE_CHAT_OPTIONS = {
  temperature: 0.2,
  top_p: 0.9,
  seed: 42,
} as const;

export type OllamaModelInfo = {
  name: string;
  size: number;
};

type OllamaTagsResponse = {
  models: { name: string; size?: number }[];
};

type OllamaChatResponse = {
  message: { content: string };
};

async function ollama_request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${OLLAMA_BASE_URL}${path}`, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

/** Parameter count parsed from names like `llama3.1:8b` or `qwen2.5-14b`. */
export function parse_model_param_billions(name: string): number {
  const match = name.match(/(\d+(?:\.\d+)?)\s*b/i);
  return match ? Number.parseFloat(match[1]) : 0;
}

/** Prefer largest on-disk model, then highest parameter count in the name. */
export function pick_strongest_ollama_model(models: OllamaModelInfo[]): string {
  if (models.length === 0) return DEFAULT_OLLAMA_MODEL_NAME;
  const sorted = [...models].sort((a, b) => {
    const size_diff = b.size - a.size;
    if (size_diff !== 0) return size_diff;
    return parse_model_param_billions(b.name) - parse_model_param_billions(a.name);
  });
  return sorted[0].name;
}

export async function list_ollama_model_infos(): Promise<OllamaModelInfo[]> {
  const data = await ollama_request<OllamaTagsResponse>("/api/tags");
  return data.models.map((m) => ({
    name: m.name,
    size: m.size ?? 0,
  }));
}

export async function list_ollama_models(): Promise<string[]> {
  const models = await list_ollama_model_infos();
  return models.map((m) => m.name);
}

export function resolve_model_name(
  wanted: string | undefined,
  installed?: string[],
): string {
  const trimmed = wanted?.trim();
  if (!trimmed) {
    if (installed?.length) {
      return pick_strongest_ollama_model(
        installed.map((name) => ({ name, size: 0 })),
      );
    }
    return DEFAULT_OLLAMA_MODEL_NAME;
  }
  if (installed?.includes(trimmed)) return trimmed;
  if (installed?.length) {
    return pick_strongest_ollama_model(
      installed.map((name) => ({ name, size: 0 })),
    );
  }
  return trimmed;
}

export async function resolve_installed_model(wanted?: string): Promise<string> {
  const models = await list_ollama_model_infos();
  if (models.length === 0) {
    throw new Error(
      `No Ollama model found. Run: ${format_ollama_pull_command(get_primary_ollama_pull_recommendation().tag)}`,
    );
  }
  const trimmed = wanted?.trim();
  if (trimmed && models.some((m) => m.name === trimmed)) return trimmed;
  return pick_strongest_ollama_model(models);
}

export async function call_ollama(
  message: string,
  model_name?: string,
  installed?: string[],
): Promise<string> {
  const model = resolve_model_name(model_name, installed);

  try {
    const data = await ollama_request<OllamaChatResponse>("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: message }],
        format: "json",
        stream: false,
        options: OLLAMA_ORGANIZE_CHAT_OPTIONS,
      }),
    });
    const content = data.message.content;
    if (!content) throw new Error("Ollama response contained no content");
    return content;
  } catch (e) {
    const detail = e instanceof Error ? ` ${e.message}` : "";
    throw new Error(
      `Ollama chat failed for model "${model}". Is Ollama running? Did you run ollama pull ${model}?${detail}`,
    );
  }
}
