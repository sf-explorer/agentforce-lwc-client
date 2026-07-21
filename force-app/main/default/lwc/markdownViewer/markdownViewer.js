import { LightningElement, api } from "lwc";
import { NavigationMixin } from "lightning/navigation";

const BULLET_LIST_PATTERN = /^(\s*)[-*+]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^(\s*)\d+\.\s+(.+)$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const HORIZONTAL_RULE_PATTERN = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const TABLE_SEPARATOR_PATTERN =
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;
const TABLE_ROW_PATTERN = /^\s*\|?.*\|.*$/;
const FENCE_PATTERN = /^```([\w-]+)?\s*$/;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const BOLD_PATTERN = /\*\*(.+?)\*\*/g;
const ITALIC_PATTERN = /\*(.+?)\*/g;
const RECORD_LINK_WITH_OBJECT_PATTERN =
  /\/lightning\/r\/([^/]+)\/([a-zA-Z0-9]{15,18})\/(view|edit|clone)/i;
const RECORD_LINK_WITHOUT_OBJECT_PATTERN =
  /\/lightning\/r\/([a-zA-Z0-9]{15,18})\/(view|edit|clone)/i;

export default class MarkdownViewer extends NavigationMixin(LightningElement) {
  _value = "";
  _lastRenderedSource = null;
  _collapsibleHeadings = true;

  @api
  get collapsibleHeadings() {
    return this._collapsibleHeadings;
  }

  set collapsibleHeadings(value) {
    this._collapsibleHeadings = value !== false && value !== "false";
  }

  @api
  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._value = typeof nextValue === "string" ? nextValue : "";
  }

  renderedCallback() {
    if (this._lastRenderedSource === this._value) {
      return;
    }
    const container = this.template.querySelector(".markdown-viewer__content");
    if (!container) {
      return;
    }
    const html = this.renderMarkdown(this._value);
    container.innerHTML = html;
    this._lastRenderedSource = this._value;
  }

  handleContentClick(event) {
    const anchor = event?.target?.closest?.("a");
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href || href === "#") {
      return;
    }
    const recordInfo = this.parseRecordLink(href);
    if (!recordInfo?.recordId) {
      return;
    }

    event.preventDefault();
    this.navigateToRecord(recordInfo);
  }

  renderMarkdown(markdown) {
    if (!markdown) {
      return "<p></p>";
    }

    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      if (FENCE_PATTERN.test(trimmed)) {
        const { html, nextIndex } = this.parseCodeFence(lines, index);
        blocks.push(html);
        index = nextIndex;
        continue;
      }

      if (HORIZONTAL_RULE_PATTERN.test(trimmed)) {
        blocks.push("<hr/>");
        index += 1;
        continue;
      }

      if (HEADING_PATTERN.test(trimmed)) {
        if (this.collapsibleHeadings) {
          const { html, nextIndex } = this.parseHeadingSection(lines, index);
          blocks.push(html);
          index = nextIndex;
        } else {
          const match = trimmed.match(HEADING_PATTERN);
          const level = match[1].length;
          blocks.push(`<h${level}>${this.renderInline(match[2])}</h${level}>`);
          index += 1;
        }
        continue;
      }

      if (this.isTableHeader(lines, index)) {
        const { html, nextIndex } = this.parseTable(lines, index);
        blocks.push(html);
        index = nextIndex;
        continue;
      }

      if (BLOCKQUOTE_PATTERN.test(trimmed)) {
        const { html, nextIndex } = this.parseBlockquote(lines, index);
        blocks.push(html);
        index = nextIndex;
        continue;
      }

      if (BULLET_LIST_PATTERN.test(line) || ORDERED_LIST_PATTERN.test(line)) {
        const { html, nextIndex } = this.parseList(lines, index);
        blocks.push(html);
        index = nextIndex;
        continue;
      }

      const { html, nextIndex } = this.parseParagraph(lines, index);
      blocks.push(html);
      index = nextIndex;
    }

    return blocks.join("");
  }

  parseCodeFence(lines, startIndex) {
    const firstLine = lines[startIndex].trim();
    const language = (firstLine.match(FENCE_PATTERN) || [])[1] || "";
    const codeLines = [];
    let index = startIndex + 1;

    while (index < lines.length && !FENCE_PATTERN.test(lines[index].trim())) {
      codeLines.push(lines[index]);
      index += 1;
    }

    if (index < lines.length) {
      index += 1;
    }

    const code = this.escapeHtml(codeLines.join("\n"));
    const languageClass = language ? ` class="language-${language}"` : "";
    return {
      html: `<pre><code${languageClass}>${code}</code></pre>`,
      nextIndex: index
    };
  }

  parseTable(lines, startIndex) {
    const headerCells = this.parseTableRow(lines[startIndex]);
    let index = startIndex + 2;
    const bodyRows = [];

    while (
      index < lines.length &&
      TABLE_ROW_PATTERN.test(lines[index].trim())
    ) {
      const rowCells = this.parseTableRow(lines[index]);
      if (rowCells.length === 0) {
        break;
      }
      bodyRows.push(rowCells);
      index += 1;
    }

    const thead = `<thead><tr>${headerCells
      .map((cell) => `<th scope="col">${this.renderInline(cell)}</th>`)
      .join("")}</tr></thead>`;
    const tbody = `<tbody>${bodyRows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td>${this.renderInline(cell)}</td>`)
            .join("")}</tr>`
      )
      .join("")}</tbody>`;

    return {
      html: `<table>${thead}${tbody}</table>`,
      nextIndex: index
    };
  }

  parseHeadingSection(lines, startIndex) {
    const match = lines[startIndex].trim().match(HEADING_PATTERN);
    const level = match[1].length;
    const headingText = match[2];
    let index = startIndex + 1;
    const sectionLines = [];

    while (index < lines.length) {
      const nextTrimmed = lines[index].trim();
      const nextHeadingMatch = nextTrimmed.match(HEADING_PATTERN);
      if (nextHeadingMatch && nextHeadingMatch[1].length <= level) {
        break;
      }
      sectionLines.push(lines[index]);
      index += 1;
    }

    const sectionContent = sectionLines.join("\n").trim();
    const bodyHtml = sectionContent
      ? this.renderMarkdown(sectionContent)
      : "<p></p>";
    return {
      html: [
        `<details class="markdown-viewer__section" open>`,
        `<summary class="markdown-viewer__section-summary">${this.renderInline(
          headingText
        )}</summary>`,
        `<div class="markdown-viewer__section-body">${bodyHtml}</div>`,
        `</details>`
      ].join(""),
      nextIndex: index
    };
  }

  parseTableRow(rowLine) {
    return rowLine
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  parseBlockquote(lines, startIndex) {
    const quoteLines = [];
    let index = startIndex;
    while (index < lines.length) {
      const trimmed = lines[index].trim();
      const match = trimmed.match(BLOCKQUOTE_PATTERN);
      if (!match) {
        break;
      }
      quoteLines.push(match[1]);
      index += 1;
    }
    return {
      html: `<blockquote>${quoteLines
        .map((line) => this.renderInline(line))
        .join("<br/>")}</blockquote>`,
      nextIndex: index
    };
  }

  parseList(lines, startIndex) {
    const isOrdered = ORDERED_LIST_PATTERN.test(lines[startIndex]);
    const pattern = isOrdered ? ORDERED_LIST_PATTERN : BULLET_LIST_PATTERN;
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
      const match = lines[index].match(pattern);
      if (!match) {
        break;
      }
      items.push(`<li>${this.renderInline(match[2])}</li>`);
      index += 1;
    }

    const wrapper = isOrdered ? "ol" : "ul";
    return {
      html: `<${wrapper}>${items.join("")}</${wrapper}>`,
      nextIndex: index
    };
  }

  parseParagraph(lines, startIndex) {
    const content = [];
    let index = startIndex;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (
        !trimmed ||
        FENCE_PATTERN.test(trimmed) ||
        HORIZONTAL_RULE_PATTERN.test(trimmed) ||
        HEADING_PATTERN.test(trimmed) ||
        BLOCKQUOTE_PATTERN.test(trimmed) ||
        BULLET_LIST_PATTERN.test(line) ||
        ORDERED_LIST_PATTERN.test(line) ||
        this.isTableHeader(lines, index)
      ) {
        break;
      }
      content.push(trimmed);
      index += 1;
    }

    return {
      html: `<p>${this.renderInline(content.join(" "))}</p>`,
      nextIndex: index
    };
  }

  isTableHeader(lines, index) {
    if (index + 1 >= lines.length) {
      return false;
    }
    const headerLine = lines[index].trim();
    const separatorLine = lines[index + 1].trim();
    return (
      TABLE_ROW_PATTERN.test(headerLine) &&
      TABLE_SEPARATOR_PATTERN.test(separatorLine)
    );
  }

  renderInline(text) {
    if (!text) {
      return "";
    }

    let html = this.escapeHtml(text);

    html = html.replace(LINK_PATTERN, (_match, label, href) =>
      this.renderLink(label, href)
    );
    html = html.replace(INLINE_CODE_PATTERN, "<code>$1</code>");
    html = html.replace(BOLD_PATTERN, "<strong>$1</strong>");
    html = html.replace(ITALIC_PATTERN, "<em>$1</em>");
    return html;
  }

  renderLink(label, href) {
    const safeHref = this.normalizeLink(href);
    const recordInfo = this.parseRecordLink(safeHref);
    if (!recordInfo) {
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }

    const displayLabel = this.computeRecordDisplayLabel(
      label,
      recordInfo.recordId
    );
    const objectEmoji = this.computeObjectEmoji(recordInfo.objectApiName);
    const objectEmojiHtml = objectEmoji
      ? `<span class="markdown-viewer__record-link-object" aria-hidden="true">${objectEmoji}</span>`
      : "";

    return [
      `<a class="markdown-viewer__record-link" href="${safeHref}">`,
      objectEmojiHtml,
      `<span class="markdown-viewer__record-link-label">${displayLabel}</span>`,
      "</a>"
    ].join("");
  }

  normalizeLink(href) {
    const safeHref = href.trim();
    if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(safeHref)) {
      if (safeHref.startsWith("/")) {
        return `${window.location.origin}${safeHref}`;
      }
      return safeHref;
    }
    return "#";
  }

  parseRecordLink(href) {
    const withObject = href.match(RECORD_LINK_WITH_OBJECT_PATTERN);
    if (withObject) {
      return {
        objectApiName: withObject[1],
        recordId: withObject[2],
        actionName: withObject[3]
      };
    }
    const withoutObject = href.match(RECORD_LINK_WITHOUT_OBJECT_PATTERN);
    if (withoutObject) {
      return {
        objectApiName: null,
        recordId: withoutObject[1],
        actionName: withoutObject[2]
      };
    }
    return null;
  }

  navigateToRecord(recordInfo) {
    const attributes = {
      recordId: recordInfo.recordId,
      actionName: recordInfo.actionName || "view"
    };
    if (recordInfo.objectApiName) {
      attributes.objectApiName = recordInfo.objectApiName;
    }
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes
    });
  }

  computeRecordDisplayLabel(label, recordId) {
    const normalizedLabel = (label || "").trim();
    if (
      !normalizedLabel ||
      normalizedLabel.includes("/lightning/r/") ||
      normalizedLabel.toLowerCase() === "view" ||
      normalizedLabel === recordId
    ) {
      const shortId = recordId.slice(0, 8);
      return `Open ${shortId}...`;
    }
    return normalizedLabel;
  }

  computeObjectEmoji(objectApiName) {
    const normalized = (objectApiName || "")
      .replace(/__c$/i, "")
      .replaceAll("_", "")
      .toLowerCase();
    const emojiByObject = {
      account: "🏢",
      contact: "👤",
      opportunity: "💼",
      case: "🎫",
      lead: "✨",
      task: "✅",
      event: "📅"
    };
    return emojiByObject[normalized] || "";
  }

  escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
