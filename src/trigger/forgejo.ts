import type { AppConfig } from "../config/env.js";
import {
  Agent,
  createLLMClient,
  buildSystemPrompt,
  withSkillTool,
  buildSkillRouteMessages,
} from "../kernel/index.js";
import { McpManager } from "../mcp/index.js";
import {
  resolveDataDir,
  readIdentity,
  readMcpConfig,
  readSkills,
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

You are running in **autonomous mode** — there is no human in the loop. \
You must make all decisions independently and execute every task to completion. \
NEVER ask clarifying questions. NEVER ask for permission. NEVER present a summary and wait. NEVER say "should I" or "let me know". \
If something is ambiguous, use your best judgment and proceed. \
When a notification requires action (implementation, response, review), DO IT immediately — do not describe what you would do.

Instructions:
1. Use sequential-thinking (sequentialthinking tool) to plan your approach before taking action.
2. Follow the **forgejo** skill — start with **Scenario A: Triage Notifications** as defined in the skill.
   - Call get_user to confirm identity.
   - Call list_notifications to fetch unread notifications.
   - Classify, prioritize, and route each actionable notification per the skill's decision routing.
3. For each actionable notification, **immediately execute** the appropriate scenario or sub-skill:
   - Issue assigned to you → load forgejo-coder and implement it.
   - @ mention requesting action → respond via create_comment, then implement if needed.
   - Review request / review comment → load forgejo-coder to address feedback.
   - Informational (merged/closed) → mark as read and move on.
4. **Hard rules — never violate these:**
   - NEVER close an issue — issues are closed by PR merge or by a human.
   - NEVER push to existing branches (main, master, develop, etc.). Always create a new feature branch.
   - ALWAYS submit work as a Pull Request via create_pull_request.
5. After processing each notification, call mark_notification_read to mark it as read. \
When all notifications are handled, you may call mark_all_notifications_read instead.
6. Process **all** actionable notifications in this session — do not stop after the first one.

Do not skip the sequential-thinking step. Do not skip reading the forgejo skill instructions.\
`;

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
    const mcpConfig = await readMcpConfig(dataDir);

    if (!mcpConfig) {
      log.warn("No MCP config found, skipping Forgejo poll");
      return;
    }

    await mcp.connect(mcpConfig);

    let raw: string;
    try {
      raw = await mcp.call("list_notifications", {});
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

    const client = createLLMClient(config);
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
