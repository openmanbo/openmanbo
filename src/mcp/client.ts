import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type OpenAI from "openai";
import type { ToolExecutionOutput } from "../kernel/tool-execution.js";
import type { SkillDefinition } from "../kernel/prompt.js";
import { BuiltinToolManager } from "./builtin.js";
import {
  isStdioConfig,
  isHttpConfig,
  type McpConfig,
  type McpServerConfig,
  type McpStdioServerConfig,
  type McpHttpServerConfig,
  type McpResource,
} from "./types.js";

/* ────────────────────────────────────────────────────────────────────
 * MCP tool naming helpers (Claude Code convention)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Normalize a server name for use in MCP tool naming.
 * Replaces dots, spaces, and other invalid chars with underscores.
 * Ensures result is 1-64 chars matching: ^[a-zA-Z0-9_-]{1,64}$
 */
function normalizeServerName(name: string): string {
  const normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return normalized || "_";
}

/**
 * Build MCP tool name: mcp__servername__toolname
 */
function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeServerName(serverName)}__${toolName}`;
}

/**
 * Parse MCP tool name back to server and tool components.
 * Expects format: mcp__<serverName>__<toolName>
 * The server name is the segment between the first and second double-underscore.
 * Returns undefined if the name does not match the mcp__ prefix pattern.
 */
export function parseMcpToolName(
  fullName: string,
): { serverName: string; toolName: string } | undefined {
  if (!fullName.startsWith("mcp__")) return undefined;
  // Find the second occurrence of "__" after the "mcp__" prefix
  const rest = fullName.slice(5); // strip "mcp__"
  const separatorIdx = rest.indexOf("__");
  if (separatorIdx <= 0) return undefined;
  const serverName = rest.slice(0, separatorIdx);
  const toolName = rest.slice(separatorIdx + 2);
  if (!toolName) return undefined;
  return { serverName, toolName };
}

/* ────────────────────────────────────────────────────────────────────
 * McpServerEntry
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Wraps a single connected MCP server client.
 */
interface McpServerEntry {
  name: string;
  client: Client;
  tools: Tool[];
}

/* ────────────────────────────────────────────────────────────────────
 * McpManager
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Manages connections to one or more MCP servers defined in `mcp.json`.
 * Exposes a flat list of OpenAI-compatible tool definitions and a method
 * to dispatch tool calls to the appropriate server.
 *
 * Supports two transport types:
 * - **stdio** – spawns a local process (requires `command` in config)
 * - **Streamable HTTP** – connects to a remote URL (requires `url` in config)
 */
export class McpManager {
  private servers: McpServerEntry[] = [];
  private builtinTools = new BuiltinToolManager();
  private disabledServers = new Set<string>();

  /**
   * Connect to all servers defined in the config.
   * Call this once before using `tools` or `call`.
   */
  async connect(config: McpConfig): Promise<void> {
    this.builtinTools = new BuiltinToolManager(config.builtinTools);

    for (const [name, serverCfg] of Object.entries(config.mcpServers ?? {})) {
      if (!this.isValidServerConfig(serverCfg)) {
        console.warn(
          `[MCP] Invalid config for server "${name}". Expected an object with a string "command" (stdio) or "url" (HTTP).`,
        );
        continue;
      }
      try {
        const entry = await this.connectServer(name, serverCfg);
        this.servers.push(entry);
      } catch (err) {
        console.warn(
          `[MCP] Failed to connect to server "${name}": ${String(err)}`,
        );
      }
    }
  }

  private async connectServer(
    name: string,
    cfg: McpServerConfig,
  ): Promise<McpServerEntry> {
    const client = new Client({ name: "openmanbo", version: "0.1.0" });

    if (isHttpConfig(cfg)) {
      await this.connectHttpServer(client, cfg);
    } else if (isStdioConfig(cfg)) {
      await this.connectStdioServer(client, cfg);
    } else {
      throw new Error(
        `Ambiguous config: provide either "command" (stdio) or "url" (HTTP), not both.`,
      );
    }

    const { tools } = await client.listTools();
    return { name, client, tools };
  }

  private async connectStdioServer(
    client: Client,
    cfg: McpStdioServerConfig,
  ): Promise<void> {
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args ?? [],
      cwd: cfg.cwd ?? process.cwd(),
      env: cfg.env
        ? { ...cfg.env, ...process.env } as Record<string, string>
        : undefined,
    });
    await client.connect(transport);
  }

  private async connectHttpServer(
    client: Client,
    cfg: McpHttpServerConfig,
  ): Promise<void> {
    const transport = new StreamableHTTPClientTransport(
      new URL(cfg.url),
      cfg.headers
        ? { requestInit: { headers: cfg.headers } }
        : undefined,
    );
    await client.connect(transport);
  }

  private isValidServerConfig(cfg: unknown): cfg is McpServerConfig {
    if (typeof cfg !== "object" || cfg === null) {
      return false;
    }

    const obj = cfg as Record<string, unknown>;
    const hasCommand = typeof obj.command === "string" && obj.command.length > 0;
    const hasUrl = typeof obj.url === "string" && obj.url.length > 0;

    // Must have exactly one of command or url, not both
    return (hasCommand || hasUrl) && !(hasCommand && hasUrl);
  }

  /**
   * Configure built-in tools that require an LLM client for sub-calls.
   * Must be called after connect() and before any tool execution involving those tools.
   */
  configureBuiltins(client: OpenAI, model: string): void {
    this.builtinTools.configure(client, model);
  }

  configureQna(client: OpenAI, model: string): void {
    this.configureBuiltins(client, model);
  }

  /* ──────────────────────────────────────────────────────────────────
   * Server enable / disable
   * ────────────────────────────────────────────────────────────────── */

  enableServer(name: string): void {
    this.disabledServers.delete(name);
  }

  disableServer(name: string): void {
    this.disabledServers.add(name);
  }

  isServerEnabled(name: string): boolean {
    return !this.disabledServers.has(name);
  }

  getServerNames(): string[] {
    return this.servers.map((s) => s.name);
  }

  getServerStatus(): Array<{ name: string; enabled: boolean; toolCount: number }> {
    return this.servers.map((s) => ({
      name: s.name,
      enabled: !this.disabledServers.has(s.name),
      toolCount: s.tools.length,
    }));
  }

  /** Return only servers that are currently enabled. */
  private get enabledServers(): McpServerEntry[] {
    return this.servers.filter((s) => !this.disabledServers.has(s.name));
  }

  /* ──────────────────────────────────────────────────────────────────
   * Tools
   * ────────────────────────────────────────────────────────────────── */

  /**
   * Returns all tools from all connected (and enabled) MCP servers as
   * OpenAI tool definitions. Tool names follow the Claude Code naming
   * convention: `mcp__servername__toolname`.
   */
  get tools(): OpenAI.ChatCompletionTool[] {
    return [
      ...this.builtinTools.tools,
      ...this.enabledServers.flatMap((server) =>
        server.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: buildMcpToolName(server.name, tool.name),
            description: tool.description ?? "",
            parameters: (tool.inputSchema ?? { type: "object", properties: {} }) as OpenAI.FunctionParameters,
          },
        })),
      ),
    ];
  }

  /**
   * Call a tool by name, dispatching to the correct MCP server.
   * Accepts both the new `mcp__server__tool` format and the legacy
   * bare tool name for backward compatibility.
   */
  async call(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionOutput> {
    if (this.builtinTools.has(toolName)) {
      return this.builtinTools.call(toolName, args);
    }

    // Try parsing the mcp__ prefixed name first
    const parsed = parseMcpToolName(toolName);
    if (parsed) {
      const server = this.enabledServers.find(
        (s) => normalizeServerName(s.name) === parsed.serverName,
      );
      if (server) {
        return this.callServerTool(server, parsed.toolName, args);
      }
      throw new Error(`Unknown or disabled MCP server: ${parsed.serverName}`);
    }

    // Fallback: legacy bare tool name lookup across all enabled servers
    for (const server of this.enabledServers) {
      const hasTool = server.tools.some((t) => t.name === toolName);
      if (hasTool) {
        return this.callServerTool(server, toolName, args);
      }
    }
    throw new Error(`Unknown MCP tool: ${toolName}`);
  }

  private async callServerTool(
    server: McpServerEntry,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const result = await server.client.callTool({
      name: toolName,
      arguments: args,
    });
    // Flatten content blocks into a single string
    if (Array.isArray(result.content)) {
      return result.content
        .map((block) => {
          if (typeof block === "object" && block !== null && "text" in block) {
            return String((block as { text: unknown }).text);
          }
          return JSON.stringify(block);
        })
        .join("\n");
    }
    return JSON.stringify(result.content);
  }

  /* ──────────────────────────────────────────────────────────────────
   * Resources
   * ────────────────────────────────────────────────────────────────── */

  /** List all resources from all connected (and enabled) servers. */
  async listResources(): Promise<McpResource[]> {
    const results: McpResource[] = [];
    for (const server of this.enabledServers) {
      try {
        const { resources } = await server.client.listResources();
        for (const r of resources) {
          results.push({
            server: server.name,
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          });
        }
      } catch {
        // Server may not support resources – skip silently
      }
    }
    return results;
  }

  /** Read a specific resource by URI from the first server that owns it. */
  async readResource(uri: string): Promise<string> {
    for (const server of this.enabledServers) {
      try {
        const result = await server.client.readResource({ uri });
        return result.contents
          .map((c) => ("text" in c ? c.text : `[blob ${c.uri}]`))
          .join("\n");
      } catch {
        // Try next server
      }
    }
    throw new Error(`Resource not found: ${uri}`);
  }

  /* ──────────────────────────────────────────────────────────────────
   * Prompt / Skill integration
   * ────────────────────────────────────────────────────────────────── */

  /** List prompts from all connected MCP servers and convert to SkillDefinitions. */
  async listMcpSkills(): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];
    for (const server of this.enabledServers) {
      try {
        const { prompts } = await server.client.listPrompts();
        for (const prompt of prompts) {
          skills.push({
            name: prompt.name,
            description: prompt.description,
            content: prompt.description ?? `MCP prompt from ${server.name}`,
            source: `mcp/${server.name}/${prompt.name}`,
            arguments: prompt.arguments?.map((a) => a.name),
            loadedFrom: "mcp",
          });
        }
      } catch {
        // Server may not support prompts – skip silently
      }
    }
    return skills;
  }

  /* ──────────────────────────────────────────────────────────────────
   * Lifecycle
   * ────────────────────────────────────────────────────────────────── */

  /**
   * Disconnect all MCP server clients.
   */
  async disconnect(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.client.close();
      } catch {
        // ignore errors during cleanup
      }
    }
    this.servers = [];
  }

  /**
   * Whether any MCP servers with tools are connected.
   */
  get isActive(): boolean {
    return this.builtinTools.isActive || this.servers.length > 0;
  }
}
