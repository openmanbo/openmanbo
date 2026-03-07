/**
 * Configuration for a stdio-based MCP server (follows Claude Desktop convention).
 */
export interface McpStdioServerConfig {
  /** Executable command to spawn (e.g. "npx") */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Working directory for the spawned process */
  cwd?: string;
  /** Extra environment variables injected into the server process (e.g. API tokens) */
  env?: Record<string, string>;
}

/**
 * Configuration for a Streamable-HTTP-based MCP server.
 */
export interface McpHttpServerConfig {
  /** URL of the remote MCP server endpoint (e.g. "http://localhost:3000/mcp") */
  url: string;
  /** Extra HTTP headers sent with every request (e.g. Authorization) */
  headers?: Record<string, string>;
}

/**
 * A single MCP server entry can be either stdio or HTTP.
 */
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

/**
 * Type guard: returns true when the config describes a stdio-based server.
 */
export function isStdioConfig(cfg: McpServerConfig): cfg is McpStdioServerConfig {
  return "command" in cfg && !("url" in cfg);
}

/**
 * Type guard: returns true when the config describes an HTTP-based server.
 */
export function isHttpConfig(cfg: McpServerConfig): cfg is McpHttpServerConfig {
  return "url" in cfg && !("command" in cfg);
}

/**
 * Top-level shape of the `mcp.json` file stored in the `.openmanbo` directory.
 *
 * Example:
 * ```json
 * {
 *   "mcpServers": {
 *     "tavily": {
 *       "command": "npx",
 *       "args": ["-y", "tavily-mcp"],
 *       "env": { "TAVILY_API_KEY": "tvly-your-key-here" }
 *     },
 *     "remote-server": {
 *       "url": "http://localhost:3000/mcp"
 *     }
 *   }
 * }
 * ```
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}
