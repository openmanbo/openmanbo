import type { FullContext } from "../context/index.js";
import { formatContextSections } from "../context/index.js";

export interface SkillDefinition {
  name: string;
  description?: string;
  content: string;
  source: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are Manbo, an intelligent AI coding assistant.

You are pair programming with a developer. You have access to tools for reading, writing, and searching files, running shell commands, and fetching web content.

## Guidelines

- Be concise and direct in your responses.
- When asked to make changes, use the available tools to implement them directly.
- Use the bash tool for running commands, tests, builds, and file operations.
- Use file_read to examine files before editing them.
- Use file_edit for precise search-and-replace edits to existing files.
- Use file_write to create new files.
- Use glob and grep to find relevant files and code patterns.
- Always verify your changes work by running appropriate commands.
- If you're unsure about something, say so rather than guessing.`;

export function buildSkillCatalogPrompt(skills?: SkillDefinition[]): string | undefined {
  const visibleSkills = skills?.filter((skill) => skill.description?.trim()) ?? [];

  if (!visibleSkills.length) {
    return undefined;
  }

  const skillLines = visibleSkills
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => `- ${skill.name}: ${skill.description?.trim()}`);

  return [
    "## Available Skills",
    "The following skills are available in this workspace.",
    "When one is relevant, call the `load-skill` tool with the exact skill name to load its full instructions before using it.",
    "Do not load skills speculatively. Continue normally when no skill is a clear fit.",
    ...skillLines,
  ].join("\n\n");
}

export function buildSkillPrompt(skills?: SkillDefinition[]): string | undefined {
  const activeSkills = skills?.filter((skill) => skill.content.trim()) ?? [];

  if (!activeSkills.length) {
    return undefined;
  }

  const skillSections = activeSkills.map((skill) => {
    const headerLines = [`### ${skill.name}`, `Source: ${skill.source}`];
    if (skill.description?.trim()) {
      headerLines.push(`Description: ${skill.description.trim()}`);
    }

    return [
      ...headerLines,
      skill.content.trim(),
    ].join("\n");
  });

  return [
    "## Active Skills",
    "Apply the following skills when they are relevant for the current request. Prefer the most specific skill for the task. Follow tool-use instructions from these skills before relying on unsupported assumptions.",
    ...skillSections,
  ].join("\n\n");
}

/**
 * Options for building the system prompt.
 * Aligned with Claude Code's multi-part prompt assembly pattern.
 */
export interface SystemPromptOptions {
  /** Custom identity prompt (replaces default if provided) */
  identity?: string;
  /** Available skills */
  skills?: SkillDefinition[];
  /** Runtime context (git, date, memory files) */
  context?: FullContext;
  /** Available tool names (for the tool description section) */
  toolNames?: string[];
  /** Custom prompt to append */
  appendPrompt?: string;
}

/**
 * Build the complete system prompt from multiple parts.
 *
 * Assembly order (aligned with Claude Code):
 * 1. Base identity prompt (or default)
 * 2. Tool availability overview
 * 3. Context sections (working dir, date, git, memory)
 * 4. Skill catalog
 * 5. Appended custom prompt
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const parts: string[] = [];

  // 1. Base identity prompt
  parts.push(options.identity?.trim() || DEFAULT_SYSTEM_PROMPT);

  // 2. Tool availability
  if (options.toolNames?.length) {
    parts.push(
      `## Available Tools\n\nYou have access to the following tools: ${options.toolNames.join(", ")}.`,
    );
  }

  // 3. Context sections (git, date, memory)
  if (options.context) {
    const contextSections = formatContextSections(options.context);
    if (contextSections.length) {
      parts.push(...contextSections);
    }
  }

  // 4. Skill catalog
  const skillPrompt = buildSkillCatalogPrompt(options.skills);
  if (skillPrompt) {
    parts.push(skillPrompt);
  }

  // 5. Custom append
  if (options.appendPrompt?.trim()) {
    parts.push(options.appendPrompt.trim());
  }

  return parts.join("\n\n");
}