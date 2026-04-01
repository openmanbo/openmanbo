/**
 * Task management tools: list, get, stop tasks.
 */

import type { Tool, ToolResult } from "../tools/types.js";
import type { TaskManager } from "./taskManager.js";
import type { TaskStatus } from "./types.js";

/* ────────────────────────────────────────────────────────────────────
 * task_list
 * ──────────────────────────────────────────────────────────────────── */

export class TaskListTool implements Tool {
  readonly spec = {
    name: "task_list",
    description: "List all sub-agent tasks and their current status.",
    input: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description:
            "Filter by status: pending, running, completed, failed, killed",
          enum: ["pending", "running", "completed", "failed", "killed"],
        },
      },
      additionalProperties: false,
    },
  };

  constructor(private taskManager: TaskManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const statusFilter = args.status as string | undefined;
    const tasks = this.taskManager.listTasks(
      statusFilter ? { status: statusFilter as TaskStatus } : undefined,
    );

    if (!tasks.length) {
      return { content: "No tasks found." };
    }

    const lines = tasks.map(
      (t) => `- ${t.id} [${t.status}] ${t.description} (${formatAge(t.createdAt)})`,
    );
    return { content: `Tasks (${tasks.length}):\n${lines.join("\n")}` };
  }
}

/* ────────────────────────────────────────────────────────────────────
 * task_get
 * ──────────────────────────────────────────────────────────────────── */

export class TaskGetTool implements Tool {
  readonly spec = {
    name: "task_get",
    description: "Get the result and details of a specific sub-agent task.",
    input: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Task ID to retrieve." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };

  constructor(private taskManager: TaskManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = String(args.id ?? "");
    const task = this.taskManager.getTask(id);

    if (!task) {
      return { content: `Task not found: ${id}`, isError: true };
    }

    const lines = [
      `Task: ${task.id}`,
      `Description: ${task.description}`,
      `Status: ${task.status}`,
      `Created: ${formatAge(task.createdAt)}`,
      `Updated: ${formatAge(task.updatedAt)}`,
    ];

    if (task.tokenUsage !== undefined) {
      lines.push(`Token usage: ${task.tokenUsage}`);
    }
    if (task.toolCallCount !== undefined) {
      lines.push(`Tool calls: ${task.toolCallCount}`);
    }
    if (task.result !== undefined) {
      lines.push("", "Result:", task.result);
    }
    if (task.error !== undefined) {
      lines.push("", "Error:", task.error);
    }

    return { content: lines.join("\n") };
  }
}

/* ────────────────────────────────────────────────────────────────────
 * task_stop
 * ──────────────────────────────────────────────────────────────────── */

export class TaskStopTool implements Tool {
  readonly spec = {
    name: "task_stop",
    description: "Stop a running sub-agent task.",
    input: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Task ID to stop." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };

  constructor(private taskManager: TaskManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = String(args.id ?? "");
    const stopped = this.taskManager.stopTask(id);

    if (!stopped) {
      return {
        content: `Could not stop task: ${id}. It may not exist or is already completed.`,
        isError: true,
      };
    }

    return { content: `Task ${id} has been stopped.` };
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

function formatAge(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
