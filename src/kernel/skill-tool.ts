import type OpenAI from "openai";
import type { SkillDefinition } from "./prompt.js";

const LOAD_SKILL_TOOL_NAME = "load-skill";

type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

export function createSkillTool(): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: LOAD_SKILL_TOOL_NAME,
      description:
        "Load the full instructions for a named skill from the available skill catalog. Use this when a listed skill is relevant and you need its exact instructions before acting.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Exact skill name to load.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  };
}

export function withSkillTool(options: {
  skills?: SkillDefinition[];
  tools?: OpenAI.ChatCompletionTool[];
  toolExecutor?: ToolExecutor;
}): {
  tools?: OpenAI.ChatCompletionTool[];
  toolExecutor?: ToolExecutor;
} {
  const skills = options.skills ?? [];
  const baseTools = options.tools ?? [];

  if (!skills.length) {
    return {
      tools: baseTools.length ? baseTools : undefined,
      toolExecutor: options.toolExecutor,
    };
  }

  const tools = [...baseTools, createSkillTool()];

  return {
    tools,
    toolExecutor: async (name, args) => {
      if (name === LOAD_SKILL_TOOL_NAME) {
        return executeLoadSkill(skills, args);
      }

      if (options.toolExecutor) {
        return options.toolExecutor(name, args);
      }

      throw new Error(`Unknown tool: ${name}`);
    },
  };
}

function executeLoadSkill(
  skills: SkillDefinition[],
  args: Record<string, unknown>,
): string {
  const requestedName = typeof args.name === "string" ? args.name : "";
  const normalizedName = normalizeSkillName(requestedName);
  const skill = skills.find((entry) => normalizeSkillName(entry.name) === normalizedName);

  if (!skill) {
    const available = skills.map((entry) => entry.name).sort().join(", ");
    return [
      `Skill not found: ${requestedName || "(empty)"}`,
      `Available skills: ${available || "none"}`,
    ].join("\n");
  }

  return [
    `Loaded skill: ${skill.name}`,
    `Source: ${skill.source}`,
    ...(skill.description ? [`Description: ${skill.description}`] : []),
    "",
    skill.content.trim(),
  ].join("\n");
}

function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}