import { LightningElement, api, track } from 'lwc';
import sendAgentMessage from '@salesforce/apex/AgentforceService.sendMessage';

const STATE = Object.freeze({
    IDLE: 'idle',
    TYPING: 'typing',
    SENDING: 'sending',
    WAITING: 'waiting',
    RECEIVING: 'receiving'
});

const STORAGE_PREFIX = 'agentforce-chat-session';
const HISTORY_STORAGE_PREFIX = 'agentforce-chat-history';
const HISTORY_INDEX_SUFFIX = 'index';
const ACTIVE_CONVERSATION_SUFFIX = 'active';

export default class AgentforceChat extends LightningElement {
    @api recordId;
    @api agentApiName;
    @api sessionId;
    @api title = 'Support Assistant';
    @api placeholder = 'Type your message...';
    @api welcomeMessage = 'How can I help?';
    @api suggestions = [];
    @api samplePrompts = '';
    @api showHeader = false;
    @api showAvatar = false;
    @api maxHistory = 30;
    @api disabled = false;
    @api markdownEnabled = false;
    @api showCitations = false;
    @api mode = 'uncontrolled';

    @track messages = [];
    @track state = STATE.IDLE;
    @track conversations = [];

    draftMessage = '';
    hasInteracted = false;
    lastFailedUserMessage = null;
    isConnected = false;
    localSessionId;
    activeConversationId;

    connectedCallback() {
        this.isConnected = true;
        this.initializeSession();
        this.initializeHistory();
        this.initializeWelcomeMessage();
    }

    renderedCallback() {
        this.scrollToBottom();
    }

    @api
    sendMessage(text, options = {}) {
        const trimmed = (text || '').trim();
        if (!trimmed || this.disabled || this.isBusy) {
            return;
        }
        this.hasInteracted = true;
        this.handleSend(trimmed, options);
    }

    @api
    clearConversation({ keepSession = true } = {}) {
        this.messages = [];
        this.persistActiveHistory();
        this.lastFailedUserMessage = null;
        this.hasInteracted = false;
        this.state = STATE.IDLE;
        if (!keepSession) {
            const previous = this.currentSessionId;
            this.localSessionId = null;
            this.persistSessionId(null);
            this.dispatchSessionChange(previous, null, 'reset');
            this.createNewConversation();
        }
        this.initializeWelcomeMessage();
    }

    @api
    focusInput() {
        const input = this.template.querySelector('lightning-textarea');
        if (input) {
            input.focus();
        }
    }

    @api
    setSession(sessionId) {
        const previous = this.currentSessionId;
        if (this.mode !== 'controlled') {
            this.localSessionId = sessionId;
            this.persistSessionId(sessionId);
        }
        this.dispatchSessionChange(previous, sessionId, 'external');
    }

    @api
    addSystemMessage(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            return;
        }
        this.appendMessage('system', trimmed);
    }

    get isBusy() {
        return (
            this.state === STATE.SENDING ||
            this.state === STATE.WAITING ||
            this.state === STATE.RECEIVING
        );
    }

    get canSend() {
        return !this.disabled && !this.isBusy && !this.isDraftBlank;
    }

    get canRetry() {
        return !this.disabled && !this.isBusy && this.lastFailedUserMessage !== null;
    }

    get isDraftBlank() {
        return !this.draftMessage || !this.draftMessage.trim();
    }

    get currentSessionId() {
        return this.mode === 'controlled' ? this.sessionId : this.localSessionId;
    }

    get showSuggestions() {
        return this.parsedSuggestions.length > 0 && !this.hasInteracted;
    }

    get parsedSuggestions() {
        if (Array.isArray(this.suggestions) && this.suggestions.length > 0) {
            return this.suggestions
                .map((value) => (value || '').trim())
                .filter((value) => value.length > 0);
        }

        if (!this.samplePrompts || typeof this.samplePrompts !== 'string') {
            return [];
        }

        // Accept newline, semicolon, or pipe-separated prompt strings from App Builder.
        return this.samplePrompts
            .split(/\r?\n|;|\|/g)
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    }

    get conversationOptions() {
        return this.conversations.map((conversation) => ({
            label: conversation.title,
            value: conversation.id
        }));
    }

    get hasPreviousConversations() {
        return this.conversations.length > 0;
    }

    get canDeleteConversation() {
        return Boolean(this.activeConversationId);
    }

    get hasMessages() {
        return this.messages.length > 0;
    }

    get isWaiting() {
        return this.state === STATE.WAITING || this.state === STATE.RECEIVING;
    }

    get normalizedMessages() {
        return this.messages.map((message, index) => ({
            ...message,
            renderKey: `${index}:${message.id}`,
            isUser: message.role === 'user',
            isAssistant: message.role === 'assistant',
            isSystem: message.role === 'system',
            useLinkifyText: !this.markdownEnabled,
            renderedContent: this.markdownEnabled
                ? this.renderMarkdown(message.content)
                : this.escapeHtml(message.content),
            hasCitations:
                this.showCitations &&
                message.citations &&
                message.citations.length > 0
        }));
    }

    handleInput(event) {
        this.state = STATE.TYPING;
        this.draftMessage = event.target.value;
    }

    handleKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage(this.draftMessage);
        }
    }

    handleSendClick() {
        this.sendMessage(this.draftMessage);
    }

    handleSuggestionClick(event) {
        const suggestion = event.currentTarget.dataset.value;
        this.sendMessage(suggestion);
    }

    handleRetryClick() {
        if (this.lastFailedUserMessage) {
            this.sendMessage(this.lastFailedUserMessage);
        }
    }

    handleConversationChange(event) {
        const conversationId = event.detail.value;
        this.openConversation(conversationId);
    }

    handleNewConversationClick() {
        this.createNewConversation();
    }

    handleDeleteConversationClick() {
        if (!this.activeConversationId) {
            return;
        }

        const conversationIdToDelete = this.activeConversationId;
        const remaining = this.conversations.filter(
            (conversation) => conversation.id !== conversationIdToDelete
        );
        this.deleteStoredHistory(conversationIdToDelete);
        this.conversations = remaining;
        this.persistConversationIndex();

        if (remaining.length === 0) {
            this.createNewConversation();
            return;
        }

        this.activeConversationId = remaining[0].id;
        this.persistActiveConversationId(this.activeConversationId);
        const stored = this.readStoredHistory(this.activeConversationId) || [];
        this.messages = stored;
        this.hasInteracted = this.messages.some((message) => message.role === 'user');
        this.restoreConversationSession();
    }

    handleCopyMessage(event) {
        const messageId = event.currentTarget.dataset.id;
        const message = this.messages.find((item) => item.id === messageId);
        if (!message?.content || !navigator?.clipboard?.writeText) {
            return;
        }
        navigator.clipboard.writeText(message.content);
    }

    async handleSend(text, options = {}) {
        const clientRequestId = this.generateId('client');
        const userMessage = this.appendMessage('user', text, {
            clientRequestId
        });
        this.dispatchMessageEvent(userMessage, 'outgoing');
        this.draftMessage = '';
        this.state = STATE.SENDING;

        try {
            this.state = STATE.WAITING;
            const response = await sendAgentMessage({
                agentApiName: this.agentApiName,
                message: text,
                sessionId: this.currentSessionId
            });
            this.state = STATE.RECEIVING;

            if (response?.sessionId && response.sessionId !== this.currentSessionId) {
                const previous = this.currentSessionId;
                if (this.mode === 'controlled') {
                    this.dispatchSessionChange(previous, response.sessionId, 'created');
                } else {
                    this.localSessionId = response.sessionId;
                    this.persistSessionId(response.sessionId);
                    this.updateConversationSession(response.sessionId);
                    this.dispatchSessionChange(previous, response.sessionId, 'created');
                }
            }

            const assistantMessage = this.appendMessage(
                response?.message?.role || 'assistant',
                response?.message?.content || 'I was unable to generate a response.',
                {
                    id: response?.message?.id,
                    requestId: response?.requestId,
                    citations: response?.citations || []
                }
            );

            this.dispatchMessageEvent(assistantMessage, 'incoming');
            this.dispatchEvent(
                new CustomEvent('response', {
                    detail: {
                        message: assistantMessage,
                        sessionId: response?.sessionId || this.currentSessionId,
                        requestId: response?.requestId,
                        citations: response?.citations || []
                    }
                })
            );
            this.lastFailedUserMessage = null;
            this.state = STATE.IDLE;
        } catch (error) {
            this.state = STATE.IDLE;
            this.lastFailedUserMessage = text;
            const parsedError = this.parseError(error);
            const errorMessage = this.appendMessage('assistant', parsedError.message, {
                errorCode: parsedError.code,
                retryable: parsedError.retryable
            });
            this.dispatchMessageEvent(errorMessage, 'incoming');
            this.dispatchEvent(
                new CustomEvent('error', {
                    detail: parsedError
                })
            );
        }

        if (options.focusInput !== false) {
            this.focusInput();
        }
    }

    initializeWelcomeMessage() {
        if (this.welcomeMessage && this.messages.length === 0) {
            this.appendMessage('assistant', this.welcomeMessage);
        }
    }

    initializeHistory() {
        this.conversations = this.readConversationIndex();
        const activeConversationId = this.readActiveConversationId();
        if (activeConversationId) {
            this.activeConversationId = activeConversationId;
        } else if (this.conversations.length > 0) {
            this.activeConversationId = this.conversations[0].id;
        } else {
            this.createNewConversation();
            return;
        }

        const stored = this.readStoredHistory(this.activeConversationId);
        if (!stored || !Array.isArray(stored) || stored.length === 0) {
            this.messages = [];
            this.restoreConversationSession();
            return;
        }

        const normalized = stored
            .filter((message) => message?.role && message?.content)
            .map((message) => ({
                id: message.id || this.generateId(message.role),
                role: message.role,
                content: message.content,
                timestamp: message.timestamp || new Date().toISOString(),
                requestId: message.requestId || null,
                clientRequestId: message.clientRequestId || null,
                citations: Array.isArray(message.citations) ? message.citations : [],
                errorCode: message.errorCode || null,
                retryable: Boolean(message.retryable)
            }))
            .slice(-this.maxHistory);

        if (normalized.length > 0) {
            this.messages = normalized;
        }
        this.restoreConversationSession();
    }

    createNewConversation() {
        const conversationId = this.generateId('conv');
        this.activeConversationId = conversationId;
        this.messages = [];
        this.hasInteracted = false;
        this.localSessionId = null;
        this.persistSessionId(null);
        this.persistActiveConversationId(conversationId);
        this.upsertConversation({
            id: conversationId,
            title: 'New conversation',
            updatedAt: new Date().toISOString(),
            sessionId: null
        });
    }

    openConversation(conversationId) {
        if (!conversationId || conversationId === this.activeConversationId) {
            return;
        }
        this.activeConversationId = conversationId;
        this.persistActiveConversationId(conversationId);
        const stored = this.readStoredHistory(conversationId) || [];
        this.messages = stored;
        this.hasInteracted = this.messages.some((message) => message.role === 'user');
        this.restoreConversationSession();
    }

    restoreConversationSession() {
        if (this.mode === 'controlled') {
            return;
        }
        const active = this.conversations.find(
            (conversation) => conversation.id === this.activeConversationId
        );
        this.localSessionId = active?.sessionId || null;
        this.persistSessionId(this.localSessionId);
    }

    updateConversationSession(sessionId) {
        if (!this.activeConversationId) {
            return;
        }
        const active = this.conversations.find(
            (conversation) => conversation.id === this.activeConversationId
        );
        this.upsertConversation({
            id: this.activeConversationId,
            title: active?.title || 'New conversation',
            updatedAt: new Date().toISOString(),
            sessionId
        });
    }

    upsertConversation(conversation) {
        const existing = this.conversations.find(
            (item) => item.id === conversation.id
        );
        const next = existing
            ? this.conversations.map((item) => {
                  if (item.id === conversation.id) {
                      return { ...item, ...conversation };
                  }
                  return item;
              })
            : [conversation, ...this.conversations];
        this.conversations = [...next].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt)
        );
        this.persistConversationIndex();
    }

    initializeSession() {
        if (this.mode === 'controlled') {
            return;
        }
        if (this.sessionId) {
            this.localSessionId = this.sessionId;
            this.persistSessionId(this.sessionId);
            return;
        }
        const stored = this.readStoredSessionId();
        if (stored) {
            this.localSessionId = stored;
        }
    }

    storageKey() {
        return `${STORAGE_PREFIX}:${this.agentApiName || 'default'}`;
    }

    persistSessionId(sessionId) {
        if (!this.isConnected || !window?.sessionStorage) {
            return;
        }
        if (sessionId) {
            window.sessionStorage.setItem(this.storageKey(), sessionId);
        } else {
            window.sessionStorage.removeItem(this.storageKey());
        }
    }

    readStoredSessionId() {
        if (!window?.sessionStorage) {
            return null;
        }
        return window.sessionStorage.getItem(this.storageKey());
    }

    historyStorageKey() {
        return `${HISTORY_STORAGE_PREFIX}:${this.agentApiName || 'default'}:${
            this.activeConversationId || 'default'
        }`;
    }

    historyIndexStorageKey() {
        return `${HISTORY_STORAGE_PREFIX}:${this.agentApiName || 'default'}:${HISTORY_INDEX_SUFFIX}`;
    }

    activeConversationStorageKey() {
        return `${HISTORY_STORAGE_PREFIX}:${this.agentApiName || 'default'}:${ACTIVE_CONVERSATION_SUFFIX}`;
    }

    persistActiveHistory() {
        if (!window?.sessionStorage) {
            return;
        }
        if (!this.activeConversationId) {
            return;
        }
        window.sessionStorage.setItem(
            this.historyStorageKey(),
            JSON.stringify(this.messages)
        );
        const firstUserMessage = this.messages.find((message) => message.role === 'user');
        const title = firstUserMessage?.content
            ? firstUserMessage.content.slice(0, 48)
            : 'New conversation';
        const active = this.conversations.find(
            (conversation) => conversation.id === this.activeConversationId
        );
        this.upsertConversation({
            id: this.activeConversationId,
            title,
            updatedAt: new Date().toISOString(),
            sessionId: active?.sessionId || this.currentSessionId || null
        });
    }

    readStoredHistory(conversationId = this.activeConversationId) {
        if (!window?.sessionStorage) {
            return null;
        }
        if (!conversationId) {
            return null;
        }
        const raw = window.sessionStorage.getItem(
            `${HISTORY_STORAGE_PREFIX}:${this.agentApiName || 'default'}:${conversationId}`
        );
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    deleteStoredHistory(conversationId) {
        if (!window?.sessionStorage || !conversationId) {
            return;
        }
        const key = `${HISTORY_STORAGE_PREFIX}:${this.agentApiName || 'default'}:${conversationId}`;
        window.sessionStorage.removeItem(key);
    }

    persistConversationIndex() {
        if (!window?.sessionStorage) {
            return;
        }
        window.sessionStorage.setItem(
            this.historyIndexStorageKey(),
            JSON.stringify(this.conversations)
        );
    }

    readConversationIndex() {
        if (!window?.sessionStorage) {
            return [];
        }
        const raw = window.sessionStorage.getItem(this.historyIndexStorageKey());
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    persistActiveConversationId(conversationId) {
        if (!window?.sessionStorage || !conversationId) {
            return;
        }
        window.sessionStorage.setItem(
            this.activeConversationStorageKey(),
            conversationId
        );
    }

    readActiveConversationId() {
        if (!window?.sessionStorage) {
            return null;
        }
        return window.sessionStorage.getItem(this.activeConversationStorageKey());
    }

    appendMessage(role, content, extra = {}) {
        const message = {
            id: extra.id || this.generateId(role),
            role,
            content,
            timestamp: new Date().toISOString(),
            requestId: extra.requestId,
            clientRequestId: extra.clientRequestId,
            citations: extra.citations || [],
            errorCode: extra.errorCode,
            retryable: extra.retryable || false
        };
        this.messages = [...this.messages, message].slice(-this.maxHistory);
        this.persistActiveHistory();
        return message;
    }

    dispatchMessageEvent(message, direction) {
        this.dispatchEvent(
            new CustomEvent('message', {
                detail: {
                    message,
                    direction
                }
            })
        );
    }

    dispatchSessionChange(previousSessionId, sessionId, reason) {
        this.dispatchEvent(
            new CustomEvent('sessionchange', {
                detail: {
                    previousSessionId,
                    sessionId,
                    reason
                }
            })
        );
    }

    parseError(error) {
        const rawMessage = error?.body?.message || error?.message || 'UNKNOWN_ERROR';
        const [codeSegment, ...rest] = rawMessage.split(':');
        const code = codeSegment ? codeSegment.trim() : 'UNKNOWN_ERROR';
        const message =
            rest.length > 0
                ? rest.join(':').trim()
                : 'Something went wrong while contacting the agent.';
        return {
            message,
            code,
            retryable:
                code === 'TIMEOUT' ||
                code === 'SESSION_EXPIRED' ||
                code === 'GOVERNOR_LIMIT' ||
                code === 'AGENT_UNAVAILABLE',
            requestId: null
        };
    }

    generateId(prefix) {
        return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
    }

    scrollToBottom() {
        const container = this.template.querySelector('.agentforce-chat__messages');
        if (!container) {
            return;
        }
        const isNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 120;
        if (isNearBottom || this.state === STATE.RECEIVING) {
            container.scrollTop = container.scrollHeight;
        }
    }

    escapeHtml(value) {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    renderMarkdown(value) {
        let rendered = this.escapeHtml(value);
        rendered = rendered.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        rendered = rendered.replace(/\*(.*?)\*/g, '<em>$1</em>');
        rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
        rendered = rendered.replace(
            /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
            (_match, label, href) => {
                if (href.startsWith('/')) {
                    const absoluteHref = `${window.location.origin}${href}`;
                    const recordMatch = href.match(
                        /^\/lightning\/r\/([^/]+)\/([^/]+)\/view$/i
                    );
                    if (recordMatch) {
                        const objectApiName = recordMatch[1];
                        return `<code>${objectApiName}</code> <a href="${absoluteHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
                    }
                    return `<a href="${absoluteHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
                }
                return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
            }
        );
        rendered = rendered.replace(
            /(?:^|\n)-\s(.+?)(?=\n|$)/g,
            (_match, item) => `<li>${item}</li>`
        );
        rendered = rendered.replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>');
        rendered = rendered.replace(/\n/g, '<br/>');
        return rendered;
    }
}
