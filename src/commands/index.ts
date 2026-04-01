/**
 * Command registry and processing.
 *
 * Parses user input for slash commands and dispatches to the
 * appropriate handler.
 */

import type { CommandDefinition, CommandContext, CommandResult } from "./types.js";
import { getBuiltinCommands } from "./builtin.js";

export type { CommandDefinition, CommandContext, CommandResult } from "./types.js";
export { getBuiltinCommands } from "./builtin.js";

/**
 * CommandRegistry – Manages available commands and processes user input.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  constructor(commands?: CommandDefinition[]) {
    const all = commands ?? getBuiltinCommands();
    for (const cmd of all) {
      this.register(cmd);
    }
  }

  /**
   * Register a command. Registers under its name and all aliases.
   */
  register(cmd: CommandDefinition): void {
    this.commands.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.set(alias, cmd);
      }
    }
  }

  /**
   * Check if input is a slash command.
   */
  isCommand(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return false;
    const name = trimmed.split(/\s+/)[0].slice(1).toLowerCase();
    return this.commands.has(name);
  }

  /**
   * Process a slash command from user input.
   * Returns null if the input is not a recognized command.
   */
  async process(
    input: string,
    ctx: CommandContext,
  ): Promise<CommandResult | null> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;

    const spaceIdx = trimmed.indexOf(" ");
    const name = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const cmd = this.commands.get(name);
    if (!cmd) return null;

    return cmd.execute(args, ctx);
  }

  /**
   * Get all registered commands (deduplicated by name).
   */
  getAll(): CommandDefinition[] {
    const seen = new Set<string>();
    const result: CommandDefinition[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result;
  }
}
