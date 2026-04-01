/**
 * FileEditTool – Edit files via search-and-replace.
 *
 * Aligned with Claude Code's FileEditTool: takes a file path, an old
 * string to find, and a new string to replace it with.  Validates
 * uniqueness of the search string to prevent ambiguous edits.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import type { Tool, ToolResult } from "./types.js";

export interface FileEditToolOptions {
  cwd?: string;
}

export class FileEditTool implements Tool {
  private readonly cwd: string;

  readonly spec = {
    name: "file_edit",
    description:
      "Edit a file by replacing one occurrence of a search string with a new string. " +
      "The old_str must match exactly one location in the file. " +
      "Include enough context in old_str to make it unique. " +
      "Preserve leading/trailing whitespace exactly as it appears in the file.",
    input: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file to edit.",
        },
        old_str: {
          type: "string",
          description:
            "The exact string to search for in the file. Must match exactly one location.",
        },
        new_str: {
          type: "string",
          description:
            "The replacement string. If empty, the old_str is deleted.",
        },
      },
      required: ["path", "old_str", "new_str"],
    },
  };

  constructor(options?: FileEditToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const rawPath = args.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return { content: "Error: path must be a non-empty string.", isError: true };
    }

    const oldStr = args.old_str;
    if (typeof oldStr !== "string") {
      return { content: "Error: old_str must be a string.", isError: true };
    }

    const newStr = args.new_str;
    if (typeof newStr !== "string") {
      return { content: "Error: new_str must be a string.", isError: true };
    }

    if (!oldStr) {
      return { content: "Error: old_str cannot be empty.", isError: true };
    }

    const filePath = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath);

    try {
      const content = await readFile(filePath, "utf-8");

      // Check how many times the old string appears
      const occurrences = countOccurrences(content, oldStr);
      if (occurrences === 0) {
        return {
          content: `Error: old_str not found in ${filePath}. Make sure the string matches exactly (including whitespace and indentation).`,
          isError: true,
        };
      }
      if (occurrences > 1) {
        return {
          content: `Error: old_str found ${occurrences} times in ${filePath}. Include more context to make it unique.`,
          isError: true,
        };
      }

      const updated = content.replace(oldStr, newStr);
      await writeFile(filePath, updated, "utf-8");

      // Show a snippet around the change
      const snippet = buildChangeSnippet(updated, newStr, filePath);
      return { content: snippet };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error editing file: ${message}`, isError: true };
    }
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function buildChangeSnippet(content: string, newStr: string, filePath: string): string {
  if (!newStr) {
    return `Successfully deleted text in ${filePath}.`;
  }

  const lines = content.split("\n");
  const insertPos = content.indexOf(newStr);
  const linesBefore = content.slice(0, insertPos).split("\n").length - 1;
  const newLines = newStr.split("\n").length;

  const contextBefore = 2;
  const contextAfter = 2;
  const start = Math.max(0, linesBefore - contextBefore);
  const end = Math.min(lines.length, linesBefore + newLines + contextAfter);

  const snippet = lines
    .slice(start, end)
    .map((line, i) => `${start + i + 1}. ${line}`)
    .join("\n");

  return `Successfully edited ${filePath}.\n\n${snippet}`;
}
