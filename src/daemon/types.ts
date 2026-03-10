/**
 * IPC message types exchanged between the Daemon and the Agent process.
 */

/* ── Exit codes ────────────────────────────────────────────────────── */

/** Exit code the Agent uses to request a rebuild-and-restart cycle. */
export const EXIT_CODE_RESTART = 42;

/* ── IPC messages (Daemon ↔ Agent) ─────────────────────────────────── */

/** Base shape for every IPC message. */
export interface IpcMessageBase {
  type: string;
}

/** Daemon → Agent: a scheduled task is due. */
export interface IpcScheduledTask extends IpcMessageBase {
  type: "scheduled-task";
  taskId: string;
  payload?: Record<string, unknown>;
}

/** Daemon → Agent: inject a build error so the agent can self-heal. */
export interface IpcBuildError extends IpcMessageBase {
  type: "build-error";
  stderr: string;
}

/** Agent → Daemon: agent is ready to accept work. */
export interface IpcAgentReady extends IpcMessageBase {
  type: "agent-ready";
}

/** Union of all known IPC messages. */
export type IpcMessage = IpcScheduledTask | IpcBuildError | IpcAgentReady;

/* ── Daemon configuration ──────────────────────────────────────────── */

export interface DaemonConfig {
  /** Command used to start the agent (default: entry from package.json). */
  agentCommand: string;
  /** Arguments passed to the agent command. */
  agentArgs: string[];
  /** Port for the admin HTTP server (default: 7777). */
  adminPort: number;
  /** Build command executed before restarting the agent (default: npm run build). */
  buildCommand: string;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  agentCommand: process.execPath, // node
  agentArgs: ["dist/cli/index.js"],
  adminPort: 7777,
  buildCommand: "npm run build",
};

/* ── Scheduled task definition ─────────────────────────────────────── */

export interface ScheduledTask {
  id: string;
  /** Cron expression (e.g. "0 0 * * *") or interval in milliseconds. */
  schedule: string | number;
  /** Optional JSON payload forwarded to the Agent via IPC. */
  payload?: Record<string, unknown>;
  /** Whether the task is currently enabled. */
  enabled: boolean;
}

/* ── Agent status reported by the Daemon ───────────────────────────── */

export type AgentStatus = "running" | "stopped" | "restarting" | "building";

export interface DaemonStatus {
  agentStatus: AgentStatus;
  agentPid: number | undefined;
  uptime: number;
  restartCount: number;
  lastBuildError: string | undefined;
  scheduledTasks: ScheduledTask[];
}
