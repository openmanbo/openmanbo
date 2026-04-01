/**
 * GrepTool – Search file contents with regex patterns.
 *
 * Aligned with Claude Code's GrepTool: searches files for a regex
 * pattern and returns matching lines with context.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, isAbsolute, relative, join } from "node:path";
import type { Tool, ToolResult } from "./types.js";

const MAX_RESULTS = 200;
const MAX_DEPTH = 15;
const MAX_FILE_SIZE = 500_000; // 500 KB

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "__pycache__",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "coverage",
  ".cache",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".tar", ".gz", ".bz2", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib", ".node",
  ".mp3", ".mp4", ".avi", ".mov", ".webm",
]);

export interface GrepToolOptions {
  cwd?: string;
}

export class GrepTool implements Tool {
  private readonly cwd: string;

  readonly spec = {
    name: "grep",
    description:
      "Search file contents using a regular expression pattern. " +
      "Returns matching lines with file path and line numbers. " +
      "Useful for finding function definitions, variable usage, imports, etc.",
    input: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for.",
        },
        path: {
          type: "string",
          description: "Directory or file to search in (default: working directory).",
        },
        include: {
          type: "string",
          description: "Glob-like pattern to filter files (e.g. '*.ts', '*.py').",
        },
        case_insensitive: {
          type: "boolean",
          description: "Whether to perform case-insensitive matching (default: false).",
        },
        context_lines: {
          type: "number",
          description: "Number of context lines before and after each match (default: 0).",
        },
      },
      required: ["pattern"],
    },
  };

  constructor(options?: GrepToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern;
    if (typeof pattern !== "string" || !pattern.trim()) {
      return { content: "Error: pattern must be a non-empty string.", isError: true };
    }

    const searchPath = typeof args.path === "string" && args.path.trim()
      ? (isAbsolute(args.path) ? args.path : resolve(this.cwd, args.path))
      : this.cwd;

    const flags = args.case_insensitive === true ? "gi" : "g";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (err) {
      return { content: `Error: Invalid regex pattern: ${String(err)}`, isError: true };
    }

    const includeFilter = typeof args.include === "string" ? args.include.trim() : undefined;
    const contextLines = typeof args.context_lines === "number" ? Math.max(0, Math.floor(args.context_lines)) : 0;

    try {
      const matches: GrepMatch[] = [];
      const pathStats = await stat(searchPath);

      if (pathStats.isFile()) {
        await searchFile(searchPath, searchPath, regex, matches, contextLines);
      } else {
        await walkAndSearch(searchPath, searchPath, regex, matches, includeFilter, contextLines, 0);
      }

      if (matches.length === 0) {
        return { content: `No matches found for pattern: ${pattern}` };
      }

      const truncated = matches.length > MAX_RESULTS;
      const shown = truncated ? matches.slice(0, MAX_RESULTS) : matches;

      const output = shown.map(formatMatch).join("\n");
      const suffix = truncated
        ? `\n\n[Showing ${MAX_RESULTS} of ${matches.length} matches]`
        : "";

      return {
        content: `Found ${matches.length} match(es) for "${pattern}":\n\n${output}${suffix}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${message}`, isError: true };
    }
  }
}

interface GrepMatch {
  file: string;
  line: number;
  text: string;
  context?: string[];
}

async function walkAndSearch(
  root: string,
  dir: string,
  regex: RegExp,
  results: GrepMatch[],
  includeFilter: string | undefined,
  contextLines: number,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS * 2) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkAndSearch(root, fullPath, regex, results, includeFilter, contextLines, depth + 1);
    } else if (entry.isFile()) {
      if (isBinary(entry.name)) continue;
      if (includeFilter && !simpleMatch(entry.name, includeFilter)) continue;

      await searchFile(fullPath, root, regex, results, contextLines);
    }
  }
}

async function searchFile(
  filePath: string,
  root: string,
  regex: RegExp,
  results: GrepMatch[],
  contextLines: number,
): Promise<void> {
  if (results.length >= MAX_RESULTS * 2) return;

  try {
    const fileStats = await stat(filePath);
    if (fileStats.size > MAX_FILE_SIZE) return;

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = relative(root, filePath) || filePath;

    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        const match: GrepMatch = {
          file: relPath,
          line: i + 1,
          text: lines[i],
        };

        if (contextLines > 0) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length, i + contextLines + 1);
          match.context = lines.slice(start, end);
        }

        results.push(match);
        if (results.length >= MAX_RESULTS * 2) return;
      }
    }
  } catch {
    // Can't read file – skip
  }
}

function formatMatch(match: GrepMatch): string {
  if (match.context) {
    return `${match.file}:${match.line}:\n${match.context.join("\n")}`;
  }
  return `${match.file}:${match.line}: ${match.text}`;
}

function isBinary(filename: string): boolean {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return BINARY_EXTENSIONS.has(filename.slice(dotIdx).toLowerCase());
}

/**
 * Simple pattern matching for include filters.
 * Supports: *.ext, prefix*, *infix*
 */
function simpleMatch(filename: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    return filename.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith("*")) {
    return filename.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*") && pattern.endsWith("*")) {
    return filename.includes(pattern.slice(1, -1));
  }
  return filename === pattern;
}
