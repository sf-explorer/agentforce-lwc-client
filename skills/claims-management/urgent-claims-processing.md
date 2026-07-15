---
title: "Urgent Claims Processing"
developer_name: "urgent_claims_processing"
category: "Claims Management"
last_updated: "2026-06-29T10:07:45.000+0000"
---

# Urgent Claims Processing

## Prompt
Objective: Triage and coordinate urgent claims reported in the last 24 hours.

Scope: Claims with high priority only.

Instructions:
1) Retrieve urgent claims from the last 24 hours.
2) For each claim, review status and submitted documents.
3) Determine whether an expert appointment is required and justify the decision.
4) Produce a short case summary with next recommended actions.
5) Send an internal synthesis email after user approval (analysis does not require approval).

Output format:
- Urgent claims list
- Expert required: yes/no + reason
- Recommended next actions
- Pending approval for synthesis email

## Expected Result
Urgent claims are analyzed with clear expert recommendations and action plans, and a synthesis email is prepared for approval before sending.

## Note
This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
