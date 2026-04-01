/**
 * FileWriteTool – Create or overwrite files.
 *
 * Aligned with Claude Code's FileWriteTool: writes content to a file,
 * creating parent directories if necessary.
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import type { Tool, ToolResult } from "./types.js";

export interface FileWriteToolOptions {
  cwd?: string;
}

export class FileWriteTool implements Tool {
  private readonly cwd: string;

  readonly spec = {
    name: "file_write",
    description:
      "Create a new file or overwrite an existing file with the provided content. " +
      "Parent directories are created automatically if they don't exist. " +
      "Use this for creating new files. Use file_edit for modifying existing files.",
    input: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path for the file.",
        },
        content: {
          type: "string",
          description: "The full content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  };

  constructor(options?: FileWriteToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const rawPath = args.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return { content: "Error: path must be a non-empty string.", isError: true };
    }

    const content = args.content;
    if (typeof content !== "string") {
      return { content: "Error: content must be a string.", isError: true };
    }

    const filePath = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath);

    try {
      // Check if it already exists and is a directory
      try {
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
          return {
            content: `Error: "${filePath}" is an existing directory. Provide a file path.`,
            isError: true,
          };
        }
      } catch {
        // File doesn't exist yet – that's fine
      }

      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");

      const lineCount = content.split("\n").length;
      return {
        content: `Successfully wrote ${content.length} characters (${lineCount} lines) to ${filePath}.`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error writing file: ${message}`, isError: true };
    }
  }
}
