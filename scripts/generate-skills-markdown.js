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

function deleteIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

function escapeYaml(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function getExpectedResult(skill) {
  return (
    skill["Expected_ Result"] ||
    skill.Expected_Result ||
    skill.Expected_Result__c ||
    "_No expected result provided._"
  );
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
  const category = skill.Category || "Uncategorized";
  const content = skill.Content || "_No prompt content provided._";
  const expectedResult = getExpectedResult(skill);
  const skillName =
    slugify(skill["Developer Name"] || skill.Label || "unknown-skill").slice(
      0,
      64
    ) || "unknown-skill";
  const description =
    expectedResult ||
    `Skill for ${label}. Use when the user asks for ${label.toLowerCase()}.`;

  return `---
name: ${skillName}
description: "${escapeYaml(description.replace(/\r?\n/g, " ").trim())}"
disable-model-invocation: true
---

# ${label}

## Instructions

${content}
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
The skills under \`/skills\` are generated from your \`skills.json\`.  
Each generated skill follows Cursor skill format: \`<skill-folder>/SKILL.md\`.
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
      lines.push(
        `| [${item.label}](${item.relativePath}) | ${item.expectedResult} |`
      );
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

    const legacySkillFilePath = path.join(categoryDir, `${skillSlug}.md`);
    deleteIfExists(legacySkillFilePath);

    const skillDir = path.join(categoryDir, skillSlug);
    ensureDir(skillDir);
    const skillFileName = "SKILL.md";
    const skillFilePath = path.join(skillDir, skillFileName);
    writeFile(skillFilePath, buildSkillMarkdown(skill));

    if (!indexData[category]) {
      indexData[category] = [];
    }
    indexData[category].push({
      label: skill.Label || titleFromSlug(skillSlug),
      relativePath: `./${categorySlug}/${skillSlug}/${skillFileName}`,
      expectedResult: (getExpectedResult(skill) || "No expected result provided.")
        .replace(/\r?\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim()
    });
  }

  for (const category of Object.keys(indexData)) {
    indexData[category].sort((a, b) => a.label.localeCompare(b.label));
  }

  writeFile(path.join(outputRoot, "index.md"), buildIndexMarkdown(indexData));
  writeFile(
    path.join(outputRoot, "prompting-readme.md"),
    buildPromptingReadme()
  );

  const fileCount = Object.values(indexData).reduce(
    (acc, list) => acc + list.length,
    0
  );
  const categoryCount = Object.keys(indexData).length;
  console.log(
    `Generated ${fileCount} skill files in ${categoryCount} categories.`
  );
  console.log(`Created: ${path.join(outputRoot, "index.md")}`);
  console.log(`Created: ${path.join(outputRoot, "prompting-readme.md")}`);
}

main();
