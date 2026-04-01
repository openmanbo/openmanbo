/**
 * Tool pool assembly – manages built-in and MCP tools.
 *
 * Aligned with Claude Code's tool pool pattern:
 * - Built-in tools are always available
 * - MCP tools are dynamically added
 * - Built-in tools take precedence over MCP tools on name conflict
 * - Unified execution interface for the Agent
 */

import type OpenAI from "openai";
import type { ToolExecutionOutput } from "../kernel/tool-execution.js";
import type { Tool, ToolResult } from "./types.js";
import { toOpenAITools } from "./types.js";
import { BashTool, type BashToolOptions } from "./BashTool.js";
import { FileReadTool, type FileReadToolOptions } from "./FileReadTool.js";
import { FileEditTool, type FileEditToolOptions } from "./FileEditTool.js";
import { FileWriteTool, type FileWriteToolOptions } from "./FileWriteTool.js";
import { GlobTool, type GlobToolOptions } from "./GlobTool.js";
import { GrepTool, type GrepToolOptions } from "./GrepTool.js";
import { WebFetchTool } from "./WebFetchTool.js";

/* ────────────────────────────────────────────────────────────────────
 * Tool Pool configuration
 * ──────────────────────────────────────────────────────────────────── */

export interface ToolPoolOptions {
  /** Working directory for file/bash operations */
  cwd?: string;
  /** Custom bash options */
  bash?: BashToolOptions;
  /** Custom file-read options */
  fileRead?: FileReadToolOptions;
  /** Custom file-edit options */
  fileEdit?: FileEditToolOptions;
  /** Custom file-write options */
  fileWrite?: FileWriteToolOptions;
  /** Custom glob options */
  glob?: GlobToolOptions;
  /** Custom grep options */
  grep?: GrepToolOptions;
  /** Disable specific built-in tools by name */
  disabled?: string[];
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Extract the tool name from a ChatCompletionTool (handles both function and custom tools).
 */
function getToolName(tool: OpenAI.ChatCompletionTool): string | undefined {
  if ("function" in tool && typeof tool.function === "object" && tool.function !== null) {
    return (tool.function as { name: string }).name;
  }
  return undefined;
}

/* ────────────────────────────────────────────────────────────────────
 * Tool Pool
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Creates all built-in tools with the given options.
 */
export function createBuiltinTools(options?: ToolPoolOptions): Tool[] {
  const cwd = options?.cwd ?? process.cwd();
  const disabled = new Set(options?.disabled ?? []);

  const tools: Tool[] = [];

  if (!disabled.has("bash")) {
    tools.push(new BashTool({ cwd, ...options?.bash }));
  }
  if (!disabled.has("file_read")) {
    tools.push(new FileReadTool({ cwd, ...options?.fileRead }));
  }
  if (!disabled.has("file_edit")) {
    tools.push(new FileEditTool({ cwd, ...options?.fileEdit }));
  }
  if (!disabled.has("file_write")) {
    tools.push(new FileWriteTool({ cwd, ...options?.fileWrite }));
  }
  if (!disabled.has("glob")) {
    tools.push(new GlobTool({ cwd, ...options?.glob }));
  }
  if (!disabled.has("grep")) {
    tools.push(new GrepTool({ cwd, ...options?.grep }));
  }
  if (!disabled.has("web_fetch")) {
    tools.push(new WebFetchTool());
  }

  return tools;
}

/**
 * ToolPool – Assembles built-in tools with MCP tools into a unified
 * tool set that the Agent can use.
 *
 * Key principles (aligned with Claude Code):
 * - Built-in tools take precedence over MCP tools on name conflict
 * - Provides a single `execute(name, args)` method
 * - Converts all tools to OpenAI ChatCompletionTool format
 */
export class ToolPool {
  private readonly builtinByName = new Map<string, Tool>();
  private mcpTools: OpenAI.ChatCompletionTool[] = [];
  private mcpExecutor?: (name: string, args: Record<string, unknown>) => Promise<ToolExecutionOutput>;

  constructor(builtinTools: Tool[]) {
    for (const tool of builtinTools) {
      this.builtinByName.set(tool.spec.name, tool);
    }
  }

  /**
   * Register additional built-in tools (e.g. subagent tools).
   * Skips tools whose name conflicts with an existing built-in tool.
   */
  addTools(tools: Tool[]): void {
    for (const tool of tools) {
      if (!this.builtinByName.has(tool.spec.name)) {
        this.builtinByName.set(tool.spec.name, tool);
      }
    }
  }

  /**
   * Add MCP tools to the pool.
   * MCP tools with the same name as a built-in tool are silently skipped.
   */
  setMcpTools(
    tools: OpenAI.ChatCompletionTool[],
    executor: (name: string, args: Record<string, unknown>) => Promise<ToolExecutionOutput>,
  ): void {
    // Filter out MCP tools that conflict with built-in tools
    this.mcpTools = tools.filter((t) => {
      const name = getToolName(t);
      if (name && this.builtinByName.has(name)) {
        console.warn(`[ToolPool] MCP tool "${name}" skipped – conflicts with built-in tool.`);
        return false;
      }
      return true;
    });
    this.mcpExecutor = executor;
  }

  /**
   * Get all tools in OpenAI ChatCompletionTool format.
   * Built-in tools come first, then MCP tools (sorted by name).
   */
  get tools(): OpenAI.ChatCompletionTool[] {
    const builtinOpenAI = toOpenAITools([...this.builtinByName.values()]);
    return [...builtinOpenAI, ...this.mcpTools].sort((a, b) =>
      (getToolName(a) ?? "").localeCompare(getToolName(b) ?? ""),
    );
  }

  /**
   * Execute a tool by name.
   * Checks built-in tools first, then falls through to MCP.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    // Check built-in tools first
    const builtin = this.builtinByName.get(name);
    if (builtin) {
      const result = await builtin.execute(args);
      return toolResultToOutput(result);
    }

    // Fall through to MCP
    if (this.mcpExecutor) {
      return this.mcpExecutor(name, args);
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * Check if a tool exists in the pool.
   */
  has(name: string): boolean {
    if (this.builtinByName.has(name)) return true;
    return this.mcpTools.some((t) => getToolName(t) === name);
  }

  /**
   * Get the names of all available tools.
   */
  get toolNames(): string[] {
    const names = new Set<string>();
    for (const name of this.builtinByName.keys()) {
      names.add(name);
    }
    for (const tool of this.mcpTools) {
      const name = getToolName(tool);
      if (name) names.add(name);
    }
    return [...names].sort();
  }
}

/**
 * Convert a ToolResult to the legacy ToolExecutionOutput format
 * used by the existing Agent.
 */
function toolResultToOutput(result: ToolResult): ToolExecutionOutput {
  return result.content;
}

/* ────────────────────────────────────────────────────────────────────
 * Re-exports
 * ──────────────────────────────────────────────────────────────────── */

export type { Tool, ToolResult, ToolSpec, ToolInput } from "./types.js";
export { toOpenAITool, toOpenAITools } from "./types.js";
export { BashTool } from "./BashTool.js";
export { FileReadTool } from "./FileReadTool.js";
export { FileEditTool } from "./FileEditTool.js";
export { FileWriteTool } from "./FileWriteTool.js";
export { GlobTool } from "./GlobTool.js";
export { GrepTool } from "./GrepTool.js";
export { WebFetchTool } from "./WebFetchTool.js";
