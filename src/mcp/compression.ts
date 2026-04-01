import OpenAI from "openai";
import type { ToolExecutionResult } from "../kernel/tool-execution.js";
import type { BuiltinContextCompressionToolConfig } from "./types.js";

const DEFAULT_CONTEXT_COMPRESSION_TOOL_NAME = "compress_context";
const DEFAULT_MAX_INPUT_CHARS = 16_000;

const DEFAULT_SYSTEM_PROMPT = [
  "You compress working context for an autonomous coding agent.",
  "Rewrite the provided state into a compact continuation snapshot.",
  "Keep only durable information needed to continue correctly: objective, completed work, important identifiers, decisions, unresolved items, risks, and the next action.",
  "Drop repetition, narration, and low-value detail.",
  "Prefer the same language as the task when it is clear.",
  "Return plain text with these sections:",
  "Objective: ...",
  "Completed:",
  "- ...",
  "Carry Forward:",
  "- ...",
  "Open Items:",
  "- ...",
  "Next Step:",
  "- ...",
].join("\n");

interface BuiltinTool {
  name: string;
  definition: OpenAI.ChatCompletionTool;
  execute(args: Record<string, unknown>): Promise<ToolExecutionResult | string>;
}

export class BuiltinContextCompressionTool implements BuiltinTool {
  readonly name: string;
  readonly definition: OpenAI.ChatCompletionTool;
  private readonly maxInputChars: number;
  private readonly systemPrompt: string;
  private client: OpenAI | undefined;
  private model: string | undefined;

  constructor(config: BuiltinContextCompressionToolConfig) {
    this.name = config.name?.trim() || DEFAULT_CONTEXT_COMPRESSION_TOOL_NAME;
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
          "Compress the current working context into a compact continuation snapshot and replace the agent's active context with that snapshot.",
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The overall task or objective being pursued.",
            },
            completed: {
              type: "string",
              description: "Work already completed that should not be repeated.",
            },
            openItems: {
              type: "string",
              description: "Remaining work, unresolved questions, or pending items.",
            },
            carryForward: {
              type: "string",
              description: "Important facts, identifiers, constraints, or decisions that must be preserved.",
            },
            nextStep: {
              type: "string",
              description: "The single most important immediate next action.",
            },
          },
          required: ["task", "completed", "openItems"],
          additionalProperties: false,
        },
      },
    };
  }

  configure(client: OpenAI, model: string): void {
    this.client = client;
    this.model = model;
  }

  async execute(args: Record<string, unknown>): Promise<ToolExecutionResult | string> {
    const task = readRequiredString(args.task, "task");
    const completed = readRequiredString(args.completed, "completed");
    const openItems = readRequiredString(args.openItems, "openItems");
    const carryForward = readOptionalString(args.carryForward);
    const nextStep = readOptionalString(args.nextStep);

    if (!this.client || !this.model) {
      return "Error: compress_context tool is not configured with an LLM client. This is a setup issue.";
    }

    const prompt = truncateInput(
      [
        `Task:\n${task}`,
        `Completed:\n${completed}`,
        carryForward ? `Carry forward:\n${carryForward}` : undefined,
        `Open items:\n${openItems}`,
        nextStep ? `Next step:\n${nextStep}` : undefined,
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

      const summary = response.choices[0]?.message?.content?.trim();
      if (!summary) {
        return "No compressed context generated.";
      }

      return {
        content: [
          "Context compressed. Continue from this snapshot:",
          "",
          summary,
        ].join("\n"),
        compactContext: {
          summary,
        },
      };
    } catch (err) {
      return `Error generating compressed context: ${String(err)}`;
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
    throw new Error(`The compress_context tool requires a non-empty '${fieldName}' argument.`);
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
