import { fork, type ChildProcess, execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  AgentStatus,
  IpcBuildError,
  IpcMessage,
} from "./types.js";
import { EXIT_CODE_RESTART } from "./types.js";

/** Delay (ms) before restarting the agent after an unexpected crash. */
const RESTART_DELAY_MS = 2_000;

/** Timeout (ms) to wait for the agent to exit after SIGTERM before escalating to SIGKILL. */
const STOP_TIMEOUT_MS = 10_000;

export interface LifecycleManagerOptions {
  /** Absolute path to the agent script to fork. */
  agentScript: string;
  /** Extra CLI args forwarded to the agent process. */
  agentArgs?: string[];
  /** Shell command executed to rebuild the project (default: "npm run build"). */
  buildCommand?: string;
  /** Working directory for the agent process (default: process.cwd()). */
  cwd?: string;
}

/**
 * Manages the Agent child process lifecycle.
 *
 * Responsibilities:
 * - Spawns the Agent via `child_process.fork` with IPC.
 * - Listens for exit-code 42 ("please rebuild & restart").
 * - Runs the build command; on failure reverts and injects the build error
 *   into the agent so it can attempt to self-heal.
 * - Emits events so the admin layer can observe status changes.
 */
export class LifecycleManager extends EventEmitter {
  private agentScript: string;
  private agentArgs: string[];
  private buildCommand: string;
  private cwd: string;

  private child: ChildProcess | null = null;
  private _status: AgentStatus = "stopped";
  private _restartCount = 0;
  private _lastBuildError: string | undefined;
  private _startedAt = Date.now();
  private stopping = false;
  /** Queued IPC messages to deliver once the agent signals readiness. */
  private pendingMessages: IpcMessage[] = [];

  constructor(opts: LifecycleManagerOptions) {
    super();
    this.agentScript = opts.agentScript;
    this.agentArgs = opts.agentArgs ?? [];
    this.buildCommand = opts.buildCommand ?? "npm run build";
    this.cwd = opts.cwd ?? process.cwd();
  }

  /* ── Public getters ─────────────────────────────────────────────── */

  get status(): AgentStatus {
    return this._status;
  }

  get agentPid(): number | undefined {
    return this.child?.pid;
  }

  get restartCount(): number {
    return this._restartCount;
  }

  get uptime(): number {
    return Date.now() - this._startedAt;
  }

  get lastBuildError(): string | undefined {
    return this._lastBuildError;
  }

  /* ── Lifecycle API ──────────────────────────────────────────────── */

  /** Spawn the agent process. */
  start(): void {
    if (this.child) return;
    this.stopping = false;
    this.spawn();
  }

  /**
   * Gracefully stop the agent process.
   * Sends SIGTERM first; if the process does not exit within
   * {@link STOP_TIMEOUT_MS} ms, escalates to SIGKILL.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (!this.child) return;
    const child = this.child;
    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        console.warn("[daemon] Agent did not exit after SIGTERM; sending SIGKILL.");
        child.kill("SIGKILL");
      }, STOP_TIMEOUT_MS);

      child.once("exit", () => {
        clearTimeout(killTimer);
        this.child = null;
        this.setStatus("stopped");
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  /** Send an IPC message to the running agent. */
  send(message: IpcMessage): boolean {
    if (!this.child?.connected) return false;
    return this.child.send(message);
  }

  /* ── Internals ──────────────────────────────────────────────────── */

  private spawn(): void {
    this.setStatus("running");
    this.child = fork(this.agentScript, this.agentArgs, {
      cwd: this.cwd,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });

    this.child.on("message", (msg: IpcMessage) => {
      // When the agent signals readiness, flush any queued messages.
      if (msg.type === "agent-ready") {
        this.flushPendingMessages();
      }
      this.emit("agent-message", msg);
    });

    this.child.on("exit", (code, signal) => {
      this.child = null;
      this.pendingMessages = [];

      if (this.stopping) {
        this.setStatus("stopped");
        return;
      }

      if (code === EXIT_CODE_RESTART) {
        this.handleRestartRequest();
        return;
      }

      // Unexpected crash – restart after a short delay.
      console.error(
        `[daemon] Agent exited unexpectedly (code=${code}, signal=${signal}). Restarting in 2 s…`,
      );
      setTimeout(() => {
        if (!this.stopping) {
          this._restartCount++;
          this.spawn();
        }
      }, RESTART_DELAY_MS);
    });

    this.child.on("error", (err) => {
      console.error("[daemon] Agent process error:", err.message);
    });
  }

  /**
   * Handle exit-code 42: run the build, then respawn.
   * If the build fails, respawn anyway and inject the error via IPC
   * so the agent can attempt to self-heal.
   */
  private handleRestartRequest(): void {
    this.setStatus("building");
    console.log("[daemon] Agent requested rebuild (exit 42). Building…");

    let buildFailed = false;
    let buildStderr = "";

    try {
      execSync(this.buildCommand, {
        cwd: this.cwd,
        stdio: ["ignore", "inherit", "pipe"],
      });
      console.log("[daemon] Build succeeded.");
      this._lastBuildError = undefined;
    } catch (err: unknown) {
      const execErr = err as { stderr?: Buffer };
      buildStderr = execErr.stderr?.toString() ?? String(err);
      buildFailed = true;
      this._lastBuildError = buildStderr;
      console.error("[daemon] Build failed:\n", buildStderr);
    }

    this._restartCount++;

    // If the build failed, queue the error so it is delivered once the
    // agent sends its "agent-ready" IPC message.
    if (buildFailed) {
      const errMsg: IpcBuildError = {
        type: "build-error",
        stderr: buildStderr,
      };
      this.pendingMessages.push(errMsg);
    }

    this.spawn();
  }

  /** Deliver all queued messages to the agent. */
  private flushPendingMessages(): void {
    const msgs = this.pendingMessages.splice(0);
    for (const msg of msgs) {
      this.send(msg);
    }
  }

  private setStatus(s: AgentStatus): void {
    this._status = s;
    this.emit("status", s);
  }
}
