import OpenAI from "openai";
import type { BuiltinReflectionToolConfig } from "./types.js";

const DEFAULT_REFLECTION_TOOL_NAME = "self-reflection";
const DEFAULT_MAX_INPUT_CHARS = 12_000;

const DEFAULT_SYSTEM_PROMPT = [
  "You are a concise operational reviewer for an autonomous coding agent.",
  "Review the just-completed work and produce a short, critical reflection.",
  "Do not give praise or motivational language.",
  "Focus on concrete misses, residual risk, and one or two adjustments that should change the next action.",
  "Prefer the same language as the task description when it is clear.",
  "Return plain text with these sections:",
  "Status: <completed|partial|blocked>",
  "Worked:",
  "- ...",
  "Risks:",
  "- ...",
  "Adjustments:",
  "- ...",
].join("\n");

interface BuiltinTool {
  name: string;
  definition: OpenAI.ChatCompletionTool;
  execute(args: Record<string, unknown>): Promise<string>;
}

export class BuiltinReflectionTool implements BuiltinTool {
  readonly name: string;
  readonly definition: OpenAI.ChatCompletionTool;
  private readonly maxInputChars: number;
  private readonly systemPrompt: string;
  private client: OpenAI | undefined;
  private model: string | undefined;

  constructor(config: BuiltinReflectionToolConfig) {
    this.name = config.name?.trim() || DEFAULT_REFLECTION_TOOL_NAME;
    this.maxInputChars = sanitizePositiveInteger(
      config.maxInputChars,
      DEFAULT_MAX_INPUT_CHARS,
    );
    this.systemPrompt = config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

    this.definition = {
      type: "function",
      function: {
        name: this.name,
        description:
          config.description?.trim() ||
          "Review the last completed task, identify misses or risks, and suggest concrete adjustments before continuing.",
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "What the agent was trying to accomplish.",
            },
            summary: {
              type: "string",
              description: "What the agent actually did.",
            },
            outcome: {
              type: "string",
              description: "What result was reached, including remaining gaps.",
            },
            blockers: {
              type: "string",
              description: "Optional blockers, uncertainties, or unexpected issues.",
            },
            nextFocus: {
              type: "string",
              description: "Optional description of the next task or the next notification to handle.",
            },
          },
          required: ["task", "summary", "outcome"],
          additionalProperties: false,
        },
      },
    };
  }

  configure(client: OpenAI, model: string): void {
    this.client = client;
    this.model = model;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const task = readRequiredString(args.task, "task");
    const summary = readRequiredString(args.summary, "summary");
    const outcome = readRequiredString(args.outcome, "outcome");
    const blockers = readOptionalString(args.blockers);
    const nextFocus = readOptionalString(args.nextFocus);

    if (!this.client || !this.model) {
      return "Error: self-reflection tool is not configured with an LLM client. This is a setup issue.";
    }

    const prompt = truncateInput(
      [
        `Task:\n${task}`,
        `Summary:\n${summary}`,
        `Outcome:\n${outcome}`,
        blockers ? `Blockers:\n${blockers}` : undefined,
        nextFocus ? `Next focus:\n${nextFocus}` : undefined,
      ]
        .filter((section): section is string => Boolean(section))
        .join("\n\n"),
      this.maxInputChars,
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      });

      return response.choices[0]?.message?.content ?? "No reflection generated.";
    } catch (err) {
      return `Error generating reflection: ${String(err)}`;
    }
  }
}

function sanitizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || value === undefined || value <= 0) {
    return fallback;
  }

  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`The self-reflection tool requires a non-empty '${fieldName}' argument.`);
  }

  return normalized;
}

function readOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function truncateInput(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - 17)}\n\n[truncated input]`;
}