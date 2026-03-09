import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { Message } from "discord.js";
import type { Channel, ChannelMeta, InboundMessage } from "./types.js";
import { Agent } from "../kernel/agent.js";
import { createLLMClient } from "../kernel/llm.js";
import { DEFAULT_SYSTEM_PROMPT } from "../kernel/prompt.js";
import {
  buildSkillRouteMessages,
  routeSkills,
  withSkillTool,
  type SkillDefinition,
} from "../kernel/index.js";
import type { AppConfig } from "../config/env.js";
import type OpenAI from "openai";

const DISCORD_MESSAGE_LIMIT = 2000;
const TYPING_REFRESH_MS = 9000;

type SendableChannel = {
  send: (options: { content: string }) => Promise<unknown>;
  sendTyping?: () => Promise<unknown>;
};

export interface DiscordChannelOptions {
  /** Discord bot token. */
  botToken: string;
  /** Application configuration for the LLM backend. */
  appConfig: AppConfig;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Loaded skill definitions available for routing. */
  skills?: SkillDefinition[];
  /** MCP tool definitions to expose to the model. */
  mcpTools?: OpenAI.ChatCompletionTool[];
  /** Executor for MCP tool calls. */
  mcpToolExecutor?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
}

/**
 * Discord channel implementation.
 *
 * Connects to Discord as a bot and responds to messages that mention the bot
 * or are sent as direct messages.
 */
export class DiscordChannel implements Channel {
  readonly meta: ChannelMeta = { id: "discord", label: "Discord" };

  private client: Client;
  private botToken: string;
  private agents: Map<string, Agent> = new Map();
  private appConfig: AppConfig;
  private systemPrompt: string;
  private skills: SkillDefinition[];
  private mcpTools: OpenAI.ChatCompletionTool[] | undefined;
  private mcpToolExecutor:
    | ((name: string, args: Record<string, unknown>) => Promise<string>)
    | undefined;

  constructor(options: DiscordChannelOptions) {
    this.botToken = options.botToken;
    this.appConfig = options.appConfig;
    this.systemPrompt =
      options.systemPrompt ??
      DEFAULT_SYSTEM_PROMPT;
    this.skills = options.skills ?? [];
    this.mcpTools = options.mcpTools;
    this.mcpToolExecutor = options.mcpToolExecutor;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });
  }

  async start(): Promise<void> {
    this.client.on(Events.ClientReady, (readyClient) => {
      console.log(`✅ Discord channel ready — logged in as ${readyClient.user.tag}`);
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message);
    });

    await this.client.login(this.botToken);
  }

  async stop(): Promise<void> {
    this.agents.clear();
    await this.client.destroy();
    console.log("Discord channel stopped.");
  }

  /**
   * Get or create a per-conversation Agent instance.
   * Each Discord channel/DM gets its own conversation history.
   */
  private getOrCreateAgent(conversationId: string): Agent {
    let agent = this.agents.get(conversationId);
    if (!agent) {
      const llmClient = createLLMClient(this.appConfig);
      const toolConfig = withSkillTool({
        skills: this.skills,
        tools: this.mcpTools,
        toolExecutor: this.mcpToolExecutor,
      });
      agent = new Agent({
        client: llmClient,
        model: this.appConfig.model,
        systemPrompt: this.systemPrompt,
        ...(toolConfig.tools?.length ? toolConfig : {}),
      });
      this.agents.set(conversationId, agent);
    }
    return agent;
  }

  private getSendableChannel(message: Message): SendableChannel | undefined {
    const channel = message.channel as Partial<SendableChannel>;
    if (typeof channel.send !== "function") {
      return undefined;
    }
    return channel as SendableChannel;
  }

  private startTypingIndicator(message: Message): (() => void) | undefined {
    const channel = this.getSendableChannel(message);
    if (!channel?.sendTyping) {
      return undefined;
    }

    void channel.sendTyping();
    const timer = setInterval(() => {
      void channel.sendTyping?.();
    }, TYPING_REFRESH_MS);

    return () => clearInterval(timer);
  }

  private async sendResponse(message: Message, content: string): Promise<void> {
    const chunks = splitDiscordMessage(content, DISCORD_MESSAGE_LIMIT);
    if (chunks.length === 0) {
      await message.reply({
        content: "I produced an empty response.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const [firstChunk, ...restChunks] = chunks;
    await message.reply({
      content: firstChunk,
      allowedMentions: { repliedUser: false },
    });

    for (const chunk of restChunks) {
      const channel = this.getSendableChannel(message);
      if (!channel) {
        await message.reply({
          content: chunk,
          allowedMentions: { repliedUser: false },
        });
        continue;
      }

      await channel.send({ content: chunk });
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore messages from bots (including self)
    if (message.author.bot) return;

    const isDM = !message.guild;
    const botUser = this.client.user;
    if (!botUser) return;
    const isMentioned = message.mentions.has(botUser);

    // Only respond to DMs or messages that mention the bot
    if (!isDM && !isMentioned) return;

    // Strip the bot mention from the message content
    let content = message.content;
    if (isMentioned && botUser) {
      content = content
        .replace(new RegExp(`<@!?${botUser.id}>`, "g"), "")
        .trim();
    }

    if (!content) return;

    const inbound: InboundMessage = {
      senderId: message.author.id,
      senderName: message.author.globalName ?? message.author.username,
      content,
      channelId: message.channelId,
    };

    const agent = this.getOrCreateAgent(inbound.channelId);
    const routeResult = routeSkills({
      message: inbound.content,
      skills: this.skills,
    });

    if (routeResult.usageHint && !routeResult.content) {
      await message.reply(routeResult.usageHint);
      return;
    }

    try {
      const stopTyping = this.startTypingIndicator(message);
      try {
        let fullResponse = "";
        for await (const chunk of agent.chat(
          routeResult.content || inbound.content,
          inbound.senderName,
          {
            turnMessages: buildSkillRouteMessages(routeResult.activeSkills),
          },
        )) {
          fullResponse += chunk;
        }

        await this.sendResponse(message, fullResponse);
      } finally {
        stopTyping?.();
      }
    } catch (error) {
      console.error("Error handling Discord message:", error);
      await message.reply({
        content: "Sorry, I encountered an error processing your message.",
        allowedMentions: { repliedUser: false },
      });
    }
  }
}

function splitDiscordMessage(text: string, maxLength = DISCORD_MESSAGE_LIMIT): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let current = "";

  for (const segment of tokenizeMarkdown(normalized)) {
    const parts = segment.type === "code"
      ? splitCodeBlock(segment.content, maxLength)
      : splitPlainText(segment.content, maxLength);

    for (const part of parts) {
      if (!part) continue;
      if (!current) {
        current = part;
        continue;
      }

      if (current.length + part.length <= maxLength) {
        current += part;
        continue;
      }

      chunks.push(current.trim());
      current = part;
    }
  }

  if (current) {
    chunks.push(current.trim());
  }

  return chunks;
}

function tokenizeMarkdown(
  text: string,
): Array<{ type: "text" | "code"; content: string }> {
  const segments: Array<{ type: "text" | "code"; content: string }> = [];
  const codeBlockPattern = /```[\s\S]*?```/g;
  let lastIndex = 0;

  for (const match of text.matchAll(codeBlockPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, start) });
    }
    segments.push({ type: "code", content: match[0] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

function splitPlainText(text: string, maxLength: number): string[] {
  const normalized = text.replace(/^\n+/, "");
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const splitIndex = findSplitIndex(remaining, maxLength);
    chunks.push(remaining.slice(0, splitIndex).trimEnd());
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function splitCodeBlock(codeBlock: string, maxLength: number): string[] {
  if (codeBlock.length <= maxLength) return [codeBlock];

  const firstNewline = codeBlock.indexOf("\n");
  const openFence = firstNewline === -1 ? "```" : codeBlock.slice(0, firstNewline);
  const closeFenceIndex = codeBlock.lastIndexOf("```");
  const rawBody = firstNewline === -1
    ? codeBlock.slice(3, closeFenceIndex)
    : codeBlock.slice(firstNewline + 1, closeFenceIndex);
  const body = rawBody.endsWith("\n") ? rawBody.slice(0, -1) : rawBody;
  const wrapperLength = openFence.length + "\n\n```".length;
  const maxBodyLength = Math.max(1, maxLength - wrapperLength);
  const bodyChunks: string[] = [];
  let remaining = body;

  while (remaining.length > maxBodyLength) {
    let splitIndex = remaining.lastIndexOf("\n", maxBodyLength);
    if (splitIndex <= 0) {
      splitIndex = maxBodyLength;
    }
    bodyChunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).replace(/^\n+/, "");
  }

  if (remaining || bodyChunks.length === 0) {
    bodyChunks.push(remaining);
  }

  return bodyChunks.map((chunk) => `${openFence}\n${chunk}\n\`\`\``);
}

function findSplitIndex(text: string, maxLength: number): number {
  for (const separator of ["\n\n", "\n", " "]) {
    const index = text.lastIndexOf(separator, maxLength);
    if (index > 0) {
      return index + separator.length;
    }
  }

  return maxLength;
}
