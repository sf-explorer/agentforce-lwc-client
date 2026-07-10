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

export default class AgentforceChat extends LightningElement {
    @api agentApiName;
    @api sessionId;
    @api title = 'Support Assistant';
    @api placeholder = 'Type your message...';
    @api welcomeMessage = 'How can I help?';
    @api suggestions = [];
    @api showHeader = false;
    @api showAvatar = false;
    @api maxHistory = 30;
    @api disabled = false;
    @api markdownEnabled = false;
    @api showCitations = false;
    @api mode = 'uncontrolled';

    @track messages = [];
    @track state = STATE.IDLE;

    draftMessage = '';
    hasInteracted = false;
    lastFailedUserMessage = null;
    isConnected = false;
    localSessionId;

    connectedCallback() {
        this.isConnected = true;
        this.initializeSession();
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
        this.lastFailedUserMessage = null;
        this.state = STATE.IDLE;
        if (!keepSession) {
            const previous = this.currentSessionId;
            this.localSessionId = null;
            this.persistSessionId(null);
            this.dispatchSessionChange(previous, null, 'reset');
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
        return this.suggestions?.length > 0 && !this.hasInteracted;
    }

    get hasMessages() {
        return this.messages.length > 0;
    }

    get isWaiting() {
        return this.state === STATE.WAITING || this.state === STATE.RECEIVING;
    }

    get normalizedMessages() {
        return this.messages.map((message) => ({
            ...message,
            isUser: message.role === 'user',
            isAssistant: message.role === 'assistant',
            isSystem: message.role === 'system',
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
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
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
