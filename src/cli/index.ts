#!/usr/bin/env node

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
import { resolveDataDir, readIdentity, readMcpConfig, readSkills } from "../storage/index.js";
import { McpManager } from "../mcp/index.js";
import { LifecycleManager, Scheduler, AdminServer, type IpcMessage } from "../daemon/index.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve as resolvePath } from "node:path";

const program = new Command();

program
  .name("manbo")
  .description("OpenManbo – An intelligent CLI agent powered by LLMs")
  .version("0.1.0");

// ── chat command: one-shot prompt ──────────────────────────────────
program
  .command("chat")
  .description("Send a single prompt and get a streamed response")
  .argument("<prompt>", "The prompt to send to the agent")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .option("--data-dir <path>", "Path to the .openmanbo storage directory")
  .action(async (prompt: string, opts) => {
    const config = loadConfig({
      apiKey: opts.apiKey,
      apiBaseUrl: opts.apiBaseUrl,
      model: opts.model,
      dataDir: opts.dataDir,
    });

    const dataDir = resolveDataDir(config.dataDir);
    const [identity, skills, mcpConfig] = await Promise.all([
      readIdentity(dataDir),
      readSkills(dataDir),
      readMcpConfig(dataDir),
    ]);

    const mcp = new McpManager();
    if (mcpConfig) {
      await mcp.connect(mcpConfig);
    }

    const toolConfig = withSkillTool({
      skills,
      tools: mcp.tools,
      toolExecutor: mcp.call.bind(mcp),
    });

    const client = createLLMClient(config);
    const agent = new Agent({
      client,
      model: config.model,
      systemPrompt: buildSystemPrompt({ identity, skills }),
      ...(toolConfig.tools?.length ? toolConfig : {}),
    });

    const routeResult = routeSkills({
      message: prompt,
      skills,
    });

    for await (const chunk of agent.chat(routeResult.content || prompt, undefined, {
      turnMessages: buildSkillRouteMessages(routeResult.activeSkills),
    })) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");

    await mcp.disconnect();
  });

// ── interactive command: REPL session ──────────────────────────────
program
  .command("interactive")
  .alias("i")
  .description("Start an interactive chat session (REPL)")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .option("--data-dir <path>", "Path to the .openmanbo storage directory")
  .action(async (opts) => {
    const config = loadConfig({
      apiKey: opts.apiKey,
      apiBaseUrl: opts.apiBaseUrl,
      model: opts.model,
      dataDir: opts.dataDir,
    });

    const dataDir = resolveDataDir(config.dataDir);
    const [identity, skills, mcpConfig] = await Promise.all([
      readIdentity(dataDir),
      readSkills(dataDir),
      readMcpConfig(dataDir),
    ]);

    const mcp = new McpManager();
    if (mcpConfig) {
      await mcp.connect(mcpConfig);
    }

    const toolConfig = withSkillTool({
      skills,
      tools: mcp.tools,
      toolExecutor: mcp.call.bind(mcp),
    });

    const client = createLLMClient(config);
    const agent = new Agent({
      client,
      model: config.model,
      systemPrompt: buildSystemPrompt({ identity, skills }),
      ...(toolConfig.tools?.length ? toolConfig : {}),
    });

    const rl = readline.createInterface({ input, output });

    console.log("🤖 Manbo interactive mode (type /exit to quit)\n");

    while (true) {
      const userInput = await rl.question("You: ");

      if (!userInput.trim()) continue;
      if (userInput.trim() === "/exit") {
        console.log("Goodbye!");
        rl.close();
        break;
      }
      if (userInput.trim() === "/reset") {
        agent.reset();
        console.log("(conversation reset)\n");
        continue;
      }

      process.stdout.write("Manbo: ");
      const routeResult = routeSkills({
        message: userInput,
        skills,
      });
      for await (const chunk of agent.chat(routeResult.content || userInput, undefined, {
        turnMessages: buildSkillRouteMessages(routeResult.activeSkills),
      })) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n\n");
    }

    await mcp.disconnect();
  });

// ── discord command: run as a Discord bot ─────────────────────────
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

    const dataDir = resolveDataDir(config.dataDir);
    const [identity, skills, mcpConfig] = await Promise.all([
      readIdentity(dataDir),
      readSkills(dataDir),
      readMcpConfig(dataDir),
    ]);

    const mcp = new McpManager();
    if (mcpConfig) {
      await mcp.connect(mcpConfig);
    }

    const channel = new DiscordChannel({
      botToken: config.discordBotToken,
      appConfig: config,
      systemPrompt: buildSystemPrompt({ identity, skills }),
      skills,
      ...(mcp.isActive
        ? {
            mcpTools: mcp.tools,
            mcpToolExecutor: mcp.call.bind(mcp),
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

// ── daemon command: background supervisor ─────────────────────────
program
  .command("daemon")
  .description("Start the background daemon (supervisor) that manages the Agent lifecycle")
  .option("--agent-script <path>", "Path to the agent entry script", "dist/cli/index.js")
  .option("--agent-args <args...>", "Arguments forwarded to the agent process")
  .option("--admin-port <port>", "Port for the admin HTTP server", "7777")
  .option("--build-command <cmd>", "Build command for rebuild cycles", "npm run build")
  .action(async (opts) => {
    const agentScript = resolvePath(opts.agentScript);
    const agentArgs: string[] = opts.agentArgs ?? ["discord"];
    const adminPort = Number(opts.adminPort);
    const buildCommand = opts.buildCommand as string;

    const lifecycle = new LifecycleManager({
      agentScript,
      agentArgs,
      buildCommand,
    });

    const scheduler = new Scheduler(lifecycle);
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

program.parse();

/* ── Agent-side IPC listener ──────────────────────────────────────── */
// When the CLI is spawned as a child of the Daemon, set up a handler
// for IPC messages and signal readiness.
if (process.send) {
  process.on("message", (msg: IpcMessage) => {
    switch (msg.type) {
      case "build-error":
        console.error("[agent] Received build error from daemon:\n", msg.stderr);
        break;
      case "scheduled-task":
        console.log(`[agent] Scheduled task "${msg.taskId}" triggered.`);
        break;
      default:
        break;
    }
  });

  // Signal the Daemon that we are ready to receive IPC messages.
  process.send({ type: "agent-ready" });
}
