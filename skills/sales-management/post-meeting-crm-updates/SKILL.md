---
name: post-meeting-crm-updates
description: "A selected meeting is summarized into concrete CRM updates and tasks, with explicit user approval before task creation."
disable-model-invocation: true
---

# Post-Meeting CRM Updates and Actions

## Instructions

Objective: Turn recent meetings into actionable CRM updates and tasks.

Instructions:
1) List the last 3 meetings (events) from today.
2) Ask the user to choose one meeting.
3) Analyze meeting content and generate:
- A concise meeting summary
- Required CRM updates
- Tasks to create
4) Ask for user approval before creating tasks.
5) If approved, create tasks using CRM Assistant sub-agent.

Output format:
- Selected meeting
- Summary
- CRM updates required
- Proposed tasks
- Task creation status
