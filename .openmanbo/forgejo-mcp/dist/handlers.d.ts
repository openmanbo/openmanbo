import { ForgejoClient } from "./forgejo-client.js";
type Params = Record<string, unknown>;
/**
 * Dispatch a tool call to the appropriate Forgejo API handler and return the
 * result as a human-readable string.
 */
export declare function handleTool(client: ForgejoClient, toolName: string, args: Params): Promise<string>;
export {};
//# sourceMappingURL=handlers.d.ts.map