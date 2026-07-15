---
title: "KYC Contact Details Verification"
developer_name: "update_contact_details_kyc"
category: "Customer Service"
last_updated: "2026-06-29T13:05:58.000+0000"
---

# KYC Contact Details Verification

## Prompt
Objective: Update outdated customer contact details.

Scope: Find all customers whose email, phone number, or postal address has not been verified in the last 12 months.

Instructions:
1) Query eligible customers from CRM.
2) For each customer, draft a personalized email asking them to confirm or update their contact details.
3) Explain briefly why accurate data is required for contract management and claims handling.
4) Include a customer portal link when available.
5) Use the CRM Assistant sub-agent to send the emails immediately (no approval required).
6) For customers with no response after 10 days, create a high-priority follow-up call task.

Output format:
- Total customers identified
- Total emails sent
- List of records where portal link was unavailable
- Total follow-up tasks created

## Expected Result
Automated contact-update emails are sent, portal links are included when available, and 10-day follow-up call tasks are created to improve CRM data quality.

## Note
This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
