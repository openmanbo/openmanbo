/**
 * GlobTool – Find files matching glob patterns.
 *
 * Aligned with Claude Code's GlobTool: recursively walks directories
 * and returns files matching a glob pattern.  Uses simple pattern
 * matching without an external dependency.
 */

import { readdir, stat } from "node:fs/promises";
import { resolve, isAbsolute, relative, join, basename } from "node:path";
import type { Tool, ToolResult } from "./types.js";

const MAX_RESULTS = 500;
const MAX_DEPTH = 20;

// Default directories/patterns to skip
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
  ".vscode",
  ".idea",
]);

export interface GlobToolOptions {
  cwd?: string;
}

export class GlobTool implements Tool {
  private readonly cwd: string;

  readonly spec = {
    name: "glob",
    description:
      "Find files matching a glob-like pattern. " +
      "Recursively searches directories and returns matching file paths. " +
      "Supports * (any chars in segment), ** (any path segments), and ? (single char). " +
      "Example patterns: '**/*.ts', 'src/**/*.test.ts', '*.json'.",
    input: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match files against (e.g. '**/*.ts').",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: working directory).",
        },
      },
      required: ["pattern"],
    },
  };

  constructor(options?: GlobToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern;
    if (typeof pattern !== "string" || !pattern.trim()) {
      return { content: "Error: pattern must be a non-empty string.", isError: true };
    }

    const searchDir = typeof args.path === "string" && args.path.trim()
      ? (isAbsolute(args.path) ? args.path : resolve(this.cwd, args.path))
      : this.cwd;

    try {
      const regex = globToRegex(pattern.trim());
      const matches: string[] = [];
      await walkDir(searchDir, searchDir, regex, matches, 0);

      if (matches.length === 0) {
        return { content: `No files found matching pattern: ${pattern}` };
      }

      matches.sort();
      const truncated = matches.length > MAX_RESULTS;
      const shown = truncated ? matches.slice(0, MAX_RESULTS) : matches;

      const result = shown.join("\n");
      const suffix = truncated
        ? `\n\n[Showing ${MAX_RESULTS} of ${matches.length} results. Narrow your pattern.]`
        : "";

      return {
        content: `Found ${matches.length} file(s) matching "${pattern}":\n\n${result}${suffix}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${message}`, isError: true };
    }
  }
}

async function walkDir(
  root: string,
  dir: string,
  regex: RegExp,
  results: string[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS * 2) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // permission denied, etc.
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(root, fullPath, regex, results, depth + 1);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const relPath = relative(root, fullPath);
      if (regex.test(relPath)) {
        results.push(relPath);
      }
    }
  }
}

/**
 * Convert a simple glob pattern to a regular expression.
 * Supports: ** (any path), * (any segment chars), ? (single char)
 */
function globToRegex(pattern: string): RegExp {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches any path (including separators)
      if (pattern[i + 2] === "/") {
        regex += "(?:.+/)?";
        i += 3;
      } else {
        regex += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regex += "[^/]*";
      i++;
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (ch === ".") {
      regex += "\\.";
      i++;
    } else if (ch === "{") {
      // Simple brace expansion: {a,b,c}
      const closeIdx = pattern.indexOf("}", i);
      if (closeIdx !== -1) {
        const alternatives = pattern.slice(i + 1, closeIdx).split(",");
        regex += "(?:" + alternatives.map(escapeRegex).join("|") + ")";
        i = closeIdx + 1;
      } else {
        regex += "\\{";
        i++;
      }
    } else {
      regex += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp("^" + regex + "$");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
