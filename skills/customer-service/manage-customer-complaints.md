---
title: "Customer Complaint Management"
developer_name: "manage_customer_complaints"
category: "Customer Service"
last_updated: "2026-06-18T09:45:01.000+0000"
---

# Customer Complaint Management

## Prompt

Objective: Resolve unanswered customer complaints quickly and consistently.

Scope: Process all customer complaints open for more than 48 hours without a reply.

Instructions:

1. Retrieve all matching complaints.
2. For each complaint, review complaint details, customer history, and contract context.
3. Draft an empathetic and professional response including either a proposed solution or a clear action plan.
4. Mark cases that require escalation and state the reason explicitly.
5. Send responses immediately using the CRM Assistant sub-agent (no approval required).
6. Create high-priority follow-up tasks for complex cases.
7. Produce a manager report with: processed complaints, escalated complaints, and required interventions.

Output format:

- Complaints processed
- Complaints escalated (with reason)
- Follow-up tasks created
- Manager action items

## Expected Result

Customers receive empathetic responses, escalation cases are clearly flagged, follow-up tasks are created for complex issues, and a concise summary report is delivered.

## Note

This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
