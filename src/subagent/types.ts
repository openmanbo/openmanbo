/**
 * Subagent/Task system types, aligned with Claude Code's task architecture.
 */

import { randomBytes } from "node:crypto";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "killed";

export interface TaskState {
  id: string;
  description: string;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  tokenUsage?: number;
  toolCallCount?: number;
}

export interface TaskNotification {
  taskId: string;
  status: TaskStatus;
  summary?: string;
  result?: string;
}

export interface SubagentConfig {
  /** Maximum concurrent sub-agents */
  maxConcurrent?: number;
  /** Maximum turns per sub-agent */
  maxTurns?: number;
  /** Inherit parent's tools */
  inheritTools?: boolean;
}

export const SUBAGENT_DEFAULTS = {
  maxConcurrent: 5,
  maxTurns: 50,
  inheritTools: true,
} as const satisfies Required<SubagentConfig>;

/**
 * Format a TaskNotification as XML, aligned with Claude Code's notification format.
 */
export function formatTaskNotification(notification: TaskNotification): string {
  const lines = [
    "<task-notification>",
    `  <task-id>${escapeXml(notification.taskId)}</task-id>`,
    `  <status>${escapeXml(notification.status)}</status>`,
  ];
  if (notification.summary !== undefined) {
    lines.push(`  <summary>${escapeXml(notification.summary)}</summary>`);
  }
  if (notification.result !== undefined) {
    lines.push(`  <result>${escapeXml(notification.result)}</result>`);
  }
  lines.push("</task-notification>");
  return lines.join("\n");
}

/**
 * Generate a short unique task ID like 'task-abc123'.
 */
export function generateTaskId(): string {
  return `task-${randomBytes(4).toString("hex")}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
