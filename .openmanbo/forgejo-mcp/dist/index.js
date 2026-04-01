#!/usr/bin/env node
"use strict";
/**
 * Forgejo MCP Server
 *
 * A Model Context Protocol (MCP) server that lets AI agents interact with a
 * Forgejo instance using a personal access token.
 *
 * Configuration (environment variables):
 *   FORGEJO_URL   – Base URL of the Forgejo instance (e.g. https://codeberg.org)
 *   FORGEJO_TOKEN – Personal access token with the required scopes
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const forgejo_client_js_1 = require("./forgejo-client.js");
const tools_js_1 = require("./tools.js");
const handlers_js_1 = require("./handlers.js");
function getConfig() {
    const baseUrl = process.env.FORGEJO_URL;
    const token = process.env.FORGEJO_TOKEN;
    if (!baseUrl) {
        console.error("Error: FORGEJO_URL environment variable is required.\n" +
            "Example: FORGEJO_URL=https://codeberg.org");
        process.exit(1);
    }
    if (!token) {
        console.error("Error: FORGEJO_TOKEN environment variable is required.\n" +
            "Generate a token at: <your-forgejo-instance>/user/settings/applications");
        process.exit(1);
    }
    return { baseUrl, token };
}
async function main() {
    const config = getConfig();
    const client = new forgejo_client_js_1.ForgejoClient(config);
    const server = new index_js_1.Server({ name: "forgejo-mcp", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
    // Register the resource list handler
    server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => ({
        resources: [
            {
                uri: "forgejo://server/info",
                name: "Forgejo Server Info",
                description: "Connected Forgejo instance URL, access token, and authenticated user details",
                mimeType: "application/json",
            },
        ],
    }));
    // Register the resource read handler
    server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        if (uri === "forgejo://server/info") {
            let payload;
            try {
                const user = await client.get("/user");
                payload = { url: config.baseUrl, token: config.token, user };
            }
            catch (err) {
                if (err instanceof forgejo_client_js_1.ForgejoError) {
                    payload = {
                        url: config.baseUrl,
                        token: config.token,
                        error: `${err.message} (status ${err.status})`,
                    };
                }
                else {
                    throw err;
                }
            }
            return {
                contents: [
                    {
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(payload, null, 2),
                    },
                ],
            };
        }
        throw new Error(`Unknown resource: ${uri}`);
    });
    // Register the tool list handler
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
        tools: tools_js_1.TOOLS,
    }));
    // Register the tool call handler
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        let result;
        if (name === "get_git_token") {
            result = [
                `Forgejo URL: ${config.baseUrl}`,
                `Token: ${config.token}`,
            ].join("\n");
        }
        else {
            result = await (0, handlers_js_1.handleTool)(client, name, (args ?? {}));
        }
        return {
            content: [{ type: "text", text: result }],
        };
    });
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("Forgejo MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map