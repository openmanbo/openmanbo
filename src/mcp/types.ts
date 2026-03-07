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
 * A single allowlist rule for the built-in exec tool.
 * The pattern is treated as a full-string regular expression.
 */
export interface BuiltinExecAllowlistRule {
  /** Regex source used to validate an entire command string */
  pattern: string;
  /** Optional human-readable note describing when the rule should be used */
  description?: string;
}

/**
 * Configuration for OpenManbo's built-in shell execution tool.
 */
export interface BuiltinExecToolConfig {
  /** Whether the tool is enabled */
  enabled?: boolean;
  /** Tool name exposed to the model */
  name?: string;
  /** Tool description exposed to the model */
  description?: string;
  /** Working directory used for command execution */
  cwd?: string;
  /** Optional shell executable to launch (defaults to the platform shell) */
  shell?: string;
  /** Extra environment variables passed to the process */
  env?: Record<string, string>;
  /** Per-command timeout in milliseconds */
  timeoutMs?: number;
  /** Max combined stdout/stderr characters captured from the command */
  maxOutputChars?: number;
  /** Max accepted command length before validation fails */
  maxCommandLength?: number;
  /** Allowlist rules used to validate requested commands */
  allowlist: BuiltinExecAllowlistRule[];
}

export interface BuiltinToolsConfig {
  exec?: BuiltinExecToolConfig;
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
  mcpServers?: Record<string, McpServerConfig>;
  builtinTools?: BuiltinToolsConfig;
}
