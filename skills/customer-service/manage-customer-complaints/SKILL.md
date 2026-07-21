---
name: manage-customer-complaints
description: "Customers receive empathetic responses, escalation cases are clearly flagged, follow-up tasks are created for complex issues, and a concise summary report is delivered."
disable-model-invocation: true
---

# Customer Complaint Management

## Instructions

Objective: Resolve unanswered customer complaints quickly and consistently.

Scope: Process all customer complaints open for more than 48 hours without a reply.

Instructions:
1) Retrieve all matching complaints.
2) For each complaint, review complaint details, customer history, and contract context.
3) Draft an empathetic and professional response including either a proposed solution or a clear action plan.
4) Mark cases that require escalation and state the reason explicitly.
5) Send responses immediately using the CRM Assistant sub-agent (no approval required).
6) Create high-priority follow-up tasks for complex cases.
7) Produce a manager report with: processed complaints, escalated complaints, and required interventions.

Output format:
- Complaints processed
- Complaints escalated (with reason)
- Follow-up tasks created
- Manager action items
