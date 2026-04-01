#!/usr/bin/env node

/**
 * OpenManbo CLI – Main entry point.
 *
 * Refactored to align with Claude Code's architecture:
 * - Built-in tools (bash, file_read, file_edit, file_write, glob, grep, web_fetch)
 * - Multi-part system prompt with context injection
 * - Slash command system (/help, /compact, /status, /tools, /context, /memory)
 * - OPENMANBO.md memory file discovery
 * - ToolPool unifies built-in tools + MCP tools
 */

import { Command } from "commander";
import { loadConfig } from "../config/env.js";
import {
  createLLMClient,
  Agent,
  buildSystemPrompt,
  withSkillTool,
  routeSkills,
  buildSkillRouteMessages,
} from "../kernel/index.js";
import { DiscordChannel } from "../channel/index.js";
import {
  resolveDataDir,
  readIdentity,
  readMcpConfig,
  readSkills,
  readQnaTopics,
  injectQnaTopics,
} from "../storage/index.js";
import { McpManager } from "../mcp/index.js";
import {
  LifecycleManager,
  Scheduler,
  AdminServer,
  type IpcMessage,
} from "../daemon/index.js";
import {
  handleForgejoPoll,
  isForgejoProcessing,
} from "../trigger/index.js";
import { createBuiltinTools, ToolPool } from "../tools/index.js";
import { getFullContext } from "../context/index.js";
import { CommandRegistry } from "../commands/index.js";
import { getCompactPrompt } from "../compact/index.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve as resolvePath } from "node:path";

const program = new Command();

program
  .name("manbo")
  .description("OpenManbo – An intelligent CLI agent powered by LLMs")
  .version("0.1.0");

/* ────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ──────────────────────────────────────────────────────────────────── */

interface BootstrapResult {
  agent: Agent;
  toolPool: ToolPool;
  mcp: McpManager;
  skills: Awaited<ReturnType<typeof readSkills>>;
  model: string;
}

/**
 * Shared bootstrap logic for all commands that need an Agent.
 * Creates built-in tools, connects MCP, builds system prompt with context.
 */
async function bootstrap(opts: {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  dataDir?: string;
  discordBotToken?: string;
}): Promise<BootstrapResult> {
  const config = loadConfig({
    apiKey: opts.apiKey,
    apiBaseUrl: opts.apiBaseUrl,
    model: opts.model,
    dataDir: opts.dataDir,
    discordBotToken: opts.discordBotToken,
  });

  const cwd = process.cwd();
  const dataDir = resolveDataDir(config.dataDir);

  // Load everything in parallel
  const [identity, skills, mcpConfig, qnaTopics, context] = await Promise.all([
    readIdentity(dataDir),
    readSkills(dataDir),
    readMcpConfig(dataDir),
    readQnaTopics(dataDir),
    getFullContext(cwd),
  ]);

  // Create built-in tools
  const builtinTools = createBuiltinTools({ cwd });
  const toolPool = new ToolPool(builtinTools);

  // Connect MCP servers
  const mcp = new McpManager();
  const mergedMcpConfig = injectQnaTopics(mcpConfig, qnaTopics);
  if (mergedMcpConfig) {
    await mcp.connect(mergedMcpConfig);
  }

  const client = createLLMClient(config);
  mcp.configureQna(client, config.model);

  // Add MCP tools to the pool (built-in tools take precedence)
  if (mcp.isActive) {
    toolPool.setMcpTools(mcp.tools, mcp.call.bind(mcp));
  }

  // Also add skill tool
  const skillToolConfig = withSkillTool({
    skills,
    tools: toolPool.tools,
    toolExecutor: toolPool.execute.bind(toolPool),
  });

  // Build multi-part system prompt
  const systemPrompt = buildSystemPrompt({
    identity,
    skills,
    context,
    toolNames: toolPool.toolNames,
  });

  const agent = new Agent({
    client,
    model: config.model,
    systemPrompt,
    tools: skillToolConfig.tools,
    toolExecutor: skillToolConfig.toolExecutor,
  });

  return { agent, toolPool, mcp, skills, model: config.model };
}

/* ────────────────────────────────────────────────────────────────────
 * chat command: one-shot prompt
 * ──────────────────────────────────────────────────────────────────── */

program
  .command("chat")
  .description("Send a single prompt and get a streamed response")
  .argument("<prompt>", "The prompt to send to the agent")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .option("--data-dir <path>", "Path to the .openmanbo storage directory")
  .action(async (prompt: string, opts) => {
    const { agent, mcp, skills } = await bootstrap(opts);

    const routeResult = routeSkills({ message: prompt, skills });

    for await (const chunk of agent.chat(
      routeResult.content || prompt,
      undefined,
      { turnMessages: buildSkillRouteMessages(routeResult.activeSkills) },
    )) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");

    await mcp.disconnect();
  });

/* ────────────────────────────────────────────────────────────────────
 * interactive command: REPL session with slash commands
 * ──────────────────────────────────────────────────────────────────── */

program
  .command("interactive")
  .alias("i")
  .description("Start an interactive chat session (REPL)")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .option("--data-dir <path>", "Path to the .openmanbo storage directory")
  .action(async (opts) => {
    const { agent, toolPool, mcp, skills, model } = await bootstrap(opts);

    // Set up command system
    const commands = new CommandRegistry();

    const rl = readline.createInterface({ input, output });

    console.log("🤖 Manbo interactive mode (type /help for commands)\n");

    while (true) {
      const userInput = await rl.question("You: ");

      if (!userInput.trim()) continue;

      // Check for slash commands
      if (commands.isCommand(userInput)) {
        const result = await commands.process(userInput, {
          cwd: process.cwd(),
          resetAgent: () => agent.reset(),
          getHistoryLength: () => agent.getHistory().length,
          getMessages: () => agent.getMessages(),
          replaceMessages: (msgs) => agent.replaceMessages(msgs),
          compactConversation: async (customInstructions?: string) => {
            const prompt = getCompactPrompt(customInstructions);
            return agent.run(prompt);
          },
          toolNames: toolPool.toolNames,
          model,
        });

        if (result) {
          console.log(`\n${result.output}\n`);
          if (result.exit) {
            rl.close();
            break;
          }
          continue;
        }
      }

      // Route through skills and stream response
      process.stdout.write("Manbo: ");
      const routeResult = routeSkills({ message: userInput, skills });
      for await (const chunk of agent.chat(
        routeResult.content || userInput,
        undefined,
        { turnMessages: buildSkillRouteMessages(routeResult.activeSkills) },
      )) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n\n");
    }

    await mcp.disconnect();
  });

/* ────────────────────────────────────────────────────────────────────
 * discord command: run as a Discord bot
 * ──────────────────────────────────────────────────────────────────── */

program
  .command("discord")
  .description("Start the agent as a Discord bot")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .option("--bot-token <token>", "Discord bot token")
  .option("--data-dir <path>", "Path to the .openmanbo storage directory")
  .action(async (opts) => {
    const config = loadConfig({
      apiKey: opts.apiKey,
      apiBaseUrl: opts.apiBaseUrl,
      model: opts.model,
      discordBotToken: opts.botToken,
      dataDir: opts.dataDir,
    });

    if (!config.discordBotToken) {
      console.error(
        "Missing Discord bot token. Set DISCORD_BOT_TOKEN environment variable or pass --bot-token.",
      );
      process.exit(1);
    }

    const cwd = process.cwd();
    const dataDir = resolveDataDir(config.dataDir);
    const [identity, skills, mcpConfig, qnaTopics, context] = await Promise.all([
      readIdentity(dataDir),
      readSkills(dataDir),
      readMcpConfig(dataDir),
      readQnaTopics(dataDir),
      getFullContext(cwd),
    ]);

    // Create built-in tools
    const builtinTools = createBuiltinTools({ cwd });
    const toolPool = new ToolPool(builtinTools);

    const mcp = new McpManager();
    const mergedMcpConfig = injectQnaTopics(mcpConfig, qnaTopics);
    if (mergedMcpConfig) {
      await mcp.connect(mergedMcpConfig);
    }

    const client = createLLMClient(config);
    mcp.configureQna(client, config.model);

    if (mcp.isActive) {
      toolPool.setMcpTools(mcp.tools, mcp.call.bind(mcp));
    }

    const systemPrompt = buildSystemPrompt({
      identity,
      skills,
      context,
      toolNames: toolPool.toolNames,
    });

    const channel = new DiscordChannel({
      botToken: config.discordBotToken,
      appConfig: config,
      systemPrompt,
      skills,
      ...(toolPool.tools.length
        ? {
            mcpTools: toolPool.tools,
            mcpToolExecutor: toolPool.execute.bind(toolPool),
          }
        : {}),
    });

    // Graceful shutdown
    const shutdown = async () => {
      await Promise.all([channel.stop(), mcp.disconnect()]);
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());

    console.log("🚀 Starting Discord channel…");
    await channel.start();
  });

/* ────────────────────────────────────────────────────────────────────
 * daemon command: background supervisor
 * ──────────────────────────────────────────────────────────────────── */

program
  .command("daemon")
  .description(
    "Start the background daemon (supervisor) that manages the Agent lifecycle",
  )
  .option(
    "--agent-script <path>",
    "Path to the agent entry script",
    "dist/cli/index.js",
  )
  .option("--agent-args <args...>", "Arguments forwarded to the agent process")
  .option("--admin-port <port>", "Port for the admin HTTP server", "7777")
  .option(
    "--build-command <cmd>",
    "Build command for rebuild cycles",
    "npm run build",
  )
  .option(
    "--forgejo-poll-interval <interval>",
    "Forgejo notification polling interval (e.g. 5m, 30s)",
    "5m",
  )
  .option("--no-forgejo-poll", "Disable Forgejo notification polling")
  .action(async (opts) => {
    const agentScript = resolvePath(opts.agentScript);
    const agentArgs: string[] = opts.agentArgs ?? [];
    const adminPort = Number(opts.adminPort);
    const buildCommand = opts.buildCommand as string;

    const lifecycle = new LifecycleManager({
      agentScript,
      agentArgs,
      buildCommand,
    });

    const scheduler = new Scheduler(lifecycle);

    // Register Forgejo notification polling task
    if (opts.forgejoPoll !== false) {
      scheduler.addTask({
        id: "forgejo-poll",
        schedule: opts.forgejoPollInterval as string,
        enabled: true,
      });
    }

    const admin = new AdminServer(lifecycle, scheduler);

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n[daemon] Shutting down…");
      scheduler.stopAll();
      await lifecycle.stop();
      await admin.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());

    lifecycle.on("status", (status: string) => {
      console.log(`[daemon] Agent status → ${status}`);
    });

    await admin.listen(adminPort);
    lifecycle.start();

    console.log("[daemon] Daemon is running. Press Ctrl+C to stop.");
  });

/* ────────────────────────────────────────────────────────────────────
 * Agent-side IPC setup
 * ──────────────────────────────────────────────────────────────────── */

function setupIpcListener(): void {
  if (!process.send) return;

  process.on("message", (msg: IpcMessage) => {
    switch (msg.type) {
      case "build-error":
        console.error(
          "[agent] Received build error from daemon:\n",
          msg.stderr,
        );
        break;
      case "scheduled-task":
        if (msg.taskId === "forgejo-poll") {
          if (isForgejoProcessing()) break;
          console.log(`[agent] Scheduled task "${msg.taskId}" triggered.`);
          void (async () => {
            try {
              const cfg = loadConfig();
              await handleForgejoPoll(cfg);
            } catch (err) {
              console.error("[agent] Forgejo poll error:", err);
            }
          })();
        } else {
          console.log(`[agent] Scheduled task "${msg.taskId}" triggered.`);
        }
        break;
      default:
        break;
    }
  });

  process.send({ type: "agent-ready" });
}

// When spawned as a daemon child with no subcommand, skip commander
// and run as a headless IPC worker.
if (process.send && process.argv.length <= 2) {
  setupIpcListener();
} else {
  program.parse();
  setupIpcListener();
}
