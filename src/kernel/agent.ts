import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

export interface AgentOptions {
  /** The OpenAI-compatible client */
  client: OpenAI;
  /** Model name */
  model: string;
  /** System prompt that defines the agent's persona and capabilities */
  systemPrompt?: string;
}

/**
 * The Agent class implements a conversational reasoning loop.
 * It manages conversation history and streams responses from the LLM.
 */
export class Agent {
  private client: OpenAI;
  private model: string;
  private messages: ChatCompletionMessageParam[];

  constructor(options: AgentOptions) {
    this.client = options.client;
    this.model = options.model;
    this.messages = [];

    if (options.systemPrompt) {
      this.messages.push({ role: "system", content: options.systemPrompt });
    }
  }

  /**
   * Send a user message and stream the assistant's response.
   * Yields string chunks as they arrive.
   */
  async *chat(userMessage: string): AsyncGenerator<string, void, undefined> {
    this.messages.push({ role: "user", content: userMessage });

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      stream: true,
    });

    let fullResponse = "";

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        yield delta;
      }
    }

    this.messages.push({ role: "assistant", content: fullResponse });
  }

  /**
   * Send a user message and return the full response at once (non-streaming).
   */
  async run(userMessage: string): Promise<string> {
    this.messages.push({ role: "user", content: userMessage });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      stream: false,
    });

    const content = response.choices[0]?.message?.content ?? "";
    this.messages.push({ role: "assistant", content });
    return content;
  }

  /**
   * Get a copy of the current conversation history.
   */
  getHistory(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }

  /**
   * Reset conversation history, optionally keeping the system prompt.
   */
  reset(): void {
    const systemMsg = this.messages.find((m) => m.role === "system");
    this.messages = systemMsg ? [systemMsg] : [];
  }
}
