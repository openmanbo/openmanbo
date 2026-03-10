import { fork, type ChildProcess, execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  AgentStatus,
  IpcBuildError,
  IpcMessage,
} from "./types.js";
import { EXIT_CODE_RESTART } from "./types.js";

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

  /** Gracefully stop the agent process. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (!this.child) return;
    return new Promise<void>((resolve) => {
      this.child!.once("exit", () => {
        this.child = null;
        this.setStatus("stopped");
        resolve();
      });
      this.child!.kill("SIGTERM");
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
      this.emit("agent-message", msg);
    });

    this.child.on("exit", (code, signal) => {
      this.child = null;

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
      }, 2_000);
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
    this.spawn();

    // If the build failed, inject the error into the new agent so it can
    // attempt to fix its own code.
    if (buildFailed) {
      const errMsg: IpcBuildError = {
        type: "build-error",
        stderr: buildStderr,
      };
      // Wait briefly for the IPC channel to be ready.
      setTimeout(() => this.send(errMsg), 500);
    }
  }

  private setStatus(s: AgentStatus): void {
    this._status = s;
    this.emit("status", s);
  }
}
