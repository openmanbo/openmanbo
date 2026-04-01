/**
 * Built-in slash commands for interactive mode.
 *
 * Aligned with Claude Code's command system: /help, /compact, /status,
 * /memory, /context, /tools, /reset, /exit.
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CommandDefinition, CommandContext, CommandResult } from "./types.js";
import { getFullContext, formatContextSections } from "../context/index.js";
import {
  getCompactPrompt,
  formatCompactSummary,
  getCompactUserSummaryMessage,
  microCompact,
} from "../compact/index.js";

/* ────────────────────────────────────────────────────────────────────
 * /help – List available commands
 * ──────────────────────────────────────────────────────────────────── */

const helpCommand: CommandDefinition = {
  name: "help",
  description: "Show available commands",
  aliases: ["?", "h"],
  execute(_args, ctx) {
    const lines = [
      "## Available Commands\n",
      ...allCommands.map((cmd) => {
        const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map((a) => "/" + a).join(", ")})` : "";
        return `  /${cmd.name}${aliases} — ${cmd.description}`;
      }),
      "",
      "## Tips",
      "  • Use /compact to compress conversation history when it gets long.",
      "  • Use /context to see current git status and memory files.",
      "  • Use /tools to see all available tools.",
    ];
    return { output: lines.join("\n"), suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /status – Show session status
 * ──────────────────────────────────────────────────────────────────── */

const statusCommand: CommandDefinition = {
  name: "status",
  description: "Show current session status",
  execute(_args, ctx) {
    const lines = [
      "## Session Status\n",
      `  Model: ${ctx.model}`,
      `  Working directory: ${ctx.cwd}`,
      `  Conversation turns: ${ctx.getHistoryLength()}`,
      `  Available tools: ${ctx.toolNames.length}`,
    ];
    return { output: lines.join("\n"), suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /tools – List available tools
 * ──────────────────────────────────────────────────────────────────── */

const toolsCommand: CommandDefinition = {
  name: "tools",
  description: "List all available tools",
  execute(_args, ctx) {
    if (ctx.toolNames.length === 0) {
      return { output: "No tools available.", suppressAgent: true };
    }
    const lines = [
      `## Available Tools (${ctx.toolNames.length})\n`,
      ...ctx.toolNames.map((name) => `  • ${name}`),
    ];
    return { output: lines.join("\n"), suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /context – Show current context (git, memory, etc.)
 * ──────────────────────────────────────────────────────────────────── */

const contextCommand: CommandDefinition = {
  name: "context",
  description: "Show current context (git status, memory files)",
  async execute(_args, ctx) {
    const fullContext = await getFullContext(ctx.cwd);
    const sections = formatContextSections(fullContext);
    return { output: sections.join("\n\n"), suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /compact – Compress conversation history
 * ──────────────────────────────────────────────────────────────────── */

const compactCommand: CommandDefinition = {
  name: "compact",
  description: "Compress conversation context with structured summary",
  aliases: ["c"],
  async execute(args, ctx) {
    const historyLength = ctx.getHistoryLength();
    if (historyLength < 3) {
      return {
        output: "Not enough conversation history to compact (need at least 3 messages).",
        suppressAgent: true,
      };
    }

    // 1. Run micro-compact first to trim old tool results
    const messages = ctx.getMessages();
    const trimmed = microCompact(messages);
    if (trimmed !== messages) {
      ctx.replaceMessages(trimmed);
    }

    // 2. Run the full structured compact summarization
    const customInstructions = args.trim() || undefined;
    let summary: string;
    try {
      summary = await ctx.compactConversation(customInstructions);
    } catch (err) {
      return {
        output: `Compact failed: ${String(err)}`,
        suppressAgent: true,
      };
    }

    // 3. Format the summary (strip analysis scratchpad)
    const formatted = formatCompactSummary(summary);

    // 4. Replace messages with compact boundary + summary
    const compactBoundary = getCompactUserSummaryMessage(formatted);
    const newMessages: ChatCompletionMessageParam[] = [
      { role: "user", content: compactBoundary },
      {
        role: "assistant",
        content: "Understood. I have the full context from the summary above and will continue from where we left off.",
      },
    ];
    ctx.replaceMessages(newMessages);

    return {
      output: `Conversation compacted: ${historyLength} messages → 2 messages (compact boundary + acknowledgment).`,
      suppressAgent: true,
    };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /reset – Reset conversation
 * ──────────────────────────────────────────────────────────────────── */

const resetCommand: CommandDefinition = {
  name: "reset",
  description: "Reset the conversation history",
  execute(_args, ctx) {
    ctx.resetAgent();
    return { output: "Conversation reset.", suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /exit – Exit the session
 * ──────────────────────────────────────────────────────────────────── */

const exitCommand: CommandDefinition = {
  name: "exit",
  description: "Exit the interactive session",
  aliases: ["quit", "q"],
  execute() {
    return { output: "Goodbye!", exit: true, suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * /memory – Show discovered memory files
 * ──────────────────────────────────────────────────────────────────── */

const memoryCommand: CommandDefinition = {
  name: "memory",
  description: "Show discovered OPENMANBO.md memory files",
  async execute(_args, ctx) {
    const fullContext = await getFullContext(ctx.cwd);
    if (!fullContext.user.memoryContent) {
      return {
        output: "No memory files found.\nCreate an OPENMANBO.md file in your project directory to add persistent instructions.",
        suppressAgent: true,
      };
    }
    return { output: fullContext.user.memoryContent, suppressAgent: true };
  },
};

/* ────────────────────────────────────────────────────────────────────
 * Registry
 * ──────────────────────────────────────────────────────────────────── */

const allCommands: CommandDefinition[] = [
  helpCommand,
  statusCommand,
  toolsCommand,
  contextCommand,
  compactCommand,
  resetCommand,
  memoryCommand,
  exitCommand,
];

export function getBuiltinCommands(): CommandDefinition[] {
  return [...allCommands];
}
