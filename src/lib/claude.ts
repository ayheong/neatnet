import Anthropic from "@anthropic-ai/sdk";
import {
  build_path_index,
  flatten_tree_to_file_paths,
  list_directory_paths,
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

function build_organize_prompt(
  file_paths: string[],
  directory_paths: string[],
  user_ignore_list: string[],
): string {
  const file_lines = file_paths.map((path) => `- ${path}`).join("\n");
  const dir_lines =
    directory_paths.length > 0
      ? directory_paths.map((path) => `- ${path}/`).join("\n")
      : "- (none — all files are in the root)";

  const ignore_block =
    user_ignore_list.length > 0
      ? user_ignore_list.map((pattern) => `- ${pattern}`).join("\n")
      : "- (none)";

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
8. Do not propose changes for ignored patterns.
9. Do not use ".." or absolute paths.

## Ignore patterns
${ignore_block}

## Existing directories
${dir_lines}

## Files (authoritative "from" paths)
${file_lines}`;
}

export async function organize_folder(
  folderContents: TreeNode[],
  user_ignore_list: string[],
): Promise<OrganizeResult> {
  const file_paths = flatten_tree_to_file_paths(folderContents);  // get all file paths
  const directory_paths = list_directory_paths(folderContents);  // get all directory paths

  if (file_paths.length === 0) {
    return { changes: [] };  // if no files, return empty changes
  }

  const message = build_organize_prompt(file_paths, directory_paths, user_ignore_list);  // generate prompt

  const response = await call_anthropic(message);  // call anthropic
  const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();  // clean response
  try {
    const parsed = JSON.parse(cleaned) as OrganizeResult;  // parse response
    const path_index = build_path_index(file_paths);  // build path index
    const { changes, unresolved } = normalize_changes_against_index(  // normalize changes against index
      parsed.changes ?? [],  // store changes
      path_index,
    );
    if (unresolved.length > 0) {  // log warning
      console.warn("Skipped changes with unknown source paths:", unresolved);
    }
    return { changes };
  } catch (error) {
    throw new Error("Failed to parse JSON response from Anthropic");
  }
}
