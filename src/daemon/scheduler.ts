import type { LifecycleManager } from "./lifecycle.js";
import type { ScheduledTask } from "./types.js";

/**
 * A minimal cron-like scheduler built on `setInterval`.
 *
 * Each registered task fires at a fixed interval (in milliseconds) and sends
 * an IPC `scheduled-task` message to the Agent via the {@link LifecycleManager}.
 */
export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lifecycle: LifecycleManager;

  constructor(lifecycle: LifecycleManager) {
    this.lifecycle = lifecycle;
  }

  /** Register (or update) a scheduled task. */
  addTask(task: ScheduledTask): void {
    this.removeTask(task.id);
    this.tasks.set(task.id, task);

    if (!task.enabled) return;

    const intervalMs =
      typeof task.schedule === "number"
        ? task.schedule
        : parseSimpleInterval(task.schedule);

    if (intervalMs <= 0) {
      console.warn(
        `[scheduler] Task "${task.id}": unsupported schedule "${String(task.schedule)}". Skipped.`,
      );
      return;
    }

    const timer = setInterval(() => {
      this.lifecycle.send({
        type: "scheduled-task",
        taskId: task.id,
        payload: task.payload,
      });
    }, intervalMs);

    // Allow the process to exit even if timers are pending.
    timer.unref();
    this.timers.set(task.id, timer);
  }

  /** Remove a previously registered task. */
  removeTask(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    this.tasks.delete(id);
  }

  /** List all registered tasks. */
  listTasks(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  /** Stop all timers. */
  stopAll(): void {
    for (const [id] of this.timers) {
      this.removeTask(id);
    }
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Parse a human-readable interval string into milliseconds.
 *
 * Supported formats:
 *   "30s"  → 30 000
 *   "5m"   → 300 000
 *   "2h"   → 7 200 000
 *
 * Returns 0 for unrecognised formats.
 */
function parseSimpleInterval(expr: string): number {
  const match = /^(\d+)\s*(s|m|h)$/i.exec(expr.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return 0;
  }
}
