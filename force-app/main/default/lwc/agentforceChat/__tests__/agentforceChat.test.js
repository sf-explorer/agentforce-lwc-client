import { createElement } from "lwc";
import AgentforceChat from "c/agentforceChat";
import sendAgentMessage from "@salesforce/apex/AgentforceService.sendMessage";
import getConfiguredAgents from "@salesforce/apex/AgentforceService.getConfiguredAgents";
import getCoworkerSkills from "@salesforce/apex/CoworkerSkillsController.getSkills";

jest.mock(
  "@salesforce/apex/AgentforceService.sendMessage",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/AgentforceService.getConfiguredAgents",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/CoworkerSkillsController.getSkills",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

const flushPromises = () => Promise.resolve();
// The initial message goes through Promise.all and several awaits, so a single
// microtask tick is not enough. A macrotask lets every pending promise settle.
const flushAll = () => new Promise((resolve) => setTimeout(resolve, 0));

function createComponent(props = {}) {
  const element = createElement("c-agentforce-chat", {
    is: AgentforceChat
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

describe("c-agentforce-chat", () => {
  beforeEach(() => {
    getCoworkerSkills.mockResolvedValue([]);
    getConfiguredAgents.mockResolvedValue([]);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("renders seededMessages even when stale localStorage history exists", async () => {
    // Simulate leftover history for this agent from a previous session.
    window.localStorage.setItem(
      "agentforce-chat-history:Support_Agent:index",
      JSON.stringify([
        {
          id: "c1",
          title: "Old",
          updatedAt: "2020-01-01T00:00:00.000Z",
          sessionId: null
        }
      ])
    );
    window.localStorage.setItem(
      "agentforce-chat-history:Support_Agent:active",
      "c1"
    );
    window.localStorage.setItem(
      "agentforce-chat-history:Support_Agent:c1",
      JSON.stringify([{ id: "u0", role: "user", content: "stale question" }])
    );

    const element = createComponent({
      agentApiName: "Support_Agent",
      seededMessages: [
        { role: "user", content: "Seeded question" },
        { role: "assistant", content: "Seeded answer" }
      ]
    });

    await flushPromises();
    await flushPromises();

    const values = [
      ...element.shadowRoot.querySelectorAll("lightning-formatted-text")
    ].map((el) => el.value);
    expect(values).toContain("Seeded question");
    expect(values).toContain("Seeded answer");
    expect(values).not.toContain("stale question");
  });

  it("sends a message and renders assistant response", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Hello **world**"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    const messageHandler = jest.fn();
    let responsePayload;
    let sessionPayload;
    element.addEventListener("message", messageHandler);
    element.addEventListener("response", (event) => {
      responsePayload = event.detail;
    });
    element.addEventListener("sessionchange", (event) => {
      sessionPayload = event.detail;
    });

    element.sendMessage("Hi there");
    await flushPromises();
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
      agentApiName: "Support_Agent",
      message: "Hi there"
    });
    expect(messageHandler).toHaveBeenCalled();
    expect(responsePayload).toBeDefined();
    expect(responsePayload.sessionId).toBe("session-1");
    expect(responsePayload.message.content).toBe("Hello **world**");
    expect(sessionPayload.sessionId).toBe("session-1");
  });

  it("emits error event and keeps retry message", async () => {
    sendAgentMessage.mockRejectedValue({
      body: {
        message: "TIMEOUT: request timed out"
      }
    });

    const element = createComponent({
      agentApiName: "Support_Agent"
    });
    let errorPayload;
    element.addEventListener("error", (event) => {
      errorPayload = event.detail;
    });

    element.sendMessage("Will fail");
    await flushPromises();
    await flushPromises();

    expect(errorPayload).toBeDefined();
    expect(errorPayload.code).toBe("TIMEOUT");
    expect(errorPayload.retryable).toBe(true);
  });

  it("shows Accept/Decline for a ConfirmMessage and sends the encoded payload", async () => {
    sendAgentMessage
      .mockResolvedValueOnce({
        message: {
          id: "m-1",
          role: "assistant",
          content: "Proceed with the update?"
        },
        sessionId: "session-1",
        envelopeJson: JSON.stringify({
          feedbackId: "fb-123",
          value: {
            type: "ConfirmMessage",
            message: "Proceed with the update?",
            confirm: [{ id: "opt-1", label: "Proceed" }]
          }
        })
      })
      .mockResolvedValueOnce({
        message: { id: "m-2", role: "assistant", content: "Done" },
        sessionId: "session-1"
      });

    const element = createComponent({ agentApiName: "Support_Agent" });

    element.sendMessage("Update the record");
    await flushPromises();
    await flushPromises();

    const buttons = element.shadowRoot.querySelectorAll(
      ".agentforce-chat__confirm lightning-button"
    );
    expect(buttons.length).toBe(2);

    const accept = [...buttons].find((b) => b.dataset.decision === "accept");
    accept.click();
    await flushPromises();
    await flushPromises();

    // Second call carries the encoded ConfirmResponseMessage payload.
    const secondCall = sendAgentMessage.mock.calls[1][0];
    const payload = JSON.parse(secondCall.message);
    expect(payload.type).toBe("ConfirmResponseMessage");
    expect(payload.feedbackId).toBe("fb-123");
    expect(payload.isYes).toBe(true);
    expect(payload.confirm[0]).toMatchObject({ id: "opt-1", result: true });

    // Buttons disappear once answered.
    expect(
      element.shadowRoot.querySelectorAll(
        ".agentforce-chat__confirm lightning-button"
      ).length
    ).toBe(0);
  });

  it("hides suggestions after first interaction", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Done"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      suggestions: ["Summarize account"]
    });
    let suggestionButtons = element.shadowRoot.querySelectorAll(
      ".agentforce-chat__suggestion-list button"
    );
    expect(suggestionButtons.length).toBe(1);

    element.sendMessage("Hello");
    await flushPromises();
    await flushPromises();

    suggestionButtons = element.shadowRoot.querySelectorAll(
      ".agentforce-chat__suggestion-list button"
    );
    expect(suggestionButtons.length).toBe(0);
  });

  it("supports controlled session mode without internal mutation", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Continuing session"
      },
      sessionId: "session-from-server",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      mode: "controlled",
      sessionId: "session-parent"
    });

    element.sendMessage("Hello");
    await flushPromises();
    await flushPromises();

    expect(element.sessionId).toBe("session-parent");
  });

  it("adds record context to Apex payload when recordId is provided", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Context received"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      recordId: "001KB00000HaAggYAF"
    });

    element.sendMessage("Summarize this account");
    await flushPromises();
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
      agentApiName: "Support_Agent",
      message:
        "[Salesforce Context]\n" +
        "recordId=001KB00000HaAggYAF\n" +
        "[/Salesforce Context]\n\n" +
        "Summarize this account"
    });
  });

  it("handles /clear locally without calling Apex", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "First answer"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      welcomeMessage: "Welcome"
    });

    element.sendMessage("Hello");
    await flushPromises();
    await flushPromises();
    expect(sendAgentMessage).toHaveBeenCalledTimes(1);

    element.sendMessage("/clear");
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    const systemText = Array.from(
      element.shadowRoot.querySelectorAll(
        'article[data-role="system"] lightning-formatted-text'
      )
    ).map((node) => node.value);
    expect(systemText).toContain("Conversation cleared.");
    const renderedText = Array.from(
      element.shadowRoot.querySelectorAll("lightning-formatted-text")
    ).map((node) => node.value);
    expect(renderedText.includes("Hello")).toBe(false);
  });

  it("shows help text for /help command", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    element.sendMessage("/help");
    await flushPromises();

    expect(sendAgentMessage).not.toHaveBeenCalled();
    const systemText = Array.from(
      element.shadowRoot.querySelectorAll(
        'article[data-role="system"] lightning-formatted-text'
      )
    ).map((node) => node.value);
    expect(systemText).toContain("Type / for commands or @ for skills");
  });

  it("shows unknown command guidance locally", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    element.sendMessage("/nope");
    await flushPromises();

    expect(sendAgentMessage).not.toHaveBeenCalled();
    const systemText = Array.from(
      element.shadowRoot.querySelectorAll(
        'article[data-role="system"] lightning-formatted-text'
      )
    ).map((node) => node.value);
    expect(systemText).toContain("Unknown command: /nope. Try /help.");
  });

  it("renders composer command hint text", () => {
    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    const hint = element.shadowRoot.querySelector(
      ".agentforce-chat__command-hint"
    );
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain("Type / for commands");
    expect(hint.textContent).toContain("@ for skills");
  });

  it("shows session and context through slash commands", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent",
      recordId: "001KB00000HaAggYAF",
      mode: "controlled",
      sessionId: "session-parent"
    });

    element.sendMessage("/session");
    element.sendMessage("/context");
    await flushPromises();

    expect(sendAgentMessage).not.toHaveBeenCalled();
    const systemText = Array.from(
      element.shadowRoot.querySelectorAll(
        'article[data-role="system"] lightning-formatted-text'
      )
    ).map((node) => node.value);
    expect(systemText).toContain(
      "Session: session-parent | Agent: Support_Agent"
    );
    expect(systemText).toContain("Context recordId: 001KB00000HaAggYAF");
  });

  it("shows configured prompts using /prompts", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent",
      samplePrompts: "One; Two | Three"
    });

    element.sendMessage("/prompts");
    await flushPromises();

    expect(sendAgentMessage).not.toHaveBeenCalled();
    const systemText = Array.from(
      element.shadowRoot.querySelectorAll(
        'article[data-role="system"] lightning-formatted-text'
      )
    ).map((node) => node.value);
    expect(systemText).toContain("Prompts: One | Two | Three");
  });

  it("shows command autocomplete when typing slash", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    const input = element.shadowRoot.querySelector("lightning-textarea");
    input.value = "/se";
    input.dispatchEvent(new CustomEvent("input"));
    await flushPromises();

    const items = element.shadowRoot.querySelectorAll(
      ".agentforce-chat__command-item"
    );
    expect(items.length).toBeGreaterThan(0);
    expect(
      Array.from(items).some((item) => item.dataset.command === "/session")
    ).toBe(true);
  });

  it("applies autocomplete suggestion when clicked", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent"
    });

    const input = element.shadowRoot.querySelector("lightning-textarea");
    input.value = "/se";
    input.dispatchEvent(new CustomEvent("input"));
    await flushPromises();

    const sessionItem = Array.from(
      element.shadowRoot.querySelectorAll(".agentforce-chat__command-item")
    ).find((item) => item.dataset.command === "/session");
    sessionItem.click();
    await flushPromises();

    const textarea = element.shadowRoot.querySelector("lightning-textarea");
    expect(textarea.value).toBe("/session");
  });

  it("shows skill autocomplete when typing @", async () => {
    getCoworkerSkills.mockResolvedValue([
      { MasterLabel: "pricing", Content__c: "Pricing details skill content" },
      { MasterLabel: "policy", Content__c: "Policy skill content" }
    ]);
    const element = createComponent({
      agentApiName: "Support_Agent"
    });
    await flushPromises();

    const input = element.shadowRoot.querySelector("lightning-textarea");
    input.value = "Use @pr";
    input.dispatchEvent(new CustomEvent("input"));
    await flushPromises();

    const items = element.shadowRoot.querySelectorAll(
      ".agentforce-chat__command-item"
    );
    expect(
      Array.from(items).some((item) => item.dataset.label === "pricing")
    ).toBe(true);
  });

  it("resolves @label to content__c before calling Apex", async () => {
    getCoworkerSkills.mockResolvedValue([
      { MasterLabel: "pricing", Content__c: "Use the premium pricing policy." }
    ]);
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Resolved"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent"
    });
    await flushPromises();

    element.sendMessage("Please apply @pricing");
    await flushPromises();
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
      message: "Please apply Use the premium pricing policy."
    });
    const userRichText = element.shadowRoot.querySelector(
      'article[data-role="user"] lightning-formatted-rich-text'
    );
    expect(userRichText).not.toBeNull();
    expect(userRichText.value).toContain("<strong>@pricing</strong>");
  });

  it("resolves multi-word skill labels and opens resolved prompt popup", async () => {
    getCoworkerSkills.mockResolvedValue([
      {
        MasterLabel: "Analyse mon portefeuille client",
        Content__c:
          "Analyse mon portefeuille clients pour identifier les opportunités."
      }
    ]);
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Done"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent"
    });
    await flushPromises();

    element.sendMessage("@Analyse mon portefeuille client");
    await flushPromises();
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
    expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
      message:
        "Analyse mon portefeuille clients pour identifier les opportunités."
    });

    const previewButton = element.shadowRoot.querySelector(
      ".agentforce-chat__resolved-status"
    );
    expect(previewButton).not.toBeNull();
    expect(previewButton.textContent).toContain("Resolved");
    expect(previewButton.title).toContain(
      "Analyse mon portefeuille clients pour identifier les opportunités."
    );
    previewButton.click();
    await flushPromises();

    const modalTitle = element.shadowRoot.querySelector(".slds-modal__title");
    expect(modalTitle).not.toBeNull();
    expect(modalTitle.textContent).toContain("Resolved prompt sent to agent");
    const resolvedText = element.shadowRoot.querySelector(
      ".slds-modal__content lightning-formatted-text"
    );
    expect(resolvedText.value).toContain(
      "Analyse mon portefeuille clients pour identifier les opportunités."
    );
  });

  it("uses custom markdown viewer when markdown is enabled", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "# Heading\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      markdownEnabled: true,
      markdownRenderer: "custom"
    });

    element.sendMessage("Render markdown");
    await flushPromises();
    await flushPromises();

    const markdownViewers = element.shadowRoot.querySelectorAll(
      'article[data-role="assistant"] c-markdown-viewer'
    );
    expect(markdownViewers.length).toBeGreaterThan(0);
    expect(markdownViewers[markdownViewers.length - 1].value).toContain(
      "# Heading"
    );
  });

  it("uses lightning-formatted-rich-text renderer when markdownRenderer is richText", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content: "Hello **world**"
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    });

    const element = createComponent({
      agentApiName: "Support_Agent",
      markdownEnabled: true,
      markdownRenderer: "richText"
    });

    element.sendMessage("Render markdown");
    await flushPromises();
    await flushPromises();

    const markdownViewer = element.shadowRoot.querySelector(
      'article[data-role="assistant"] c-markdown-viewer'
    );
    expect(markdownViewer).toBeNull();

    const assistantRichTexts = element.shadowRoot.querySelectorAll(
      'article[data-role="assistant"] lightning-formatted-rich-text'
    );
    expect(assistantRichTexts.length).toBeGreaterThan(0);
    expect(assistantRichTexts[assistantRichTexts.length - 1].value).toContain(
      "<strong>world</strong>"
    );
  });

  it("renders dedicated voice input component when enabled", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent",
      voiceInputEnabled: true
    });
    await flushPromises();

    const voiceInput = element.shadowRoot.querySelector("c-voice-input");
    expect(voiceInput).not.toBeNull();
    expect(voiceInput.language).toBe("en-US");
  });

  it("updates draft when voice transcript event is received", async () => {
    const element = createComponent({
      agentApiName: "Support_Agent",
      voiceInputEnabled: true
    });
    await flushPromises();

    const voiceInput = element.shadowRoot.querySelector("c-voice-input");
    voiceInput.dispatchEvent(
      new CustomEvent("transcript", { detail: { text: "dictated text" } })
    );
    await flushPromises();

    const textarea = element.shadowRoot.querySelector("lightning-textarea");
    expect(textarea.value).toBe("dictated text");
  });

  it("renders a dynamic widget payload returned by AgentforceService", async () => {
    sendAgentMessage.mockResolvedValue({
      message: {
        id: "m-2",
        role: "assistant",
        content:
          "Here is a structured summary of the Annie Dubois client account."
      },
      sessionId: "session-1",
      requestId: "req-1",
      citations: [],
      widgets: [
        {
          name: "account_summary",
          payloadJson: JSON.stringify({
            accountName: "Annie Dubois",
            nextSteps: [
              {
                label: "Prepare the next meeting",
                prompt: "Help me prepare the next meeting."
              }
            ]
          })
        }
      ],
      valueJson: JSON.stringify({
        result: [
          {
            value: {
              account_summary: {
                accountName: "Annie Dubois"
              }
            }
          }
        ]
      })
    });

    const element = createComponent({
      agentApiName: "SearchAgent"
    });
    let responsePayload;
    element.addEventListener("response", (event) => {
      responsePayload = event.detail;
    });

    element.sendMessage("Summarize Annie Dubois");
    await flushPromises();
    await flushPromises();

    expect(responsePayload.widgets[0].name).toBe("account_summary");
    const card = element.shadowRoot.querySelector("c-agent-widget-card");
    expect(card).not.toBeNull();
    expect(card.widgetName).toBe("account_summary");
    expect(card.payload.accountName).toBe("Annie Dubois");

    card.dispatchEvent(
      new CustomEvent("action", {
        detail: { prompt: "Help me prepare the next meeting." }
      })
    );
    await flushPromises();
    await flushPromises();

    expect(sendAgentMessage).toHaveBeenCalledTimes(2);
    expect(sendAgentMessage.mock.calls[1][0]).toMatchObject({
      message: "Help me prepare the next meeting."
    });
  });

  describe("initialMessage", () => {
    const okResponse = {
      message: { id: "m-2", role: "assistant", content: "Hi" },
      sessionId: "session-1",
      requestId: "req-1",
      citations: []
    };

    it("sends the trimmed initialMessage once for an empty conversation", async () => {
      sendAgentMessage.mockResolvedValue(okResponse);

      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "  Summarize this account  "
      });
      await flushAll();

      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
      expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
        agentApiName: "Support_Agent",
        message: "Summarize this account"
      });
    });

    it("resolves @skill mentions in the initialMessage", async () => {
      getCoworkerSkills.mockResolvedValue([
        {
          MasterLabel: "pricing",
          Content__c: "Use the premium pricing policy."
        }
      ]);
      sendAgentMessage.mockResolvedValue(okResponse);

      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "Please apply @pricing"
      });
      await flushAll();

      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
      expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
        message: "Please apply Use the premium pricing policy."
      });
    });

    it("does not send when initialMessage is blank", async () => {
      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "   "
      });
      await flushAll();

      expect(sendAgentMessage).not.toHaveBeenCalled();
    });

    it("does not send when the stored conversation already has a user message", async () => {
      window.localStorage.setItem(
        "agentforce-chat-history:Support_Agent:index",
        JSON.stringify([
          {
            id: "c1",
            title: "Earlier",
            updatedAt: "2020-01-01T00:00:00.000Z",
            sessionId: null
          }
        ])
      );
      window.localStorage.setItem(
        "agentforce-chat-history:Support_Agent:active",
        "c1"
      );
      window.localStorage.setItem(
        "agentforce-chat-history:Support_Agent:c1",
        JSON.stringify([
          { id: "u0", role: "user", content: "earlier question" }
        ])
      );

      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "Summarize this account"
      });
      await flushAll();

      expect(sendAgentMessage).not.toHaveBeenCalled();
    });

    it("does not send when seededMessages are provided", async () => {
      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "Summarize this account",
        seededMessages: [{ role: "assistant", content: "Seeded answer" }]
      });
      await flushAll();

      expect(sendAgentMessage).not.toHaveBeenCalled();
    });

    it("does not send when the component is disabled", async () => {
      createComponent({
        agentApiName: "Support_Agent",
        initialMessage: "Summarize this account",
        disabled: true
      });
      await flushAll();

      expect(sendAgentMessage).not.toHaveBeenCalled();
    });

    it("waits for the agent to be selected before sending", async () => {
      getConfiguredAgents.mockResolvedValue([
        { agentApiName: "Support_Agent", label: "Support", description: "" }
      ]);
      sendAgentMessage.mockResolvedValue(okResponse);

      createComponent({ initialMessage: "Summarize this account" });
      await flushAll();

      expect(sendAgentMessage).toHaveBeenCalledTimes(1);
      expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
        agentApiName: "Support_Agent",
        message: "Summarize this account"
      });
    });

    it("skips silently when no agent can be selected", async () => {
      getConfiguredAgents.mockResolvedValue([]);

      const element = createComponent({ initialMessage: "Summarize" });
      await flushAll();

      expect(sendAgentMessage).not.toHaveBeenCalled();
      expect(
        element.shadowRoot.querySelectorAll('article[data-role="system"]')
          .length
      ).toBe(0);
    });
  });
});