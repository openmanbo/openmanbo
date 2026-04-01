/**
 * Context module – Assembles runtime context for system prompts.
 *
 * Aligned with Claude Code's context pattern:
 * - Git status (branch, working tree state)
 * - Current date/time
 * - Memory files (OPENMANBO.md, similar to CLAUDE.md)
 * - Working directory info
 */

import { execFile } from "node:child_process";
import { readFile, readdir, stat, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_GIT_STATUS_CHARS = 2_000;
const MAX_MEMORY_FILE_CHARS = 10_000;

/* ────────────────────────────────────────────────────────────────────
 * Context types
 * ──────────────────────────────────────────────────────────────────── */

export interface SystemContext {
  /** Git branch and working tree status */
  gitStatus?: string;
  /** Current date/time string */
  currentDate: string;
  /** Working directory path */
  cwd: string;
}

export interface UserContext {
  /** Concatenated memory file contents (OPENMANBO.md) */
  memoryContent?: string;
}

export interface FullContext {
  system: SystemContext;
  user: UserContext;
}

/* ────────────────────────────────────────────────────────────────────
 * Git context
 * ──────────────────────────────────────────────────────────────────── */

async function getGitStatus(cwd: string): Promise<string | undefined> {
  try {
    const [branchResult, statusResult, logResult] = await Promise.all([
      execFileAsync("git", ["branch", "--show-current"], { cwd, timeout: 5_000 }).catch(() => null),
      execFileAsync("git", ["status", "--short"], { cwd, timeout: 5_000 }).catch(() => null),
      execFileAsync("git", ["log", "--oneline", "-5"], { cwd, timeout: 5_000 }).catch(() => null),
    ]);

    if (!branchResult && !statusResult) return undefined;

    const parts: string[] = [];

    if (branchResult?.stdout.trim()) {
      parts.push(`Branch: ${branchResult.stdout.trim()}`);
    }

    if (statusResult?.stdout.trim()) {
      const status = statusResult.stdout.trim();
      const truncated = status.length > MAX_GIT_STATUS_CHARS
        ? status.slice(0, MAX_GIT_STATUS_CHARS) + "\n... (truncated)"
        : status;
      parts.push(`Working tree:\n${truncated}`);
    } else {
      parts.push("Working tree: clean");
    }

    if (logResult?.stdout.trim()) {
      parts.push(`Recent commits:\n${logResult.stdout.trim()}`);
    }

    return parts.join("\n\n");
  } catch {
    return undefined;
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Memory file discovery (OPENMANBO.md)
 *
 * Similar to Claude Code's CLAUDE.md discovery:
 * - Searches from cwd upward for OPENMANBO.md files
 * - Also checks home directory
 * - Concatenates all found files
 * ──────────────────────────────────────────────────────────────────── */

const MEMORY_FILE_NAMES = ["OPENMANBO.md", ".openmanbo.md"];

async function findMemoryFiles(cwd: string): Promise<string[]> {
  const found: string[] = [];
  const visited = new Set<string>();

  // Walk upward from cwd
  let dir = resolve(cwd);
  while (true) {
    if (visited.has(dir)) break;
    visited.add(dir);

    for (const name of MEMORY_FILE_NAMES) {
      const filePath = join(dir, name);
      try {
        await access(filePath);
        found.push(filePath);
      } catch {
        // Not found at this level
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break; // Reached root
    dir = parent;
  }

  // Also check home directory
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && !visited.has(resolve(home))) {
    for (const name of MEMORY_FILE_NAMES) {
      const filePath = join(home, name);
      try {
        await access(filePath);
        found.push(filePath);
      } catch {
        // Not found
      }
    }
  }

  return found;
}

async function loadMemoryContent(cwd: string): Promise<string | undefined> {
  const files = await findMemoryFiles(cwd);
  if (files.length === 0) return undefined;

  const sections: string[] = [];

  for (const filePath of files) {
    try {
      let content = await readFile(filePath, "utf-8");
      content = content.trim();
      if (!content) continue;

      if (content.length > MAX_MEMORY_FILE_CHARS) {
        content = content.slice(0, MAX_MEMORY_FILE_CHARS) + "\n... (truncated)";
      }

      sections.push(`### ${filePath}\n\n${content}`);
    } catch {
      // Skip unreadable files
    }
  }

  if (sections.length === 0) return undefined;

  return "## Memory Files\n\n" + sections.join("\n\n---\n\n");
}

/* ────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Gather system context (git status, date, cwd).
 */
export async function getSystemContext(cwd: string): Promise<SystemContext> {
  const gitStatus = await getGitStatus(cwd);

  return {
    gitStatus,
    currentDate: new Date().toISOString(),
    cwd,
  };
}

/**
 * Gather user context (memory files).
 */
export async function getUserContext(cwd: string): Promise<UserContext> {
  const memoryContent = await loadMemoryContent(cwd);
  return { memoryContent };
}

/**
 * Gather full context for system prompt assembly.
 */
export async function getFullContext(cwd: string): Promise<FullContext> {
  const [system, user] = await Promise.all([
    getSystemContext(cwd),
    getUserContext(cwd),
  ]);
  return { system, user };
}

/**
 * Format context into system prompt sections.
 */
export function formatContextSections(context: FullContext): string[] {
  const sections: string[] = [];

  // Working directory
  sections.push(`Working directory: ${context.system.cwd}`);

  // Current date
  sections.push(`Current date: ${context.system.currentDate}`);

  // Git status
  if (context.system.gitStatus) {
    sections.push(`## Git Status\n\n${context.system.gitStatus}`);
  }

  // Memory files
  if (context.user.memoryContent) {
    sections.push(context.user.memoryContent);
  }

  return sections;
}
