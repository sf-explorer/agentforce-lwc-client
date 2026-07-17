# Prompting Guide (Examples Included)

This repository contains skill prompts as practical examples.  
Use them as starting points, not final one-size-fits-all templates.

## What makes a good prompt

A good prompt is:

- **Clear:** states the exact objective and scope.
- **Actionable:** gives ordered steps that remove ambiguity.
- **Constrained:** includes hard rules (what to do and what not to do).
- **Structured:** defines the expected output format.
- **Context-aware:** references the right data sources and time window.
- **Verifiable:** makes success easy to check.

## Recommended prompt structure

Use this structure for reliable execution:

1. **Objective** - one sentence describing the desired outcome.
2. **Scope** - records, date range, audience, or system boundaries.
3. **Instructions** - numbered steps in execution order.
4. **Constraints** - approvals, exclusions, stop conditions, thresholds.
5. **Output format** - exact sections, fields, and sorting rules.
6. **Expected result** - concise success criteria.

## Example pattern

```text
Objective: [What should be achieved]
Scope: [Which records/time range/systems are in scope]

Instructions:
1) [Action 1]
2) [Action 2]
3) [Action 3]

Constraints:
- [Required guardrail]
- [What must not happen]

Output format:
- [Section or field 1]
- [Section or field 2]

Expected result:
[What success looks like]
```

## Important note about these files

The prompts under `/skills` are examples generated from your `skills.json`.  
They are intentionally explicit to promote consistent results and easier review.
