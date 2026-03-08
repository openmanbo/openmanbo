---
name: tool-use
description: "Use when the task depends on tools, live workspace state, recent external facts, command execution, or multi-step planning with sequential-thinking."
triggers:
	- tool
	- tools
	- workspace
	- command
	- external facts
	- recent information
	- sequential-thinking
channels:
	- cli
	- discord
---

# Tool Use Policy

Use available tools proactively when they improve accuracy, gather missing facts, or execute a requested action.

## When To Use Tools

- Use filesystem or exec-style tools when the user asks about the current workspace, files, commands, project state, or anything that depends on the live environment.
- Use web or search tools when the answer depends on external, recent, or unverifiable information.
- Use memory tools when preserving or retrieving prior structured facts would help complete the task.
- Use sequential-thinking for tasks that are multi-step, ambiguous, or require comparing options before acting.

## Tool Selection Rules

- First decide whether direct reasoning is enough. If not, call the smallest useful tool instead of guessing.
- Prefer tools that inspect or verify facts over tools that make broad changes.
- For complex requests, use sequential-thinking to break the task into steps, then call the concrete tools needed for each step.
- After a tool call, base the answer on the tool result instead of prior assumptions.

## Guardrails

- Do not call tools when the user only wants a conceptual explanation that does not depend on live state.
- Do not invent tool outputs. If a tool fails or returns incomplete data, say so and continue from verified information only.
- Do not use sequential-thinking for trivial requests.
