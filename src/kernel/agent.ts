import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionChunk,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from "openai/resources/chat/completions";

export interface AgentOptions {
  /** The OpenAI-compatible client */
  client: OpenAI;
  /** Model name */
  model: string;
  /** System prompt that defines the agent's persona and capabilities */
  systemPrompt?: string;
  /** Optional tools (e.g. from MCP servers) to expose to the model */
  tools?: ChatCompletionTool[];
  /** Called to execute a tool call by name with the given arguments */
  toolExecutor?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  /** Optional event handlers for observing turns and tool execution. */
  eventHandlers?: AgentEventHandlers;
}

export interface AgentTurnOptions {
  turnMessages?: ChatCompletionMessageParam[];
}

export interface AgentToolEventPayload {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argumentsRaw: string;
}

export interface AgentToolResultEventPayload extends AgentToolEventPayload {
  result: string;
}

export interface AgentToolErrorEventPayload extends AgentToolEventPayload {
  error: string;
}

export interface AgentEventHandlers {
  onToolCallStart?: (payload: AgentToolEventPayload) => void;
  onToolCallSuccess?: (payload: AgentToolResultEventPayload) => void;
  onToolCallError?: (payload: AgentToolErrorEventPayload) => void;
}

/**
 * The Agent class implements a conversational reasoning loop.
 * It manages conversation history and streams responses from the LLM.
 */
export class Agent {
  private client: OpenAI;
  private model: string;
  private messages: ChatCompletionMessageParam[];
  private tools: ChatCompletionTool[] | undefined;
  private toolExecutor:
    | ((name: string, args: Record<string, unknown>) => Promise<string>)
    | undefined;
  private eventHandlers: AgentEventHandlers;

  constructor(options: AgentOptions) {
    this.client = options.client;
    this.model = options.model;
    this.messages = [];
    this.tools = options.tools?.length ? options.tools : undefined;
    this.toolExecutor = options.toolExecutor;
    this.eventHandlers = options.eventHandlers ?? {};

    if (options.systemPrompt) {
      this.messages.push({ role: "system", content: options.systemPrompt });
    }
  }

  setEventHandlers(eventHandlers: AgentEventHandlers | undefined): void {
    this.eventHandlers = eventHandlers ?? {};
  }

  /**
   * Build a user message param, optionally prefixing the content with the
   * speaker's name so the LLM can distinguish participants.
   */
  private buildUserMessage(
    text: string,
    name?: string,
  ): ChatCompletionUserMessageParam {
    const content = name ? `[${name}]: ${text}` : text;
    return {
      role: "user",
      content,
      ...(name ? { name } : {}),
    };
  }

  /**
   * Send a user message and stream the assistant's response.
   * Yields string chunks as they arrive.
   * Handles tool calls transparently: tool results are fed back to the model
   * until the model produces a final text response.
   *
   * @param userMessage - The text content of the user message.
   * @param name - Optional speaker name to distinguish between participants.
   */
  async *chat(
    userMessage: string,
    name?: string,
    options?: AgentTurnOptions,
  ): AsyncGenerator<string, void, undefined> {
    const transientTurnMessages = options?.turnMessages ?? [];
    const turnMessages: ChatCompletionMessageParam[] = [
      this.buildUserMessage(userMessage, name),
    ];

    while (true) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [...this.messages, ...transientTurnMessages, ...turnMessages],
        stream: true,
        ...(this.tools ? { tools: this.tools } : {}),
      });

      let fullResponse = "";
      const toolCalls: Array<{
        index: number;
        id: string;
        name: string;
        argumentsRaw: string;
      }> = [];

      for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullResponse += delta.content;
          yield delta.content;
        }

        // Accumulate streamed tool call deltas
        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const idx = tcDelta.index;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                index: idx,
                id: tcDelta.id ?? "",
                name: tcDelta.function?.name ?? "",
                argumentsRaw: "",
              };
            }
            if (tcDelta.id) toolCalls[idx].id = tcDelta.id;
            if (tcDelta.function?.name)
              toolCalls[idx].name = tcDelta.function.name;
            if (tcDelta.function?.arguments)
              toolCalls[idx].argumentsRaw += tcDelta.function.arguments;
          }
        }
      }

      if (toolCalls.length > 0 && this.toolExecutor) {
        // Push the assistant message with tool_calls
        turnMessages.push({
          role: "assistant",
          content: fullResponse || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.argumentsRaw },
          })),
        });

        // Execute each tool call and push results
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.argumentsRaw) as Record<string, unknown>;
          } catch {
            // leave args as empty object if JSON is malformed
          }

          const eventPayload: AgentToolEventPayload = {
            id: tc.id,
            name: tc.name,
            args,
            argumentsRaw: tc.argumentsRaw,
          };
          this.eventHandlers.onToolCallStart?.(eventPayload);

          let toolResult: string;
          try {
            toolResult = await this.toolExecutor(tc.name, args);
            this.eventHandlers.onToolCallSuccess?.({
              ...eventPayload,
              result: toolResult,
            });
          } catch (err) {
            const error = String(err);
            this.eventHandlers.onToolCallError?.({
              ...eventPayload,
              error,
            });
            toolResult = `Error: ${error}`;
          }
          turnMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
        // Continue the loop to let the model produce its next response
        continue;
      }

      // No tool calls – this is the final assistant response
      turnMessages.push({ role: "assistant", content: fullResponse });
      this.messages.push(...turnMessages);
      break;
    }
  }

  /**
   * Send a user message and return the full response at once (non-streaming).
   * Handles tool calls transparently (same as `chat`).
   *
   * @param userMessage - The text content of the user message.
   * @param name - Optional speaker name to distinguish between participants.
   */
  async run(
    userMessage: string,
    name?: string,
    options?: AgentTurnOptions,
  ): Promise<string> {
    const transientTurnMessages = options?.turnMessages ?? [];
    const turnMessages: ChatCompletionMessageParam[] = [
      this.buildUserMessage(userMessage, name),
    ];

    while (true) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [...this.messages, ...transientTurnMessages, ...turnMessages],
        stream: false,
        ...(this.tools ? { tools: this.tools } : {}),
      });

      const choice = response.choices[0];
      const message = choice?.message;

      if (
        message?.tool_calls?.length &&
        this.toolExecutor
      ) {
        turnMessages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });

        for (const tc of message.tool_calls) {
          // Only handle standard function tool calls
          if (tc.type !== "function") continue;
          const fnTc = tc as ChatCompletionMessageFunctionToolCall;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(fnTc.function.arguments) as Record<string, unknown>;
          } catch {
            // leave args as empty object
          }

          const eventPayload: AgentToolEventPayload = {
            id: fnTc.id,
            name: fnTc.function.name,
            args,
            argumentsRaw: fnTc.function.arguments,
          };
          this.eventHandlers.onToolCallStart?.(eventPayload);

          let toolResult: string;
          try {
            toolResult = await this.toolExecutor(fnTc.function.name, args);
            this.eventHandlers.onToolCallSuccess?.({
              ...eventPayload,
              result: toolResult,
            });
          } catch (err) {
            const error = String(err);
            this.eventHandlers.onToolCallError?.({
              ...eventPayload,
              error,
            });
            toolResult = `Error: ${error}`;
          }
          turnMessages.push({
            role: "tool",
            tool_call_id: fnTc.id,
            content: toolResult,
          });
        }
        continue;
      }

      const content = message?.content ?? "";
      turnMessages.push({ role: "assistant", content });
      this.messages.push(...turnMessages);
      return content;
    }
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
