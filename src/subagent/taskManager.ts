/**
 * TaskManager – Central registry for sub-agent tasks.
 * Tracks task lifecycle, provides polling and notification.
 */

import type {
  TaskState,
  TaskStatus,
  TaskNotification,
  SubagentConfig,
} from "./types.js";
import { SUBAGENT_DEFAULTS } from "./types.js";

export class TaskManager {
  private tasks = new Map<string, TaskState>();
  private readonly config: Required<SubagentConfig>;
  /** Track which tasks have had their status change read */
  private notifiedStatuses = new Map<string, TaskStatus>();

  constructor(config?: SubagentConfig) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? SUBAGENT_DEFAULTS.maxConcurrent,
      maxTurns: config?.maxTurns ?? SUBAGENT_DEFAULTS.maxTurns,
      inheritTools: config?.inheritTools ?? SUBAGENT_DEFAULTS.inheritTools,
    };
  }

  registerTask(task: TaskState): void {
    this.tasks.set(task.id, task);
    this.notifiedStatuses.set(task.id, task.status);
  }

  updateTask(id: string, updates: Partial<TaskState>): void {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, updates);
  }

  getTask(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  listTasks(filter?: { status?: TaskStatus }): TaskState[] {
    const all = [...this.tasks.values()];
    if (filter?.status) {
      return all.filter((t) => t.status === filter.status);
    }
    return all;
  }

  stopTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === "completed" || task.status === "failed" || task.status === "killed") {
      return false;
    }
    task.status = "killed";
    task.updatedAt = Date.now();
    return true;
  }

  /**
   * Get tasks with pending notifications (status changed since last check).
   */
  getPendingNotifications(): TaskNotification[] {
    const notifications: TaskNotification[] = [];

    for (const task of this.tasks.values()) {
      const lastNotified = this.notifiedStatuses.get(task.id);
      if (lastNotified !== task.status) {
        notifications.push({
          taskId: task.id,
          status: task.status,
          summary: task.description,
          result: task.result,
        });
        this.notifiedStatuses.set(task.id, task.status);
      }
    }

    return notifications;
  }

  /** Check if we can spawn more agents */
  canSpawnMore(): boolean {
    return this.activeCount < this.config.maxConcurrent;
  }

  /** Get active task count (pending or running) */
  get activeCount(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === "pending" || task.status === "running") {
        count++;
      }
    }
    return count;
  }
}
