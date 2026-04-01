/**
 * BashTool – Execute shell commands in a subprocess.
 *
 * Aligned with Claude Code's BashTool: runs a command via the system
 * shell with timeout, output truncation and safe environment.
 */

import { spawn } from "node:child_process";
import type { Tool, ToolResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_CHARS = 30_000;

export interface BashToolOptions {
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum combined stdout/stderr characters */
  maxOutputChars?: number;
}

export class BashTool implements Tool {
  private readonly cwd: string;
  private readonly timeoutMs: number;
  private readonly maxOutputChars: number;

  readonly spec = {
    name: "bash",
    description:
      "Execute a shell command. Use this to run programs, install packages, " +
      "search files, compile code, run tests, or perform any command-line operation. " +
      "Commands run in bash with a timeout. Prefer this tool for file operations that " +
      "can be done efficiently via CLI commands (find, grep, sed, etc.).",
    input: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        timeout: {
          type: "number",
          description: "Optional timeout in milliseconds (default: 120000).",
        },
      },
      required: ["command"],
    },
  };

  constructor(options?: BashToolOptions) {
    this.cwd = options?.cwd ?? process.cwd();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputChars = options?.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command;
    if (typeof command !== "string" || !command.trim()) {
      return { content: "Error: command must be a non-empty string.", isError: true };
    }

    const timeout =
      typeof args.timeout === "number" && args.timeout > 0
        ? args.timeout
        : this.timeoutMs;

    try {
      const result = await this.runCommand(command.trim(), timeout);
      return { content: result };
    } catch (err) {
      return { content: `Error: ${String(err)}`, isError: true };
    }
  }

  private runCommand(command: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const shell = process.platform === "win32"
        ? (process.env.ComSpec ?? "cmd.exe")
        : (process.env.SHELL ?? "/bin/bash");

      const shellArgs = process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-lc", command];

      const child = spawn(shell, shellArgs, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;

      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        const total = stdout.length + stderr.length;
        if (total >= this.maxOutputChars) {
          truncated = true;
          return;
        }
        const remaining = this.maxOutputChars - total;
        const text = chunk.toString("utf8").slice(0, remaining);
        if (target === "stdout") stdout += text;
        else stderr += text;
        if (text.length < chunk.length) truncated = true;
      };

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const parts: string[] = [];
        if (stdout.trim()) parts.push(stdout.trimEnd());
        if (stderr.trim()) parts.push(`STDERR:\n${stderr.trimEnd()}`);
        if (truncated) parts.push(`[Output truncated to ${this.maxOutputChars} characters]`);
        if (timedOut) parts.push(`[Command timed out after ${timeoutMs}ms]`);

        const output = parts.join("\n\n") || "(no output)";
        const exitInfo = code !== 0 ? `\n\nExit code: ${code ?? "unknown"}` : "";

        resolve(output + exitInfo);
      });
    });
  }
}
