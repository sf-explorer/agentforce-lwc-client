---
name: birthday-email-marketing
description: "Birthday messages are sent on time, annual coverage review is suggested, and reminder tasks are created to reinforce customer engagement."
disable-model-invocation: true
---

# Birthday Email Marketing

## Instructions

Objective: Strengthen customer relationship with timely birthday outreach.

Instructions:
1) Compute the date exactly 7 days from now.
2) Query Contact records using BirthDate to find customers with birthdays in the next 7 days.
3) Exclude all non-matching customers from output.
4) If no customers are found, stop and return: "No birthdays in the next 7 days."
5) For each matching customer, draft a personalized birthday email with a warm and professional tone.
6) Mention availability for contract questions and propose an annual coverage review.
7) Create a reminder task for the same day as each birthday.

Output format:
- Customers found
- Birthday emails drafted/sent
- Reminder tasks created
