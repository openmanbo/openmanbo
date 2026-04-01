import { spawn } from "node:child_process";
import type OpenAI from "openai";
import type { ToolExecutionOutput } from "../kernel/tool-execution.js";
import { BuiltinContextCompressionTool } from "./compression.js";
import { BuiltinQnaTool } from "./qna.js";
import { BuiltinReflectionTool } from "./reflection.js";
import type {
  BuiltinExecAllowlistRule,
  BuiltinExecBlacklistRule,
  BuiltinExecToolConfig,
  McpConfig,
} from "./types.js";

const DEFAULT_EXEC_TOOL_NAME = "exec";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_CHARS = 8_000;
const DEFAULT_MAX_COMMAND_LENGTH = 1_000;
const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
] as const;

interface BuiltinTool {
  name: string;
  definition: OpenAI.ChatCompletionTool;
  execute(args: Record<string, unknown>): Promise<ToolExecutionOutput>;
}

interface CompiledAllowlistRule {
  pattern: RegExp;
  description?: string;
}

type CompiledBlacklistRule = CompiledAllowlistRule;

export class BuiltinToolManager {
  private readonly toolsByName = new Map<string, BuiltinTool>();
  private qnaTool: BuiltinQnaTool | undefined;
  private reflectionTool: BuiltinReflectionTool | undefined;
  private compressionTool: BuiltinContextCompressionTool | undefined;

  constructor(config?: McpConfig["builtinTools"]) {
    if (config?.exec && config.exec.enabled !== false) {
      const execTool = new BuiltinExecTool(config.exec);
      this.toolsByName.set(execTool.name, execTool);
    }

    if (config?.qna && config.qna.enabled !== false && config.qna.topics.length > 0) {
      const qnaTool = new BuiltinQnaTool(config.qna);
      this.qnaTool = qnaTool;
      this.toolsByName.set(qnaTool.name, qnaTool);
    }

    if (config?.reflection && config.reflection.enabled !== false) {
      const reflectionTool = new BuiltinReflectionTool(config.reflection);
      this.reflectionTool = reflectionTool;
      this.toolsByName.set(reflectionTool.name, reflectionTool);
    }

    if (config?.compression && config.compression.enabled !== false) {
      const compressionTool = new BuiltinContextCompressionTool(config.compression);
      this.compressionTool = compressionTool;
      this.toolsByName.set(compressionTool.name, compressionTool);
    }
  }

  /**
   * Configure built-in tools that require an LLM client.
   * Must be called after construction and before tool execution.
   */
  configure(client: OpenAI, model: string): void {
    if (this.qnaTool) {
      this.qnaTool.configure(client, model);
    }

    if (this.reflectionTool) {
      this.reflectionTool.configure(client, model);
    }

    if (this.compressionTool) {
      this.compressionTool.configure(client, model);
    }
  }

  configureQna(client: OpenAI, model: string): void {
    this.configure(client, model);
  }

  get tools(): OpenAI.ChatCompletionTool[] {
    return [...this.toolsByName.values()].map((tool) => tool.definition);
  }

  has(toolName: string): boolean {
    return this.toolsByName.has(toolName);
  }

  async call(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const tool = this.toolsByName.get(toolName);
    if (!tool) {
      throw new Error(`Unknown built-in tool: ${toolName}`);
    }

    return tool.execute(args);
  }

  get isActive(): boolean {
    return this.toolsByName.size > 0;
  }
}

class BuiltinExecTool implements BuiltinTool {
  readonly name: string;
  readonly definition: OpenAI.ChatCompletionTool;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly shell: string;
  private readonly timeoutMs: number;
  private readonly maxOutputChars: number;
  private readonly maxCommandLength: number;
  private readonly mode: "allowlist" | "blacklist";
  private readonly allowlist: CompiledAllowlistRule[];
  private readonly blacklist: CompiledBlacklistRule[];

  constructor(config: BuiltinExecToolConfig) {
    this.mode = config.mode ?? "allowlist";

    if (this.mode === "allowlist" && (!config.allowlist || !config.allowlist.length)) {
      throw new Error("Built-in exec tool requires at least one allowlist rule in allowlist mode.");
    }
    if (this.mode === "blacklist" && (!config.blacklist || !config.blacklist.length)) {
      throw new Error("Built-in exec tool requires at least one blacklist rule in blacklist mode.");
    }

    this.name = config.name?.trim() || DEFAULT_EXEC_TOOL_NAME;
    this.cwd = config.cwd ?? process.cwd();
    this.shell = config.shell ?? defaultShellCommand();
    this.timeoutMs = sanitizePositiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.maxOutputChars = sanitizePositiveInteger(
      config.maxOutputChars,
      DEFAULT_MAX_OUTPUT_CHARS,
    );
    this.maxCommandLength = sanitizePositiveInteger(
      config.maxCommandLength,
      DEFAULT_MAX_COMMAND_LENGTH,
    );

    this.allowlist = (config.allowlist ?? []).flatMap((rule) => {
      try {
        return [compileRule(rule)];
      } catch (err) {
        console.warn(
          `[MCP] Skipping invalid exec allowlist rule "${rule.pattern}": ${String(err)}`,
        );
        return [];
      }
    });

    this.blacklist = (config.blacklist ?? []).flatMap((rule) => {
      try {
        return [compileRule(rule)];
      } catch (err) {
        console.warn(
          `[MCP] Skipping invalid exec blacklist rule "${rule.pattern}": ${String(err)}`,
        );
        return [];
      }
    });

    if (this.mode === "allowlist" && !this.allowlist.length) {
      throw new Error("Built-in exec tool has no valid allowlist rules.");
    }
    if (this.mode === "blacklist" && !this.blacklist.length) {
      throw new Error("Built-in exec tool has no valid blacklist rules.");
    }

    this.env = buildSafeEnv(config.env);
    this.definition = {
      type: "function",
      function: {
        name: this.name,
        description: this.mode === "allowlist"
          ? buildToolDescription(config.description, this.allowlist)
          : (config.description?.trim() || "Execute shell commands. Some dangerous commands are blocked."),
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: this.mode === "allowlist"
                ? "Shell command to execute. It must match one of the configured allowlist rules."
                : "Shell command to execute. Commands matching a blacklist rule will be rejected.",
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const rawCommand = args.command;
    if (typeof rawCommand !== "string") {
      throw new Error("The built-in exec tool requires a string 'command' argument.");
    }

    const command = validateCommand(
      rawCommand,
      this.mode,
      this.allowlist,
      this.blacklist,
      this.maxCommandLength,
    );

    return executeShellCommand({
      command,
      cwd: this.cwd,
      env: this.env,
      shell: this.shell,
      timeoutMs: this.timeoutMs,
      maxOutputChars: this.maxOutputChars,
    });
  }
}

function compileRule(
  rule: BuiltinExecAllowlistRule | BuiltinExecBlacklistRule,
): CompiledAllowlistRule {
  if (!rule.pattern.trim()) {
    throw new Error("Rule pattern cannot be empty.");
  }

  return {
    pattern: new RegExp(`^(?:${rule.pattern})$`),
    description: rule.description?.trim() || undefined,
  };
}

function sanitizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || value === undefined || value <= 0) {
    return fallback;
  }

  return value;
}

function buildSafeEnv(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return { ...env, ...overrides };
}

function buildToolDescription(
  configuredDescription: string | undefined,
  allowlist: CompiledAllowlistRule[],
): string {
  if (configuredDescription?.trim()) {
    return configuredDescription.trim();
  }

  const describedRules = allowlist
    .map((rule) => rule.description)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);

  if (describedRules.length > 0) {
    return `Execute approved shell commands only. Allowed uses include: ${describedRules.join("; ")}.`;
  }

  return "Execute a shell command only when it matches a configured allowlist rule.";
}

function validateCommand(
  input: string,
  mode: "allowlist" | "blacklist",
  allowlist: CompiledAllowlistRule[],
  blacklist: CompiledBlacklistRule[],
  maxCommandLength: number,
): string {
  const command = input.trim();
  if (!command) {
    throw new Error("Command cannot be empty.");
  }

  if (command.length > maxCommandLength) {
    throw new Error(
      `Command exceeds the maximum allowed length of ${maxCommandLength} characters.`,
    );
  }

  if (/[\0\r\n]/.test(command)) {
    throw new Error("Command must be a single line and cannot contain NUL bytes.");
  }

  if (mode === "blacklist") {
    const matchesBlacklist = blacklist.some((rule) => rule.pattern.test(command));
    if (matchesBlacklist) {
      throw new Error("Command is blocked by a blacklist rule.");
    }
  } else {
    const matchesAllowlist = allowlist.some((rule) => rule.pattern.test(command));
    if (!matchesAllowlist) {
      throw new Error("Command is not in the allowlist.");
    }
  }

  return command;
}

function defaultShellCommand(): string {
  if (process.platform === "win32") {
    return process.env.ComSpec ?? "cmd.exe";
  }

  return process.env.SHELL ?? "/bin/sh";
}

function getShellArgs(shell: string, command: string): string[] {
  if (process.platform === "win32") {
    const normalized = shell.toLowerCase();
    if (normalized.endsWith("powershell.exe") || normalized.endsWith("pwsh.exe")) {
      return ["-NoProfile", "-Command", command];
    }

    return ["/d", "/s", "/c", command];
  }

  return ["-lc", command];
}

async function executeShellCommand(options: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: string;
  timeoutMs: number;
  maxOutputChars: number;
}): Promise<string> {
  const { command, cwd, env, shell, timeoutMs, maxOutputChars } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(shell, getShellArgs(shell, command), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    const appendChunk = (target: "stdout" | "stderr", chunk: Buffer): void => {
      const currentLength = stdout.length + stderr.length;
      if (currentLength >= maxOutputChars) {
        truncated = true;
        return;
      }

      const remaining = maxOutputChars - currentLength;
      const text = chunk.toString("utf8", 0, remaining);
      if (target === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }

      if (text.length < chunk.length) {
        truncated = true;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => appendChunk("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => appendChunk("stderr", chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const sections = [
        `Command: ${command}`,
        `Exit code: ${code ?? "unknown"}`,
      ];

      if (signal) {
        sections.push(`Signal: ${signal}`);
      }
      if (stdout.trim()) {
        sections.push(`STDOUT:\n${stdout.trimEnd()}`);
      }
      if (stderr.trim()) {
        sections.push(`STDERR:\n${stderr.trimEnd()}`);
      }
      if (truncated) {
        sections.push(`Output truncated to ${maxOutputChars} characters.`);
      }

      const result = sections.join("\n\n");
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms.\n\n${result}`));
        return;
      }

      resolve(result);
    });
  });
}