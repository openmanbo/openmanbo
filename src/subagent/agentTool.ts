/**
 * AgentTool – Tool that allows the model to spawn sub-agents.
 * Aligned with Claude Code's AgentTool architecture.
 */

import type { Tool, ToolResult } from "../tools/types.js";
import type { TaskManager } from "./taskManager.js";
import { generateTaskId } from "./types.js";

export interface AgentFactory {
  (prompt: string): Promise<{
    result: string;
    tokenUsage?: number;
    toolCalls?: number;
  }>;
}

export class AgentTool implements Tool {
  readonly spec = {
    name: "agent",
    description:
      "Launch a sub-agent to perform a task autonomously. Use this for complex, independent tasks that can run in parallel. The sub-agent has access to the same tools as the parent.",
    input: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "A short 3-5 word description of the task.",
        },
        prompt: {
          type: "string",
          description:
            "Detailed instructions for the sub-agent. Be specific about what to do.",
        },
      },
      required: ["description", "prompt"],
      additionalProperties: false,
    },
  };

  constructor(
    private taskManager: TaskManager,
    private agentFactory: AgentFactory,
  ) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const description = String(args.description ?? "");
    const prompt = String(args.prompt ?? "");

    if (!description || !prompt) {
      return {
        content: "Error: Both 'description' and 'prompt' are required.",
        isError: true,
      };
    }

    if (!this.taskManager.canSpawnMore()) {
      return {
        content:
          "Error: Maximum concurrent sub-agents reached. Wait for existing tasks to complete or stop some.",
        isError: true,
      };
    }

    const taskId = generateTaskId();
    const task = {
      id: taskId,
      description,
      prompt,
      status: "pending" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.taskManager.registerTask(task);

    // Run asynchronously – don't await
    this.runAgent(taskId, prompt).catch(() => {});

    return {
      content: [
        "Sub-agent launched.",
        `Task ID: ${taskId}`,
        `Description: ${description}`,
        "Status: pending",
        "",
        "The sub-agent is working autonomously. Use task_list to check status or task_get to get results.",
      ].join("\n"),
    };
  }

  private async runAgent(taskId: string, prompt: string): Promise<void> {
    const task = this.taskManager.getTask(taskId);
    if (!task || task.status === "killed") return;

    this.taskManager.updateTask(taskId, {
      status: "running",
      updatedAt: Date.now(),
    });

    try {
      const result = await this.agentFactory(prompt);

      // Check if task was killed while running
      const current = this.taskManager.getTask(taskId);
      if (current?.status === "killed") return;

      this.taskManager.updateTask(taskId, {
        status: "completed",
        result: result.result,
        tokenUsage: result.tokenUsage,
        toolCallCount: result.toolCalls,
        updatedAt: Date.now(),
      });
    } catch (err) {
      const current = this.taskManager.getTask(taskId);
      if (current?.status === "killed") return;

      this.taskManager.updateTask(taskId, {
        status: "failed",
        error: String(err),
        updatedAt: Date.now(),
      });
    }
  }
}
