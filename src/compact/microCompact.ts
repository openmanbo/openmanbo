/**
 * Micro-compact: clears old tool results from conversation to save tokens
 * without running full summarization.
 *
 * Walks through the message array, identifies tool-result messages for
 * known "compactable" tools, and replaces all but the most recent N
 * results with a short placeholder.
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/** Tools whose results are safe to clear (they produce large, read-only output). */
const COMPACTABLE_TOOLS = new Set([
  "file_read",
  "bash",
  "grep",
  "glob",
  "web_fetch",
  "file_edit",
  "file_write",
]);

export interface MicroCompactConfig {
  /** How many recent tool results to keep intact (default 5). */
  keepRecentResults?: number;
}

const CLEARED_PLACEHOLDER = "[Old tool result content cleared]";

/**
 * Find the tool name associated with a tool_call_id by scanning backwards
 * for the assistant message that issued the call.
 */
function findToolName(
  messages: ChatCompletionMessageParam[],
  toolCallId: string,
  upToIndex: number,
): string | undefined {
  for (let i = upToIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const calls = (msg as { tool_calls?: Array<{ id: string; function?: { name: string } }> })
      .tool_calls;
    if (!calls) continue;
    for (const tc of calls) {
      if (tc.id === toolCallId) {
        return tc.function?.name;
      }
    }
  }
  return undefined;
}

/**
 * Apply micro-compact: clear old compactable tool results, keeping only
 * the most recent `keepRecentResults` intact.
 *
 * Returns a new array (does not mutate the input).
 */
export function microCompact(
  messages: ChatCompletionMessageParam[],
  config?: MicroCompactConfig,
): ChatCompletionMessageParam[] {
  const keep = config?.keepRecentResults ?? 5;

  // First pass: collect indices of compactable tool results
  const compactableIndices: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "tool") continue;
    const toolMsg = msg as { role: "tool"; tool_call_id?: string; content?: unknown };
    const toolCallId = toolMsg.tool_call_id;
    if (!toolCallId) continue;

    const toolName = findToolName(messages, toolCallId, i);
    if (toolName && COMPACTABLE_TOOLS.has(toolName)) {
      compactableIndices.push(i);
    }
  }

  // Determine which indices to clear (everything except the last `keep`)
  const clearCount = Math.max(0, compactableIndices.length - keep);
  const indicesToClear = new Set(compactableIndices.slice(0, clearCount));

  if (indicesToClear.size === 0) {
    return messages;
  }

  // Second pass: build new array with cleared results
  return messages.map((msg, i) => {
    if (!indicesToClear.has(i)) return msg;
    return { ...msg, content: CLEARED_PLACEHOLDER } as ChatCompletionMessageParam;
  });
}

/**
 * Count the number of tool result messages in the conversation.
 */
export function countToolResults(
  messages: ChatCompletionMessageParam[],
): number {
  return messages.filter((m) => m.role === "tool").length;
}
