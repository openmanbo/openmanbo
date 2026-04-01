---
name: forgejo
description: "Use when interacting with Forgejo in any way: triaging notifications, discovering new issues, responding to @ mentions, checking PR status, exploring repositories, or performing any Git-forge workflow on Forgejo. This is the base skill — load specialized sub-skills (forgejo-coder, forgejo-reviewer, forgejo-pm) when the task requires implementation, code review, or issue decomposition."
---

# Forgejo Skill

## Purpose

This skill gives the agent full situational awareness of Forgejo-hosted projects. It handles **exploration, triage, communication, and coordination** — everything the agent needs to understand what is happening on Forgejo and decide what to do next.

For **implementation** (coding, committing, opening PRs, addressing review feedback), load the `forgejo-coder` sub-skill.
For **code review** (reading diffs, leaving structured reviews, approving/requesting changes), load the `forgejo-reviewer` sub-skill.
For **issue decomposition & delegation** (breaking complex issues into sub-tasks, assigning to agents, tracking progress), load the `forgejo-pm` sub-skill.

Typical entry points:

- "Check what's new on Forgejo" / "do I have anything to work on?"
- A notification arrives (@ mention, review request, issue assignment).
- The agent is running on a schedule and needs to poll for work.
- Any question about Forgejo issues, PRs, repos, or users.

## Quick Reference

For detailed reference on Forgejo MCP tools, conventions, Git authentication, blocker reporting, task memory, guardrails, and sub-skill conventions, use the **`ask`** tool with topic `forgejo`.

Before acting in a repository, read the workspace root `Agents.md` if it exists. Treat it as the durable project context file for repository purpose, structure, commands, and long-lived conventions.

## Core Conventions

1. **Language Matching**: Always reply in the same language as the person you are communicating with.
2. **Self-Assignment**: When picking up an unassigned issue, self-assign via `edit_issue` before starting.
3. **Truth over Memory**: Rely on Forgejo API data rather than internal memory.
4. **Sub-skill Handoff**: Use `forgejo-coder` for implementation, `forgejo-reviewer` for review, `forgejo-pm` for decomposition.
5. **Blocker Reporting**: Always report failures via `create_comment` — silent failures are never acceptable.
6. **Task Memory**: Use memory MCP / filesystem MCP to persist task state across runs.
7. **Project Context File**: Use the workspace root `Agents.md` to store stable, verified project facts. Create or update it when you confirm durable repository context that future runs should reuse.

## Guardrails

- Always call `get_user` at the start to confirm identity.
- Do not merge `WIP:` PRs.
- Do not force-push or rewrite shared branch history.
- Do not attempt implementation within this base skill — load the appropriate sub-skill.
- Do not write speculative, temporary, or issue-specific status into `Agents.md`.
