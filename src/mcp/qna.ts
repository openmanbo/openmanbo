import OpenAI from "openai";
import type { BuiltinQnaToolConfig, QnaTopic } from "./types.js";

const DEFAULT_QNA_TOOL_NAME = "ask";

interface BuiltinTool {
  name: string;
  definition: OpenAI.ChatCompletionTool;
  execute(args: Record<string, unknown>): Promise<string>;
}

/**
 * Built-in Q&A tool that answers questions using instruction files.
 * Behind the tool call there is a single LLM API call with the
 * instruction content as system prompt and the user question as the message.
 */
export class BuiltinQnaTool implements BuiltinTool {
  readonly name: string;
  readonly definition: OpenAI.ChatCompletionTool;
  private readonly topics: QnaTopic[];
  private client: OpenAI | undefined;
  private model: string | undefined;

  constructor(config: BuiltinQnaToolConfig) {
    this.name = config.name?.trim() || DEFAULT_QNA_TOOL_NAME;
    this.topics = config.topics;

    const topicDescriptions = this.topics
      .map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`)
      .join("\n");

    this.definition = {
      type: "function",
      function: {
        name: this.name,
        description:
          config.description?.trim() ||
          `Ask a question and get an answer from the knowledge base. Available topics:\n${topicDescriptions}`,
        parameters: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: `The topic to ask about. Must be one of: ${this.topics.map((t) => t.name).join(", ")}`,
              enum: this.topics.map((t) => t.name),
            },
            question: {
              type: "string",
              description: "The question to ask.",
            },
          },
          required: ["topic", "question"],
          additionalProperties: false,
        },
      },
    };
  }

  /**
   * Inject the LLM client and model for the sub-agent call.
   * This must be called before execute() can work.
   */
  configure(client: OpenAI, model: string): void {
    this.client = client;
    this.model = model;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const topicName = typeof args.topic === "string" ? args.topic.trim() : "";
    const question = typeof args.question === "string" ? args.question.trim() : "";

    if (!question) {
      return "Error: question cannot be empty.";
    }

    const topic = this.topics.find(
      (t) => t.name.toLowerCase() === topicName.toLowerCase(),
    );

    if (!topic) {
      const available = this.topics.map((t) => t.name).join(", ");
      return `Unknown topic: ${topicName || "(empty)"}. Available topics: ${available || "none"}`;
    }

    if (!this.client || !this.model) {
      return `Error: Q&A tool is not configured with an LLM client. This is a setup issue.`;
    }

    // Single API call: instruction as system prompt, user question as message
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: topic.content },
          { role: "user", content: question },
        ],
        stream: false,
      });

      return response.choices[0]?.message?.content ?? "No answer generated.";
    } catch (err) {
      return `Error answering question: ${String(err)}`;
    }
  }
}
