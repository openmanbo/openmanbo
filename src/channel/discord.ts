import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { Message } from "discord.js";
import type { Channel, ChannelMeta, InboundMessage } from "./types.js";
import { Agent } from "../kernel/agent.js";
import { createLLMClient } from "../kernel/llm.js";
import type { AppConfig } from "../config/env.js";

export interface DiscordChannelOptions {
  /** Discord bot token. */
  botToken: string;
  /** Application configuration for the LLM backend. */
  appConfig: AppConfig;
  /** Optional system prompt override. */
  systemPrompt?: string;
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

  constructor(options: DiscordChannelOptions) {
    this.botToken = options.botToken;
    this.appConfig = options.appConfig;
    this.systemPrompt =
      options.systemPrompt ??
      "You are Manbo, a helpful and concise AI assistant.";

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
      agent = new Agent({
        client: llmClient,
        model: this.appConfig.model,
        systemPrompt: this.systemPrompt,
      });
      this.agents.set(conversationId, agent);
    }
    return agent;
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

    try {
      if ("sendTyping" in message.channel) {
        await message.channel.sendTyping();
      }

      let fullResponse = "";
      for await (const chunk of agent.chat(inbound.content, inbound.senderName)) {
        fullResponse += chunk;
      }

      // Discord has a 2000-char message limit; split if needed
      const chunks = splitMessage(fullResponse);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (error) {
      console.error("Error handling Discord message:", error);
      await message.reply(
        "Sorry, I encountered an error processing your message.",
      );
    }
  }
}

/** Split a message into chunks that fit Discord's 2000-character limit. */
function splitMessage(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex === 0) {
      // Fall back to splitting at a space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = maxLength;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }
  return chunks;
}
