export interface SkillDefinition {
  name: string;
  description?: string;
  content: string;
  source: string;
}

export const DEFAULT_SYSTEM_PROMPT =
  "You are Manbo, a helpful and concise AI assistant.";

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

export function buildSystemPrompt(options: {
  identity?: string;
  skills?: SkillDefinition[];
}): string {
  const basePrompt = options.identity?.trim() || DEFAULT_SYSTEM_PROMPT;
  const skillPrompt = buildSkillCatalogPrompt(options.skills);

  if (!skillPrompt) {
    return basePrompt;
  }

  return [
    basePrompt,
    skillPrompt,
  ].join("\n\n");
}