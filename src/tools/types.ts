/**
 * Core tool system types aligned with Claude Code architecture.
 *
 * Built-in tools implement this interface directly, allowing first-class
 * tool execution without going through MCP.  External MCP tools are
 * wrapped to expose the same shape so the Agent sees a unified pool.
 */

import type OpenAI from "openai";

/* ────────────────────────────────────────────────────────────────────
 * Tool result
 * ──────────────────────────────────────────────────────────────────── */

export interface ToolResult {
  /** Text content returned to the model */
  content: string;
  /** Whether the tool invocation ended in an error */
  isError?: boolean;
}

/* ────────────────────────────────────────────────────────────────────
 * Tool definition (how a tool advertises itself)
 * ──────────────────────────────────────────────────────────────────── */

export interface ToolInput {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolSpec {
  /** Unique tool name (kebab-case recommended) */
  name: string;
  /** Human-readable description shown to the model */
  description: string;
  /** JSON Schema describing accepted parameters */
  input: ToolInput;
}

/* ────────────────────────────────────────────────────────────────────
 * Tool interface
 * ──────────────────────────────────────────────────────────────────── */

/**
 * A built-in tool that the Agent can invoke without MCP.
 */
export interface Tool {
  /** Static specification describing the tool */
  spec: ToolSpec;

  /**
   * Execute the tool with the given arguments.
   * Return a ToolResult with the output content.
   */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/* ────────────────────────────────────────────────────────────────────
 * Conversion helpers
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Convert a built-in Tool spec into the OpenAI ChatCompletionTool format.
 */
export function toOpenAITool(tool: Tool): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.spec.name,
      description: tool.spec.description,
      parameters: tool.spec.input as unknown as OpenAI.FunctionParameters,
    },
  };
}

/**
 * Convert an array of built-in Tools to OpenAI ChatCompletionTool format.
 */
export function toOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map(toOpenAITool);
}
