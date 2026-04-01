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

export interface CommandContext {
  /** Current working directory */
  cwd: string;
  /** Reset the agent's conversation history */
  resetAgent: () => void;
  /** Get agent conversation history length */
  getHistoryLength: () => number;
  /** Available tool names */
  toolNames: string[];
  /** Model name */
  model: string;
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
