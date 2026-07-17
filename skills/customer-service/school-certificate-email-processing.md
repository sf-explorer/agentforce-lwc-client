---
title: "School Insurance Certificate Email Processing"
developer_name: "school_certificate_email_processing"
category: "Customer Service"
last_updated: "2026-07-07T10:30:01.000+0000"
---

# School Insurance Certificate Email Processing

## Prompt

Objective: Handle school insurance certificate requests received by email in the last 7 days.

Instructions:

1. Retrieve relevant email requests from the last week.
2. For each contact, draft a confirmation response stating the request is being handled.
3. Use CRM Assistant sub-agent and ask for approval before sending each email.
4. Verify send status and report any delivery failure immediately.
5. Create a high-priority reminder task due tomorrow to send the actual certificate.

Output format:

- Requests processed
- Emails drafted/sent
- Failed sends (if any)
- Reminder tasks created

## Expected Result

Customer acknowledgment emails are handled with approval control, send failures are flagged, and high-priority next-day reminder tasks are created.

## Note

This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
