import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SkillDefinition } from "./prompt.js";
import { buildSkillPrompt } from "./prompt.js";

const MAX_AUTO_SKILLS = 3;

export interface SkillRoutingOptions {
  channel: string;
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
  const eligibleSkills = filterSkillsForChannel(options.skills, options.channel);
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

  const normalizedMessage = normalizeText(options.message);
  const scoredSkills = eligibleSkills
    .map((skill) => ({
      skill,
      score: scoreSkill(skill, normalizedMessage),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, MAX_AUTO_SKILLS)
    .map((entry) => entry.skill);

  return {
    content: options.message.trim(),
    activeSkills: scoredSkills,
    mode: scoredSkills.length ? "automatic" : "none",
    matchedSkillNames: scoredSkills.map((skill) => skill.name),
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

function filterSkillsForChannel(
  skills: SkillDefinition[],
  channel: string,
): SkillDefinition[] {
  const normalizedChannel = normalizeText(channel);
  return skills.filter((skill) => {
    if (!skill.channels.length) {
      return true;
    }

    return skill.channels.some((entry) => normalizeText(entry) === normalizedChannel);
  });
}

function matchExplicitSkillRoute(
  message: string,
  skills: SkillDefinition[],
): ExplicitRouteMatch | undefined {
  const trimmed = message.trim();
  const simpleMatch = trimmed.match(/^\/(plan|tools?|search|inspect)\b\s*(.*)$/i);
  if (simpleMatch) {
    const [, command, rawContent] = simpleMatch;
    const alias = normalizeExplicitAlias(command);
    return {
      skillNames: alias ? [alias] : [],
      content: rawContent.trim(),
      unknownSkillNames: alias ? [] : [command],
    };
  }

  const multiSkillMatch = trimmed.match(/^\/skills\s+([A-Za-z0-9_,-]+)(?:\s+([\s\S]+))?$/i);
  if (!multiSkillMatch) {
    return undefined;
  }

  const [, rawSkillNames, rawContent = ""] = multiSkillMatch;
  const normalizedNames = rawSkillNames
    .split(",")
    .map((name) => normalizeExplicitSkillToken(name))
    .filter(Boolean);

  const availableSkillNames = new Set(skills.map((skill) => normalizeSkillName(skill.name)));
  const skillNames = normalizedNames.filter((name) => availableSkillNames.has(name));
  const unknownSkillNames = normalizedNames.filter((name) => !availableSkillNames.has(name));

  return {
    skillNames,
    content: rawContent.trim(),
    unknownSkillNames,
  };
}

function normalizeExplicitAlias(command: string): string | undefined {
  const normalized = normalizeText(command);
  if (normalized === "plan") {
    return "planning";
  }
  if (normalized === "tool" || normalized === "tools" || normalized === "search") {
    return "tool-use";
  }
  if (normalized === "inspect") {
    return "workspace-inspection";
  }

  return undefined;
}

function normalizeExplicitSkillToken(value: string): string {
  const normalized = normalizeSkillName(value);
  return normalizeExplicitAlias(normalized) ?? normalized;
}

function selectSkillsByName(
  skills: SkillDefinition[],
  skillNames: string[],
): SkillDefinition[] {
  const selected = new Set(skillNames.map((name) => normalizeSkillName(name)));
  return skills.filter((skill) => selected.has(normalizeSkillName(skill.name)));
}

function scoreSkill(skill: SkillDefinition, normalizedMessage: string): number {
  const candidates = [
    ...skill.triggers,
    ...collectDescriptionPhrases(skill.description),
    skill.name,
  ];

  return candidates.reduce((score, candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) {
      return score;
    }

    return normalizedMessage.includes(normalizedCandidate) ? score + normalizedCandidate.length : score;
  }, 0);
}

function collectDescriptionPhrases(description: string | undefined): string[] {
  if (!description) {
    return [];
  }

  return description
    .split(/[.,;]|\b(?:and|or|when|for|with)\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
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
    : "No skills are currently available for this channel.";

  return [
    "Usage:",
    "- /tools <request>",
    "- /plan <request>",
    "- /skills tool-use,planning <request>",
    "- /skills tools,plan <request>",
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