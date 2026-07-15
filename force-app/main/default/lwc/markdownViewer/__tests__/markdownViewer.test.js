import { createElement } from "lwc";
import MarkdownViewer from "c/markdownViewer";

function flushPromises() {
  return Promise.resolve();
}

describe("c-markdown-viewer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders headings, tables, links and bold text", async () => {
    const element = createElement("c-markdown-viewer", {
      is: MarkdownViewer
    });
    element.value = [
      "# Release Notes",
      "",
      "**Important** update with [docs](https://example.com)",
      "",
      "| Feature | Status |",
      "| --- | --- |",
      "| Markdown | Ready |"
    ].join("\n");
    document.body.appendChild(element);
    await flushPromises();

    const root = element.shadowRoot.querySelector(".markdown-viewer__content");
    expect(root.innerHTML).toContain("Release Notes");
    expect(root.innerHTML).toContain("<strong");
    expect(root.innerHTML).toContain('href="https://example.com"');
    expect(root.innerHTML).toContain("<table");
    expect(root.innerHTML).toContain('scope="col"');
  });

  it("neutralizes javascript links and escapes html input", async () => {
    const element = createElement("c-markdown-viewer", {
      is: MarkdownViewer
    });
    element.value = "[bad](javascript:alert(1)) <script>alert(1)</script>";
    document.body.appendChild(element);
    await flushPromises();

    const root = element.shadowRoot.querySelector(".markdown-viewer__content");
    expect(root.innerHTML).toContain('href="#"');
    expect(root.innerHTML).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders lightning record links with Salesforce-style chip label", async () => {
    const element = createElement("c-markdown-viewer", {
      is: MarkdownViewer
    });
    element.value =
      "[Acme Corp](/lightning/r/Account/001xx000003DGbRAAW/view) and " +
      "[/lightning/r/Contact/003xx000004TmiAAAS/view](/lightning/r/Contact/003xx000004TmiAAAS/view)";
    document.body.appendChild(element);
    await flushPromises();

    const root = element.shadowRoot.querySelector(".markdown-viewer__content");
    expect(root.innerHTML).toContain("markdown-viewer__record-link");
    expect(root.innerHTML).toContain("markdown-viewer__record-link-object");
    expect(root.innerHTML).toContain("Account");
    expect(root.innerHTML).toContain("Contact");
    expect(root.innerHTML).toContain("Open 003xx000...");
    expect(root.innerHTML).not.toContain('target="_blank"');
  });

  it("renders horizontal rule and optional collapsible heading sections", async () => {
    const element = createElement("c-markdown-viewer", {
      is: MarkdownViewer
    });
    element.collapsibleHeadings = true;
    element.value = [
      "# Summary",
      "Line one",
      "---",
      "## Details",
      "Line two"
    ].join("\n");
    document.body.appendChild(element);
    await flushPromises();

    const root = element.shadowRoot.querySelector(".markdown-viewer__content");
    expect(root.innerHTML).toContain("<details");
    expect(root.innerHTML).toContain("markdown-viewer__section-summary");
    expect(root.innerHTML).toContain("<hr");
  });
});
