import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SkillDefinition } from "./prompt.js";
import { buildSkillPrompt } from "./prompt.js";

export interface SkillRoutingOptions {
  message: string;
  skills: SkillDefinition[];
}

export interface SkillRouteResult {
  content: string;
  activeSkills: SkillDefinition[];
  mode: "none" | "automatic" | "explicit";
  matchedSkillNames: string[];
  usageHint?: string;
}

interface ExplicitRouteMatch {
  skillNames: string[];
  content: string;
  unknownSkillNames: string[];
}

export function routeSkills(options: SkillRoutingOptions): SkillRouteResult {
  const eligibleSkills = options.skills;
  const explicitMatch = matchExplicitSkillRoute(options.message, eligibleSkills);
  if (explicitMatch) {
    const activeSkills = selectSkillsByName(eligibleSkills, explicitMatch.skillNames);
    const availableSkillNames = eligibleSkills.map((skill) => skill.name).sort();

    if (explicitMatch.unknownSkillNames.length > 0) {
      return {
        content: explicitMatch.content,
        activeSkills: [],
        mode: "explicit",
        matchedSkillNames: [],
        usageHint: buildUnknownSkillHint(
          explicitMatch.unknownSkillNames,
          availableSkillNames,
        ),
      };
    }

    return {
      content: explicitMatch.content,
      activeSkills,
      mode: "explicit",
      matchedSkillNames: activeSkills.map((skill) => skill.name),
      usageHint: explicitMatch.content
        ? undefined
        : buildUsageHint(availableSkillNames),
    };
  }

  return {
    content: options.message.trim(),
    activeSkills: [],
    mode: "none",
    matchedSkillNames: [],
  };
}

export function buildSkillRouteMessages(
  activeSkills: SkillDefinition[],
): ChatCompletionMessageParam[] {
  const skillPrompt = buildSkillPrompt(activeSkills);
  if (!skillPrompt) {
    return [];
  }

  return [{ role: "system", content: skillPrompt }];
}

function matchExplicitSkillRoute(
  message: string,
  skills: SkillDefinition[],
): ExplicitRouteMatch | undefined {
  const trimmed = message.trim();
  const availableSkillNames = new Set(skills.map((skill) => normalizeSkillName(skill.name)));
  const simpleMatch = trimmed.match(/^\/([A-Za-z0-9_-]+)\b\s*(.*)$/i);
  if (simpleMatch) {
    const [, command, rawContent] = simpleMatch;
    const normalizedCommand = normalizeSkillName(command);
    if (normalizedCommand === "skills") {
      return undefined;
    }

    return {
      skillNames: availableSkillNames.has(normalizedCommand)
        ? [normalizedCommand]
        : [],
      content: rawContent.trim(),
      unknownSkillNames: availableSkillNames.has(normalizedCommand)
        ? []
        : [command],
    };
  }

  const multiSkillMatch = trimmed.match(/^\/skills\s+([A-Za-z0-9_,-]+)(?:\s+([\s\S]+))?$/i);
  if (!multiSkillMatch) {
    return undefined;
  }

  const [, rawSkillNames, rawContent = ""] = multiSkillMatch;
  const normalizedNames = rawSkillNames
    .split(",")
    .map((name) => normalizeSkillName(name))
    .filter(Boolean);

  const skillNames = normalizedNames.filter((name) => availableSkillNames.has(name));
  const unknownSkillNames = normalizedNames.filter((name) => !availableSkillNames.has(name));

  return {
    skillNames,
    content: rawContent.trim(),
    unknownSkillNames,
  };
}

function selectSkillsByName(
  skills: SkillDefinition[],
  skillNames: string[],
): SkillDefinition[] {
  const selected = new Set(skillNames.map((name) => normalizeSkillName(name)));
  return skills.filter((skill) => selected.has(normalizeSkillName(skill.name)));
}

function normalizeSkillName(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function buildUsageHint(availableSkillNames: string[]): string {
  const available = availableSkillNames.length
    ? `Available skills: ${availableSkillNames.join(", ")}`
    : "No skills are currently available.";

  const exampleSkill = availableSkillNames[0] ?? "plan";
  const examplePair = availableSkillNames.slice(0, 2);
  const multiSkillExample = examplePair.length >= 2
    ? examplePair.join(",")
    : `${exampleSkill},tools`;

  return [
    "Usage:",
    `- /${exampleSkill} <request>`,
    `- /skills ${multiSkillExample} <request>`,
    available,
  ].join("\n");
}

function buildUnknownSkillHint(
  unknownSkillNames: string[],
  availableSkillNames: string[],
): string {
  return [
    `Unknown skills: ${unknownSkillNames.join(", ")}`,
    buildUsageHint(availableSkillNames),
  ].join("\n\n");
}