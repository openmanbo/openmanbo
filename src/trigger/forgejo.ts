import type { AppConfig } from "../config/env.js";
import {
  Agent,
  createLLMClient,
  buildSystemPrompt,
  withSkillTool,
  buildSkillRouteMessages,
} from "../kernel/index.js";
import { McpManager, type McpConfig } from "../mcp/index.js";
import {
  resolveDataDir,
  readIdentity,
  readMcpConfig,
  readSkills,
  readQnaTopics,
  injectQnaTopics,
} from "../storage/index.js";
import { createLogger } from "../logger.js";

const log = createLogger("trigger:forgejo");

let isProcessing = false;

/** Check whether a Forgejo poll cycle is currently in progress. */
export function isForgejoProcessing(): boolean {
  return isProcessing;
}

const ACTIVATION_PROMPT = `\
You have been activated by the scheduled Forgejo notification poller — new unread notifications exist.

Work through the unread notifications autonomously and complete the needed actions where possible.

Instructions:
1. Use sequential-thinking (sequentialthinking tool) to plan before taking action.
2. Follow the **forgejo** skill to get details on each notification and determine the appropriate response:
   - Call get_user to confirm identity.
   - Call list_notifications to fetch unread notifications.
   - Classify, prioritize, and route each actionable notification.
3. Prefer the built-in exec tool whenever concrete work can be done locally in the repository or shell environment.
  - Use exec to inspect files, edit code, run tests, format, validate, and gather evidence instead of stopping at analysis.
  - Do not defer actionable local work when exec can move the task forward safely.
  - Keep using dedicated Forgejo or MCP tools for Forgejo API actions such as reading notifications, posting comments, and marking notifications read.
4. If you are handling a long queue, switching between substantially different notifications, or the working context is getting crowded, call compress_context to create a compact continuation snapshot before proceeding.
5. For each actionable notification, execute the appropriate scenario or sub-skill:
   - Issue assigned to you → load forgejo-coder and implement it.
   - @ mention requesting action → respond via create_comment, then implement if needed.
   - Review request / review comment → load forgejo-coder to address feedback.
   - Informational (merged/closed) → mark as read and move on.
6. If you are blocked, use ask tool to request help from instructions.
7. After processing one notification, call mark_notification_read to mark it as read.
8. Use self-reflection tool after each notification and adjust your approach for the next one.

Do not skip the sequential-thinking step or the forgejo skill instructions. Prefer exec for concrete local work whenever it is available and appropriate. Use compress_context when it will materially improve continuity, not by default after every notification.\
`;

function ensureActivationCompressionTool(config: McpConfig): McpConfig {
  return {
    ...config,
    builtinTools: {
      ...config.builtinTools,
      compression: {
        ...config.builtinTools?.compression,
        enabled: true,
      },
    },
  };
}

/**
 * Poll Forgejo for unread notifications and, if any are found,
 * spin up a fresh Agent to triage and process them.
 *
 * Layer 1 (poll) is a lightweight MCP-only call — no LLM involved.
 * Layer 2 (agent) only runs when Layer 1 detects work.
 */
export async function handleForgejoPoll(config: AppConfig): Promise<void> {
  if (isProcessing) {
    log.warn("Previous poll still in progress, skipping this cycle");
    return;
  }

  isProcessing = true;
  const mcp = new McpManager();

  try {
    // ── Layer 1: lightweight notification check ────────────────────
    const dataDir = resolveDataDir(config.dataDir);
    const [mcpConfig, qnaTopics] = await Promise.all([
      readMcpConfig(dataDir),
      readQnaTopics(dataDir),
    ]);

    const mergedMcpConfig = injectQnaTopics(mcpConfig, qnaTopics);

    if (!mergedMcpConfig) {
      log.warn("No MCP config found, skipping Forgejo poll");
      return;
    }

    await mcp.connect(ensureActivationCompressionTool(mergedMcpConfig));

    const client = createLLMClient(config);
    mcp.configureQna(client, config.model);

    let raw: string;
    try {
      const result = await mcp.call("list_notifications", {});
      raw = typeof result === "string" ? result : result.content;
    } catch (err) {
      log.error("Failed to call list_notifications", { error: String(err) });
      return;
    }

    // The MCP tool returns a text/JSON representation of notifications.
    // An empty list (or a message indicating none) means no work.
    if (!hasUnreadNotifications(raw)) {
      log.debug("No unread Forgejo notifications");
      return;
    }

    log.info("Unread Forgejo notifications detected, activating agent");

    // ── Layer 2: create a fresh Agent to handle the work ───────────
    const [identity, skills] = await Promise.all([
      readIdentity(dataDir),
      readSkills(dataDir),
    ]);

    const toolConfig = withSkillTool({
      skills,
      tools: mcp.tools,
      toolExecutor: mcp.call.bind(mcp),
    });

    const agent = new Agent({
      client,
      model: config.model,
      systemPrompt: buildSystemPrompt({ identity, skills }),
      ...(toolConfig.tools?.length ? toolConfig : {}),
    });

    // Activate with the forgejo skill route injected
    const forgejoSkill = skills.find((s) => s.name === "forgejo");
    const turnMessages = forgejoSkill
      ? buildSkillRouteMessages([forgejoSkill])
      : [];

    const response = await agent.run(ACTIVATION_PROMPT, undefined, {
      turnMessages,
    });

    log.info("Agent completed Forgejo task", {
      responseLength: response.length,
    });
    log.debug("Agent response", { response });
  } catch (err) {
    log.error("Forgejo poll failed", { error: String(err) });
  } finally {
    isProcessing = false;
    await mcp.disconnect().catch((err: unknown) => {
      log.warn("MCP disconnect error", { error: String(err) });
    });
  }
}

/**
 * Determine whether the `list_notifications` response contains
 * unread notifications. The MCP tool may return a JSON array or a
 * human-readable message — handle both.
 */
function hasUnreadNotifications(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[]") return false;

  // Try to parse as JSON array
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length === 0) return false;
    if (Array.isArray(parsed) && parsed.length > 0) return true;
  } catch {
    // Not JSON — fall through to heuristic
  }

  // Heuristic: if the response contains "no notification" or similar
  const lower = trimmed.toLowerCase();
  if (lower.includes("no notification") || lower.includes("no unread")) {
    return false;
  }

  // If we got a non-empty response that isn't "no notifications", assume work exists
  return true;
}
