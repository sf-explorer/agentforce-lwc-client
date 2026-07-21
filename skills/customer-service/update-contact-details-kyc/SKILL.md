---
name: update-contact-details-kyc
description: "Automated contact-update emails are sent, portal links are included when available, and 10-day follow-up call tasks are created to improve CRM data quality."
disable-model-invocation: true
---

# KYC Contact Details Verification

## Instructions

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
