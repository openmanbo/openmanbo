---
name: planning
description: "Use when the request needs step-by-step analysis, task decomposition, tradeoff comparison, or explicit planning before acting. Prefer sequential-thinking for multi-step or ambiguous work."
triggers:
  - plan
  - planning
  - steps
  - step by step
  - analyze first
  - break down
  - tradeoff
  - compare options
channels:
  - cli
  - discord
---

# Planning Workflow

Use this skill when the request is multi-step, ambiguous, or benefits from a clear plan before execution.

## Planning Rules

- Start by identifying the goal, constraints, and missing information.
- If the task is complex or ambiguous, use sequential-thinking to break the work into explicit steps.
- Prefer short, actionable plans over abstract summaries.
- After planning, continue with the concrete tools or reasoning needed to complete the task.

## Guardrails

- Do not use sequential-thinking for trivial requests.
- Do not stop at planning if the user expects execution.
- Revise the plan when new tool output changes the situation.
