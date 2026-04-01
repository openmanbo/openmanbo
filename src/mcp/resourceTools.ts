/**
 * MCP Resource tools: list and read MCP server resources.
 * Aligned with Claude Code's ListMcpResourcesTool and ReadMcpResourceTool.
 */
import type { Tool, ToolResult } from "../tools/types.js";
import type { McpManager } from "./client.js";

export class ListMcpResourcesTool implements Tool {
  readonly spec = {
    name: "mcp_resources_list",
    description: "List all available resources from connected MCP servers.",
    input: {
      type: "object" as const,
      properties: {
        server: {
          type: "string",
          description: "Optional server name to filter resources.",
        },
      },
      additionalProperties: false,
    },
  };

  constructor(private mcp: McpManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const server = args.server as string | undefined;
    const resources = await this.mcp.listResources();
    const filtered = server
      ? resources.filter((r) => r.server === server)
      : resources;
    if (!filtered.length) return { content: "No MCP resources available." };
    const lines = filtered.map(
      (r) =>
        `- [${r.server}] ${r.name} (${r.uri})${r.description ? `: ${r.description}` : ""}`,
    );
    return {
      content: `MCP Resources (${filtered.length}):\n${lines.join("\n")}`,
    };
  }
}

export class ReadMcpResourceTool implements Tool {
  readonly spec = {
    name: "mcp_resource_read",
    description: "Read the content of a specific MCP resource by URI.",
    input: {
      type: "object" as const,
      properties: {
        uri: {
          type: "string",
          description: "The URI of the resource to read.",
        },
      },
      required: ["uri"] as string[],
      additionalProperties: false,
    },
  };

  constructor(private mcp: McpManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = String(args.uri ?? "");
    if (!uri) return { content: "Error: uri is required.", isError: true };
    try {
      const content = await this.mcp.readResource(uri);
      return { content };
    } catch (err) {
      return {
        content: `Error reading resource: ${String(err)}`,
        isError: true,
      };
    }
  }
}
