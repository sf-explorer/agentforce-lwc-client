---
title: "Prepare My Next Meeting"
developer_name: "prepare_next_meeting"
category: "Sales Management"
last_updated: "2026-06-29T14:23:18.000+0000"
---

# Prepare My Next Meeting

## Prompt

Objective: Prepare a high-impact briefing for an upcoming meeting.

Scope: Find upcoming meetings for today or tomorrow morning, then ask the user to choose one meeting to prepare. Use the magic argu sub-agent for analysis.

Instructions:

1. List candidate meetings with date/time, account/contact, and context.
2. Ask the user to select one meeting.
3. Analyze the selected meeting using magic argu.
4. Return exactly the following 3 tables.

TABLE 1 - PROFILE & KPI SUMMARY
Columns: [Indicator] | [Value / Score] | [Comment]
Rows:

- Profile: Name, age, role, company size
- Loyalty: Score out of 10, tenure (e.g., customer since YYYY)
- Value: Total annual premium, number of active contracts
- Churn Risk: LOW / MEDIUM / HIGH and detected signal
- Satisfaction: Score out of 5 and latest notable event

TABLE 2 - CONTRACT PORTFOLIO
Columns: [Product] | [Annual Premium] | [Renewal Date] | [Status]
Rules:

- Status must be only "✅ ACTIVE" or "🔴 NOT A CUSTOMER"
- Use "—" when data is unavailable

TABLE 3 - RELATIONSHIP HISTORY
Columns: [Month] | [Event] | [Details & Impact]
Include key recent interactions and business impact.

Final section: 3 cross-sell arguments + 1 best closing opportunity.

## Expected Result

The user selects one upcoming meeting and receives a structured 3-table briefing plus targeted cross-sell arguments and a closing opportunity.

## Note

This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
