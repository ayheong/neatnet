import Anthropic from "@anthropic-ai/sdk";
import {
  build_path_index,
  flatten_tree_to_file_paths,
  list_directory_paths,
  normalize_changes_against_index,
} from "./folderPaths";
import { call_ollama } from "./ollama";
import type { TreeNode } from "../types";
import type { OrganizeResult } from "../types";

export type OrganizeModelHost = "claude" | "ollama";

export type OrganizeFolderOptions = {
  host: OrganizeModelHost;
  claude_api_key?: string;
  ollama_model?: string;
  ollama_installed_models?: string[];
};

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

export async function call_anthropic(message: string, user_api_key = ""): Promise<string> {
  const api_key = resolve_api_key(user_api_key);
  if (!api_key) {
    throw new Error("Add your Claude API key in the sidebar to get suggestions.");
  }

  const anthropic = new Anthropic({
    apiKey: api_key,
    dangerouslyAllowBrowser: true,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: message }],
  });

  const text = text_from_content(response.content);
  if (!text) {
    throw new Error("Anthropic response contained no text blocks");
  }
  return text;
}

function build_organize_prompt(
  file_paths: string[],
  directory_paths: string[],
  user_preferences: string,
): string {
  const file_lines = file_paths.map((path) => `- ${path}`).join("\n");
  const dir_lines =
    directory_paths.length > 0
      ? directory_paths.map((path) => `- ${path}/`).join("\n")
      : "- (none — all files are in the root)";

  const preferences_block = user_preferences.trim() ? user_preferences.trim() : "- (none)";

  return `You are a file organization assistant. Propose a practical plan to tidy this folder.

## Output
Return ONLY valid JSON. No markdown fences, no explanation, no trailing text.

Schema:
{"changes":[{"type":"rename"|"move"|"delete","from":"<exact file path>","to":"<new path>"}]}

Example (illustrative paths only):
{"changes":[
  {"type":"rename","from":"misc/IMG_001.jpg","to":"photos/vacation-001.jpg"},
  {"type":"move","from":"draft-notes.txt","to":"documents/draft-notes.txt"},
  {"type":"delete","from":"temp/old-backup.zip"}
]}

## Change types
- rename: same parent folder, better filename (e.g. fix casing, add date, clearer name)
- move: file goes to a different folder — use existing folders when they fit, or create clear new ones
- delete: only obvious junk (duplicates, stale temp files, empty placeholders) — omit "to"

## Rules
1. Every "from" MUST match a path in the file list below exactly — copy it character-for-character.
2. Use forward slashes only (e.g. documents/report.pdf).
3. Propose changes for FILES only. Do not rename or move directories; new folders appear in "to" paths automatically.
4. Skip files that are already well placed or clearly intentional (e.g. README.md at root).
5. Skip system or hidden files (desktop.ini, .DS_Store, Thumbs.db).
6. Use lowercase, hyphenated names for new folders and renamed files (e.g. tax-documents, meeting-notes.md).
7. Prefer fewer, meaningful moves over renaming everything.
8. Follow the user preferences below when proposing changes. If they name paths, folders, or patterns to leave alone, do not propose changes for matching files.
9. Do not use ".." or absolute paths.

## User preferences
${preferences_block}

## Existing directories
${dir_lines}

## Files (authoritative "from" paths)
${file_lines}`;
}

async function call_organize_model(
  message: string,
  options: OrganizeFolderOptions,
): Promise<string> {
  if (options.host === "ollama") {
    return call_ollama(
      message,
      options.ollama_model,
      options.ollama_installed_models,
    );
  }
  return call_anthropic(message, options.claude_api_key ?? "");
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
  const response = await call_organize_model(message, options);
  const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as OrganizeResult;
    const path_index = build_path_index(file_paths);
    const { changes, unresolved } = normalize_changes_against_index(
      parsed.changes ?? [],
      path_index,
    );
    if (unresolved.length > 0) {
      console.warn("Skipped changes with unknown source paths:", unresolved);
    }
    return { changes };
  } catch {
    throw new Error("Failed to parse JSON response from the model");
  }
}
