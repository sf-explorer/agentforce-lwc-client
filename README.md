# Agentforce Chat LWC (Salesforce DX)

This project contains a reusable Lightning Web Component (`c-agentforce-chat`) and Apex facade (`AgentforceService`) for embedding an Agentforce chat experience anywhere in Lightning Experience.

![LWC Client](./lwc-client.png)

The UI is decoupled from direct REST calls. The component calls Apex, and Apex invokes Agentforce through `Invocable.Action.createCustomAction(...)`.

## Implemented Features

- Reusable chat UI with conversation history and loading state.
- Suggested prompts, retry, copy assistant message, and auto-scroll.
- Session persistence for uncontrolled mode (`sessionStorage`).
- Public API methods: `sendMessage`, `clearConversation`, `focusInput`, `setSession`, `addSystemMessage`.
- Events: `message`, `response`, `error`, `sessionchange`.
- Markdown rendering with improved Salesforce record link UX.
- Apex response normalization and user-safe error mapping.

## Supported Features

The current component implementation supports:

- **Agent invocation via Apex facade**
  - No direct LWC REST callouts to Agentforce.
  - Invokes Agentforce using `Invocable.Action.createCustomAction(...)`.

- **Conversation UX**
  - Send message with keyboard shortcut (`Enter`) and send button.
  - Loading/typing indicator while waiting for response.
  - Assistant message copy action.
  - Retry last failed message.
  - Auto-scroll behavior for active conversation flow.

- **History and session handling (browser-backed)**
  - Session persistence for uncontrolled mode.
  - Multiple browser-stored conversations per `agentApiName`.
  - New chat creation.
  - Conversation switcher (reopen previous messages).
  - Delete conversation history entry.

- **Prompt and context support**
  - `suggestions` array input.
  - `samplePrompts` string input (newline/semicolon/pipe parsing).
  - Record page context support via `recordId`.

- **Rendering**
  - Plain text mode using `lightning-formatted-text` with `linkify`.
  - Markdown mode rendering for common formatting (`**bold**`, `*italic*`, inline code, links, lists).
  - Salesforce record-link friendly rendering in markdown mode.
  - Citation list rendering when citations are present.

- **Public API and events**
  - Methods: `sendMessage`, `clearConversation`, `focusInput`, `setSession`, `addSystemMessage`.
  - Events: `message`, `response`, `error`, `sessionchange`.

## Key Metadata

- LWC bundle: `force-app/main/default/lwc/agentforceChat`
- Apex service: `force-app/main/default/classes/AgentforceService.cls`
- Apex test: `force-app/main/default/classes/AgentforceServiceTest.cls`
- LWC Jest test: `force-app/main/default/lwc/agentforceChat/__tests__/agentforceChat.test.js`

## Current Agentforce Invocation Shape

In `AgentforceService`, the invocable call uses:

```apex
Invocable.Action action = Invocable.Action.createCustomAction(
    ACTION_TYPE,
    null,
    agentApiName,
    '1.1.0'
);
```

Current constants:

- `ACTION_TYPE = 'generateAiAgentResponse'`
- `ACTION_NAME = 'generateAiAgentResponse'` (kept in class for compatibility/readability)

## Output Parsing Notes

Agentforce output in this org can arrive as:

- `response` (plain text), or
- `agentResponse` (JSON string), where text is at `value.message`.

`AgentforceService` handles both formats.

## Local Development

Install dependencies:

```bash
npm install
```

Lint LWC:

```bash
npx eslint "force-app/main/default/lwc/**/*.js"
```

Run Jest:

```bash
npm run test:unit
```

Run Apex test in org:

```bash
sf apex run test --target-org "<org-username-or-alias>" --tests "AgentforceServiceTest" --result-format json --code-coverage --wait 30
```

## Deploy

Use this sequence for predictable deployments.

### 1) Authenticate and select target org

```bash
sf org login web --alias "<org-alias>"
sf org display --target-org "<org-alias>"
```

### 2) (Recommended) Validate before deploy

```bash
sf project deploy start \
  --dry-run \
  --target-org "<org-alias>" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls-meta.xml" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls-meta.xml" \
  --source-dir "force-app/main/default/lwc/agentforceChat" \
  --wait 30 \
  --json
```

### 3) Deploy Apex service + tests

```bash
sf project deploy start \
  --target-org "<org-alias>" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls-meta.xml" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls-meta.xml" \
  --wait 30 \
  --json
```

### 4) Deploy LWC bundle

```bash
sf project deploy start \
  --target-org "<org-alias>" \
  --source-dir "force-app/main/default/lwc/agentforceChat" \
  --wait 30 \
  --json
```

### 5) Run Apex test

```bash
sf apex run test \
  --target-org "<org-alias>" \
  --tests "AgentforceServiceTest" \
  --result-format json \
  --code-coverage \
  --wait 30
```

### 6) Add component to a Lightning page

1. Open the org: `sf org open --target-org "<org-alias>"`
2. Go to **Lightning App Builder**.
3. Add **Agentforce Chat** (`c-agentforce-chat`) to a page.
4. Configure at minimum:
   - `agentApiName` (for example `CRM_Assistant`)
   - optional `samplePrompts`
   - optional `showHeader`, `showAvatar`, `maxHistory`

### One-command deploy (quick path)

If you don't need separate steps:

```bash
sf project deploy start \
  --target-org "<org-alias>" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls" \
  --source-dir "force-app/main/default/classes/AgentforceService.cls-meta.xml" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls" \
  --source-dir "force-app/main/default/classes/AgentforceServiceTest.cls-meta.xml" \
  --source-dir "force-app/main/default/lwc/agentforceChat" \
  --wait 30 \
  --json
```

## Anonymous Verification Scripts

These helper scripts are included under `scripts/`:

- `verifyAgentforceService.apex`
- `verifyAgentforceInvoker.apex`
- `inspectInvocableResult.apex`

Example:

```bash
sf apex run --target-org "<org-username-or-alias>" --file "scripts/verifyAgentforceService.apex" --json
```

## Contributing

Contributions are very welcome. If you want to improve the component, please open a pull request with:

- a short description of the problem and approach,
- tests for behavior changes (Jest and/or Apex as applicable),
- and deployment notes when metadata shape changes.

Suggested workflow:

1. Create a feature branch.
2. Implement changes in small, reviewable commits.
3. Run lint and tests locally.
4. Open a PR with screenshots or short notes for UI changes.

If you have ideas but not a full implementation, opening an issue with repro steps is also appreciated.

## License

This project is licensed under the MIT License. See `LICENSE` for details.

