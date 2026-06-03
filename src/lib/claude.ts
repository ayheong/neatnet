import Anthropic from "@anthropic-ai/sdk";
import {
  build_path_index,
  flatten_tree_to_file_paths,
  list_directory_paths,
  normalize_changes_against_index,
} from "./folderPaths";
import { log_organize_timing } from "./organizeTiming";
import {
  build_organize_prompt,
  dedupe_changes_by_from,
  filter_disallowed_deletes,
} from "./organizePrompt";
import { call_ollama } from "./ollama";
import { COPY } from "../copy";
import type { OrganizeResult, OrganizeTiming, TreeNode } from "../types";

export type OrganizeModelHost = "claude" | "ollama";

type OrganizeFolderOptions = {
  host: OrganizeModelHost;
  claude_api_key?: string;
  ollama_model?: string;
  ollama_installed_models?: string[];
};

function ns_to_ms(ns: number | undefined): number | undefined {
  if (ns == null || !Number.isFinite(ns)) return undefined;
  return ns / 1_000_000;
}

function text_from_content(
  blocks: Anthropic.Messages.ContentBlock[],
): string {
  return blocks
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function resolve_api_key(user_api_key: string): string {
  const trimmed = user_api_key.trim();
  if (trimmed) return trimmed;
  return import.meta.env.VITE_ANTHROPIC_API_KEY?.trim() ?? "";
}

async function call_anthropic(message: string, user_api_key = ""): Promise<string> {
  const api_key = resolve_api_key(user_api_key);
  if (!api_key) {
    throw new Error(COPY.errors.claudeKey);
  }

  const anthropic = new Anthropic({
    apiKey: api_key,
    dangerouslyAllowBrowser: true,
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: message }],
    });

    const text = text_from_content(response.content);
    if (!text) {
      throw new Error("Anthropic response contained no text blocks");
    }
    return text;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

type OrganizeModelResponse = {
  text: string;
  timing: Pick<OrganizeTiming, "host" | "model" | "ollama">;
};

async function call_organize_model(
  message: string,
  options: OrganizeFolderOptions,
): Promise<OrganizeModelResponse> {
  if (options.host === "ollama") {
    const result = await call_ollama(
      message,
      options.ollama_model,
      options.ollama_installed_models,
    );
    const metrics = result.metrics;
    const prompt_eval_ms = ns_to_ms(metrics.prompt_eval_duration) ?? 0;
    const eval_ms = ns_to_ms(metrics.eval_duration) ?? 0;
    const prompt_tokens = metrics.prompt_eval_count ?? 0;
    const output_tokens = metrics.eval_count ?? 0;
    return {
      text: result.content,
      timing: {
        host: "ollama",
        model: result.model,
        ollama: {
          load_ms: ns_to_ms(metrics.load_duration) ?? 0,
          prompt_eval_ms,
          prompt_tokens,
          prompt_tokens_per_sec:
            prompt_eval_ms > 0 && prompt_tokens > 0
              ? (prompt_tokens / prompt_eval_ms) * 1000
              : undefined,
          eval_ms,
          output_tokens,
          tokens_per_sec:
            eval_ms > 0 && output_tokens > 0 ? (output_tokens / eval_ms) * 1000 : undefined,
          total_ms: ns_to_ms(metrics.total_duration) ?? 0,
        },
      },
    };
  }
  return {
    text: await call_anthropic(message, options.claude_api_key ?? ""),
    timing: { host: "claude", model: "claude-sonnet-4-6" },
  };
}

export async function organize_folder(
  folderContents: TreeNode[],
  user_preferences: string,
  options: OrganizeFolderOptions,
): Promise<OrganizeResult> {
  const file_paths = flatten_tree_to_file_paths(folderContents);
  const directory_paths = list_directory_paths(folderContents);

  if (file_paths.length === 0) {
    return { changes: [] };
  }

  const message = build_organize_prompt(file_paths, directory_paths, user_preferences);
  const wall_start = performance.now();
  const model_response = await call_organize_model(message, options);
  const wall_ms = performance.now() - wall_start;
  const cleaned = model_response.text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as OrganizeResult;
    const path_index = build_path_index(file_paths);
    const { changes, unresolved } = normalize_changes_against_index(
      parsed.changes ?? [],
      path_index,
      directory_paths,
    );
    if (unresolved.length > 0) {
      console.warn("Skipped changes with unknown source paths:", unresolved);
    }
    const deduped = dedupe_changes_by_from(changes);
    const allowed = filter_disallowed_deletes(deduped, user_preferences);
    const raw_count = parsed.changes?.length ?? 0;
    if (raw_count > 0 && allowed.length === 0) {
      console.warn(
        "Model returned changes but none could be applied (wrong paths, renames only, or no-op moves).",
      );
    }
    const timing: OrganizeTiming = {
      ...model_response.timing,
      file_count: file_paths.length,
      prompt_chars: message.length,
      wall_ms,
    };
    log_organize_timing(timing);
    return { changes: allowed };
  } catch {
    throw new Error("Failed to parse JSON response from the model");
  }
}
