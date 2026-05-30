import Anthropic from "@anthropic-ai/sdk";
import {
  build_path_index,
  flatten_tree_to_relative_paths,
  normalize_changes_against_index,
} from "./folderPaths";
import type { TreeNode } from "../types";
import type { OrganizeResult } from "../types";

function text_from_content(
  blocks: Anthropic.Messages.ContentBlock[],
): string {
  return blocks
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function call_anthropic(message: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
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

export async function organize_folder(folderContents: TreeNode[], user_ignore_list: string[]): Promise<OrganizeResult> {
  const relative_paths = flatten_tree_to_relative_paths(folderContents);
  const path_lines = relative_paths.map((path) => `- ${path}`).join("\n");

  const message = `
  Propose an organization plan for the following folder and return ONLY
  a JSON object, no explanation or markdown.

  The JSON should have a "changes" array where each item has:
  - "type": either "rename", "move", or "delete"
  - "from": the original relative file path (must match an entry in the path list exactly)
  - "to": the new relative file path (omit for delete)

  Use forward slashes in paths (e.g. docs/readme.md). The "from" path MUST be copied exactly
  from the path list below — do not invent or shorten paths.

  Only suggest changes that meaningfully improve organization. Skip system files
  like desktop.ini. Use clear, lowercase, hyphenated folder and file names.

  Also ignore:
  ${user_ignore_list.join("\n")}

  Exact paths in this folder (use these for "from"):
  ${path_lines}

  Folder structure (for context):
  ${JSON.stringify(folderContents, null, 2)}`;

  const response = await call_anthropic(message);
  const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as OrganizeResult;
    const path_index = build_path_index(relative_paths);
    const { changes, unresolved } = normalize_changes_against_index(
      parsed.changes ?? [],
      path_index,
    );
    if (unresolved.length > 0) {
      console.warn("Skipped changes with unknown source paths:", unresolved);
    }
    return { changes };
  } catch (error) {
    throw new Error("Failed to parse JSON response from Anthropic");
  }
}
