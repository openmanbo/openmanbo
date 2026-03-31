import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type OpenAI from "openai";
import { BuiltinToolManager } from "./builtin.js";
import {
  isStdioConfig,
  isHttpConfig,
  type McpConfig,
  type McpServerConfig,
  type McpStdioServerConfig,
  type McpHttpServerConfig,
} from "./types.js";
/**
 * Wraps a single connected MCP server client.
 */
interface McpServerEntry {
  name: string;
  client: Client;
  tools: Tool[];
}

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

  /**
   * Returns all tools from all connected MCP servers as OpenAI tool definitions.
   */
  get tools(): OpenAI.ChatCompletionTool[] {
    return [
      ...this.builtinTools.tools,
      ...this.servers.flatMap((server) =>
        server.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description ?? "",
            parameters: (tool.inputSchema ?? { type: "object", properties: {} }) as OpenAI.FunctionParameters,
          },
        })),
      ),
    ];
  }

  /**
   * Call a tool by name, dispatching to the correct MCP server.
   * Returns the tool result as a string.
   */
  async call(toolName: string, args: Record<string, unknown>): Promise<string> {
    if (this.builtinTools.has(toolName)) {
      return this.builtinTools.call(toolName, args);
    }

    for (const server of this.servers) {
      const hasTool = server.tools.some((t) => t.name === toolName);
      if (hasTool) {
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
    }
    throw new Error(`Unknown MCP tool: ${toolName}`);
  }

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
