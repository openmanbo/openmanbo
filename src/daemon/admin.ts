import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { LifecycleManager } from "./lifecycle.js";
import type { Scheduler } from "./scheduler.js";
import type { DaemonStatus } from "./types.js";

/**
 * Lightweight HTTP admin server exposing the Daemon's status and controls.
 *
 * Routes:
 *   GET  /healthz       → 200 "ok"
 *   GET  /api/status     → JSON {@link DaemonStatus}
 *   POST /api/restart    → Trigger an agent restart
 *   POST /api/stop       → Stop the agent
 *   POST /api/start      → Start the agent
 */
export class AdminServer {
  private server: Server;
  private lifecycle: LifecycleManager;
  private scheduler: Scheduler;

  constructor(lifecycle: LifecycleManager, scheduler: Scheduler) {
    this.lifecycle = lifecycle;
    this.scheduler = scheduler;
    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  /** Start listening on the given port. */
  listen(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`[admin] HTTP server listening on http://localhost:${String(port)}`);
        resolve();
      });
    });
  }

  /** Close the HTTP server. */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /* ── Request router ─────────────────────────────────────────────── */

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // CORS headers for local development.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === "/healthz" && method === "GET") {
      this.json(res, 200, { status: "ok" });
      return;
    }

    if (url === "/api/status" && method === "GET") {
      const status = this.buildStatus();
      this.json(res, 200, status);
      return;
    }

    if (url === "/api/restart" && method === "POST") {
      void this.lifecycle.stop().then(() => {
        this.lifecycle.start();
      });
      this.json(res, 202, { message: "Agent restart initiated" });
      return;
    }

    if (url === "/api/stop" && method === "POST") {
      void this.lifecycle.stop();
      this.json(res, 202, { message: "Agent stop initiated" });
      return;
    }

    if (url === "/api/start" && method === "POST") {
      this.lifecycle.start();
      this.json(res, 200, { message: "Agent started" });
      return;
    }

    this.json(res, 404, { error: "Not found" });
  }

  /* ── Helpers ────────────────────────────────────────────────────── */

  private buildStatus(): DaemonStatus {
    return {
      agentStatus: this.lifecycle.status,
      agentPid: this.lifecycle.agentPid,
      uptime: this.lifecycle.uptime,
      restartCount: this.lifecycle.restartCount,
      lastBuildError: this.lifecycle.lastBuildError,
      scheduledTasks: this.scheduler.listTasks(),
    };
  }

  private json(res: ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
