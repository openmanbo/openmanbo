/**
 * FileReadTool – Read file contents.
 *
 * Reads a file from disk and returns its content. Supports optional
 * line-range selection and size limits to avoid overwhelming the model
 * context with huge files.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import type { Tool, ToolResult } from "./types.js";

const MAX_FILE_SIZE = 1_000_000; // 1 MB
const MAX_OUTPUT_LINES = 2_000;

export interface FileReadToolOptions {
  /** Working directory for resolving relative paths */
  cwd?: string;
}

export class FileReadTool implements Tool {
  private readonly cwd: string;

  readonly spec = {
    name: "file_read",
    description:
      "Read the contents of a file. " +
      "Provide the file path and optionally specify a line range to read only a portion. " +
      "For very large files, consider reading specific line ranges instead of the entire file.",
    input: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to read.",
        },
        start_line: {
          type: "number",
          description: "1-based starting line number (inclusive). Omit to start from the beginning.",
        },
        end_line: {
          type: "number",
          description: "1-based ending line number (inclusive). Omit to read to the end.",
        },
      },
      required: ["path"],
    },
  };

  constructor(options?: FileReadToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const rawPath = args.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return { content: "Error: path must be a non-empty string.", isError: true };
    }

    const filePath = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath);

    try {
      const fileStats = await stat(filePath);

      if (fileStats.isDirectory()) {
        return { content: `Error: "${filePath}" is a directory, not a file.`, isError: true };
      }

      if (fileStats.size > MAX_FILE_SIZE) {
        return {
          content: `Error: File is too large (${fileStats.size} bytes, max ${MAX_FILE_SIZE}). ` +
            `Use start_line/end_line to read a portion, or use bash with head/tail.`,
          isError: true,
        };
      }

      const raw = await readFile(filePath, "utf-8");
      const allLines = raw.split("\n");

      const startLine = typeof args.start_line === "number" ? Math.max(1, Math.floor(args.start_line)) : 1;
      const endLine = typeof args.end_line === "number" ? Math.min(allLines.length, Math.floor(args.end_line)) : allLines.length;

      if (startLine > allLines.length) {
        return {
          content: `File has ${allLines.length} lines; start_line ${startLine} is beyond the end.`,
          isError: true,
        };
      }

      const selected = allLines.slice(startLine - 1, endLine);
      const tooMany = selected.length > MAX_OUTPUT_LINES;
      const lines = tooMany ? selected.slice(0, MAX_OUTPUT_LINES) : selected;

      // Number the lines
      const numbered = lines.map((line, i) => `${startLine + i}. ${line}`).join("\n");
      const suffix = tooMany
        ? `\n\n[Showing ${MAX_OUTPUT_LINES} of ${selected.length} selected lines. Use start_line/end_line to see more.]`
        : "";

      return {
        content: `File: ${filePath} (${allLines.length} lines)\n\n${numbered}${suffix}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error reading file: ${message}`, isError: true };
    }
  }
}
