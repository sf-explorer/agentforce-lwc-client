#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const inputPath = path.join(projectRoot, "skills.json");
const outputRoot = path.join(projectRoot, "skills");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function loadSkills(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("skills.json must contain an array.");
  }
  return parsed;
}

function buildSkillMarkdown(skill) {
  const label = skill.Label || "Untitled Skill";
  const developerName = skill["Developer Name"] || "unknown_skill";
  const category = skill.Category || "Uncategorized";
  const updatedAt = skill["System Modstamp"] || "Unknown";
  const content = skill.Content || "_No prompt content provided._";
  const expectedResult = skill["Expected_ Result"] || "_No expected result provided._";

  return `---
title: "${label.replace(/"/g, '\\"')}"
developer_name: "${developerName.replace(/"/g, '\\"')}"
category: "${category.replace(/"/g, '\\"')}"
last_updated: "${updatedAt.replace(/"/g, '\\"')}"
---

# ${label}

## Prompt
${content}

## Expected Result
${expectedResult}

## Note
This skill prompt is an example. Adapt wording, guardrails, and output schema to your context before production use.
`;
}

function buildPromptingReadme() {
  return `# Prompting Guide (Examples Included)

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
\`\`\`text
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
\`\`\`

## Important note about these files
The prompts under \`/skills\` are examples generated from your \`skills.json\`.  
They are intentionally explicit to promote consistent results and easier review.
`;
}

function buildIndexMarkdown(indexData) {
  const lines = [];
  lines.push("# Skills Index", "");
  lines.push("Generated from `skills.json`.", "");
  lines.push("## Categories", "");

  for (const category of Object.keys(indexData).sort()) {
    lines.push(`### ${category}`, "");
    lines.push("| Skill | What to expect |");
    lines.push("| --- | --- |");
    for (const item of indexData[category]) {
      lines.push(`| [${item.label}](${item.relativePath}) | ${item.expectedResult} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function main() {
  const skills = loadSkills(inputPath);
  ensureDir(outputRoot);

  const indexData = {};

  for (const skill of skills) {
    const category = skill.Category || "Uncategorized";
    const categorySlug = slugify(category) || "uncategorized";

    const preferredName = skill["Developer Name"] || skill.Label || "skill";
    const skillSlug = slugify(preferredName) || "skill";

    const categoryDir = path.join(outputRoot, categorySlug);
    ensureDir(categoryDir);

    const skillFileName = `${skillSlug}.md`;
    const skillFilePath = path.join(categoryDir, skillFileName);
    writeFile(skillFilePath, buildSkillMarkdown(skill));

    if (!indexData[category]) {
      indexData[category] = [];
    }
    indexData[category].push({
      label: skill.Label || titleFromSlug(skillSlug),
      relativePath: `./${categorySlug}/${skillFileName}`,
      expectedResult: (skill["Expected_ Result"] || "No expected result provided.")
        .replace(/\r?\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim(),
    });
  }

  for (const category of Object.keys(indexData)) {
    indexData[category].sort((a, b) => a.label.localeCompare(b.label));
  }

  writeFile(path.join(outputRoot, "index.md"), buildIndexMarkdown(indexData));
  writeFile(path.join(outputRoot, "prompting-readme.md"), buildPromptingReadme());

  const fileCount = Object.values(indexData).reduce((acc, list) => acc + list.length, 0);
  const categoryCount = Object.keys(indexData).length;
  console.log(`Generated ${fileCount} skill markdown files in ${categoryCount} categories.`);
  console.log(`Created: ${path.join(outputRoot, "index.md")}`);
  console.log(`Created: ${path.join(outputRoot, "prompting-readme.md")}`);
}

main();
