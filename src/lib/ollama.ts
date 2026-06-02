import { COPY } from "../copy";

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

export type OllamaChatMetrics = {
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

type OllamaChatResponse = {
  model?: string;
  message: { content: string };
} & OllamaChatMetrics;

export type OllamaChatResult = {
  content: string;
  model: string;
  metrics: OllamaChatMetrics;
};

async function ollama_request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${OLLAMA_BASE_URL}${path}`, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
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
    throw new Error(COPY.errors.ollamaSelectModel);
  }
  if (installed?.length && !installed.includes(trimmed)) {
    throw new Error(COPY.errors.ollamaNotInstalled(trimmed));
  }
  return trimmed;
}

export async function call_ollama(
  message: string,
  model_name?: string,
  installed?: string[],
): Promise<OllamaChatResult> {
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
    return {
      content,
      model: data.model ?? model,
      metrics: {
        total_duration: data.total_duration,
        load_duration: data.load_duration,
        prompt_eval_count: data.prompt_eval_count,
        prompt_eval_duration: data.prompt_eval_duration,
        eval_count: data.eval_count,
        eval_duration: data.eval_duration,
      },
    };
  } catch (e) {
    const detail = e instanceof Error ? ` ${e.message}` : "";
    throw new Error(
      `Couldn't reach Ollama. Make sure it's running, then try: ollama pull ${model}${detail}`,
    );
  }
}
