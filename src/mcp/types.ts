/**
 * Configuration for a single MCP server (follows Claude Desktop convention).
 */
export interface McpServerConfig {
  /** Executable command to spawn (e.g. "npx") */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Extra environment variables injected into the server process (e.g. API tokens) */
  env?: Record<string, string>;
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
 *     }
 *   }
 * }
 * ```
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}
