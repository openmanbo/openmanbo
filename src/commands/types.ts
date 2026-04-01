/**
 * Command system types.
 *
 * Aligned with Claude Code's slash command pattern:
 * commands are prefixed with "/" and can be invoked in interactive mode.
 */

export interface CommandResult {
  /** Text output to display to the user */
  output: string;
  /** Whether the command should terminate the session */
  exit?: boolean;
  /** Whether to suppress sending the output to the agent */
  suppressAgent?: boolean;
}

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface CommandContext {
  /** Current working directory */
  cwd: string;
  /** Reset the agent's conversation history */
  resetAgent: () => void;
  /** Get agent conversation history length */
  getHistoryLength: () => number;
  /** Get the agent's messages (direct reference) */
  getMessages: () => ChatCompletionMessageParam[];
  /** Replace the agent's message history */
  replaceMessages: (messages: ChatCompletionMessageParam[]) => void;
  /** Run a compact summarization and return the summary text */
  compactConversation: (customInstructions?: string) => Promise<string>;
  /** Available tool names */
  toolNames: string[];
  /** Model name */
  model: string;
  /** MCP server status (optional – only present when MCP is active) */
  mcpStatus?: () => Array<{ name: string; enabled: boolean; toolCount: number }>;
  /** Enable an MCP server by name */
  mcpEnable?: (name: string) => void;
  /** Disable an MCP server by name */
  mcpDisable?: (name: string) => void;
}

export interface CommandDefinition {
  /** Command name (without the "/" prefix) */
  name: string;
  /** Short description shown in /help */
  description: string;
  /** Aliases for the command */
  aliases?: string[];
  /**
   * Execute the command.
   * @param args - Arguments after the command name
   * @param ctx - Contextual information
   */
  execute(args: string, ctx: CommandContext): Promise<CommandResult> | CommandResult;
}
