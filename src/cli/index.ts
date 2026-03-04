#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "../config/env.js";
import { createLLMClient, Agent } from "../kernel/index.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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
  .action(async (prompt: string, opts) => {
    const config = loadConfig({
      apiKey: opts.apiKey,
      apiBaseUrl: opts.apiBaseUrl,
      model: opts.model,
    });

    const client = createLLMClient(config);
    const agent = new Agent({
      client,
      model: config.model,
      systemPrompt: "You are Manbo, a helpful and concise AI assistant.",
    });

    for await (const chunk of agent.chat(prompt)) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");
  });

// ── interactive command: REPL session ──────────────────────────────
program
  .command("interactive")
  .alias("i")
  .description("Start an interactive chat session (REPL)")
  .option("--api-key <key>", "OpenAI-compatible API key")
  .option("--api-base-url <url>", "OpenAI-compatible API base URL")
  .option("--model <model>", "Model name to use")
  .action(async (opts) => {
    const config = loadConfig({
      apiKey: opts.apiKey,
      apiBaseUrl: opts.apiBaseUrl,
      model: opts.model,
    });

    const client = createLLMClient(config);
    const agent = new Agent({
      client,
      model: config.model,
      systemPrompt: "You are Manbo, a helpful and concise AI assistant.",
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
      for await (const chunk of agent.chat(userInput)) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n\n");
    }
  });

program.parse();
