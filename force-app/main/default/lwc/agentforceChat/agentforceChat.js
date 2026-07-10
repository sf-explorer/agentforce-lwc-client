import { LightningElement, api, track } from 'lwc';
import sendAgentMessage from '@salesforce/apex/AgentforceService.sendMessage';
import getCoworkerSkills from '@salesforce/apex/CoworkerSkillsController.getSkills';

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
const COMMANDS = Object.freeze([
    { name: 'help', description: 'Show available commands' },
    { name: 'clear', description: 'Clear current conversation' },
    { name: 'new', description: 'Start a new conversation' },
    { name: 'retry', description: 'Retry the last failed message' },
    { name: 'session', description: 'Show session and agent info' },
    { name: 'context', description: 'Show active record context' },
    { name: 'prompts', description: 'List configured prompts' },
    { name: 'reset', description: 'Reset conversation and session' }
]);

export default class AgentforceChat extends LightningElement {
    @api recordId;
    @api agentApiName;
    @api sessionId;
    @api title = 'Support Assistant';
    @api placeholder = 'Type your message...';
    @api welcomeMessage = 'How can I help?';
    @api suggestions = [];
    @api samplePrompts = '';
    @api skillsJson = '';
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
    commandActiveIndex = 0;
    skillActiveIndex = 0;
    loadedSkills = [];
    resolvedPreviewOpen = false;
    resolvedPreviewText = '';
    resolvedPreviewTitle = '';
    localSessionId;
    activeConversationId;

    connectedCallback() {
        this.isConnected = true;
        this.initializeSession();
        this.initializeHistory();
        this.initializeWelcomeMessage();
        this.loadSkills();
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
        if (this.handleSlashCommand(trimmed)) {
            if (options.focusInput !== false) {
                this.focusInput();
            }
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

    get commandHintText() {
        return 'Type / for commands or @ for skills';
    }

    get configuredSkills() {
        if (this.loadedSkills.length > 0) {
            return this.loadedSkills;
        }
        if (!this.skillsJson || typeof this.skillsJson !== 'string') {
            return [];
        }
        try {
            const parsed = JSON.parse(this.skillsJson);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((skill) => ({
                    label: (skill?.label || skill?.Label || '').trim(),
                    content: (skill?.content__c || skill?.content || '').trim()
                }))
                .filter((skill) => skill.label && skill.content);
        } catch {
            return [];
        }
    }

    async loadSkills() {
        try {
            const records = await getCoworkerSkills();
            if (!Array.isArray(records)) {
                return;
            }
            this.loadedSkills = records
                .map((record) => ({
                    label: (record?.MasterLabel || '').trim(),
                    content: (record?.Content__c || '').trim()
                }))
                .filter((skill) => skill.label && skill.content);
        } catch {
            this.loadedSkills = [];
        }
    }

    get commandQuery() {
        if (!this.draftMessage || !this.draftMessage.startsWith('/')) {
            return '';
        }
        const [rawCommand] = this.draftMessage.slice(1).split(/\s+/, 1);
        return (rawCommand || '').toLowerCase();
    }

    get isCommandMode() {
        return Boolean(this.draftMessage) && this.draftMessage.startsWith('/');
    }

    get commandSuggestions() {
        if (!this.isCommandMode) {
            return [];
        }
        const query = this.commandQuery;
        const list = COMMANDS.filter((item) =>
            item.name.toLowerCase().startsWith(query)
        ).map((item, index) => ({
            id: item.name,
            command: `/${item.name}`,
            description: item.description,
            isActive: index === this.commandActiveIndex
        }));
        if (this.commandActiveIndex >= list.length) {
            this.commandActiveIndex = list.length > 0 ? 0 : -1;
        }
        return list;
    }

    get showCommandAutocomplete() {
        return this.isCommandMode && this.commandSuggestions.length > 0;
    }

    get mentionTokenInfo() {
        if (!this.draftMessage) {
            return null;
        }
        const match = this.draftMessage.match(/(^|\s)(@[^@\n\r]*)$/);
        if (!match) {
            return null;
        }
        const token = match[2];
        const startIndex = this.draftMessage.lastIndexOf(token);
        return {
            token,
            query: token.slice(1).trimStart().toLowerCase(),
            startIndex
        };
    }

    get mentionSuggestions() {
        const info = this.mentionTokenInfo;
        if (!info) {
            return [];
        }
        const list = this.configuredSkills
            .filter((skill) => skill.label.toLowerCase().startsWith(info.query))
            .map((skill, index) => ({
                id: `skill-${skill.label}`,
                mention: `@${skill.label}`,
                label: skill.label,
                description:
                    skill.content.length > 80
                        ? `${skill.content.slice(0, 80)}...`
                        : skill.content,
                isActive: index === this.skillActiveIndex
            }));
        if (this.skillActiveIndex >= list.length) {
            this.skillActiveIndex = list.length > 0 ? 0 : -1;
        }
        return list;
    }

    get showSkillAutocomplete() {
        return Boolean(this.mentionTokenInfo) && this.mentionSuggestions.length > 0;
    }

    get normalizedMessages() {
        return this.messages.map((message, index) => ({
            ...message,
            renderKey: `${index}:${message.id}`,
            isUser: message.role === 'user',
            isAssistant: message.role === 'assistant',
            isSystem: message.role === 'system',
            hasSkillMentions:
                message.role === 'user' &&
                Array.isArray(message.usedSkillLabels) &&
                message.usedSkillLabels.length > 0,
            useLinkifyText:
                !this.markdownEnabled &&
                !(
                    message.role === 'user' &&
                    Array.isArray(message.usedSkillLabels) &&
                    message.usedSkillLabels.length > 0
                ),
            renderedContent: this.markdownEnabled
                ? this.renderMarkdown(message.content)
                : this.renderUserSkillMentions(message.content, message.usedSkillLabels),
            hasResolvedContent:
                message.role === 'user' &&
                !!message.resolvedContent &&
                message.resolvedContent !== message.content &&
                message.resolvedContent.length > 0,
            hasCitations:
                this.showCitations &&
                message.citations &&
                message.citations.length > 0
        }));
    }

    renderUserSkillMentions(content, usedSkillLabels) {
        const escaped = this.escapeHtml(content);
        if (!Array.isArray(usedSkillLabels) || usedSkillLabels.length === 0) {
            return escaped;
        }
        let rendered = escaped;
        usedSkillLabels
            .filter((label) => !!label)
            .sort((a, b) => b.length - a.length)
            .forEach((label) => {
                const escapedLabel = this.escapeRegExp(this.escapeHtml(label));
                const pattern = new RegExp(`@${escapedLabel}`, 'gi');
                rendered = rendered.replace(pattern, (match) => `<strong>${match}</strong>`);
            });
        return rendered;
    }

    handleInput(event) {
        this.state = STATE.TYPING;
        this.draftMessage = event.target.value;
        this.commandActiveIndex = 0;
        this.skillActiveIndex = 0;
    }

    handleKeydown(event) {
        if (this.showCommandAutocomplete) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.commandActiveIndex =
                    (this.commandActiveIndex + 1) % this.commandSuggestions.length;
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.commandActiveIndex =
                    (this.commandActiveIndex - 1 + this.commandSuggestions.length) %
                    this.commandSuggestions.length;
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                this.draftMessage = '';
                this.commandActiveIndex = 0;
                return;
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                this.applyActiveCommandSuggestion();
                return;
            }
            if (event.key === 'Enter' && !event.shiftKey && this.isCommandMode) {
                const exactMatch = this.commandSuggestions.find(
                    (item) => item.command.toLowerCase() === this.draftMessage.trim().toLowerCase()
                );
                if (!exactMatch) {
                    event.preventDefault();
                    this.applyActiveCommandSuggestion();
                    return;
                }
            }
        }
        if (this.showSkillAutocomplete) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.skillActiveIndex =
                    (this.skillActiveIndex + 1) % this.mentionSuggestions.length;
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.skillActiveIndex =
                    (this.skillActiveIndex - 1 + this.mentionSuggestions.length) %
                    this.mentionSuggestions.length;
                return;
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                this.applyActiveSkillSuggestion();
                return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
                const normalizedDraft = (this.mentionTokenInfo?.token || '').toLowerCase();
                const exactMatch = this.mentionSuggestions.find(
                    (item) => item.mention.toLowerCase() === normalizedDraft
                );
                if (!exactMatch) {
                    event.preventDefault();
                    this.applyActiveSkillSuggestion();
                    return;
                }
            }
        }
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

    handleCommandSuggestionClick(event) {
        const command = event.currentTarget.dataset.command;
        this.draftMessage = command;
        this.commandActiveIndex = 0;
        this.focusInput();
    }

    handleSkillSuggestionClick(event) {
        const label = event.currentTarget.dataset.label;
        this.applySkillSuggestion(label);
        this.focusInput();
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

    handleResolvedPreviewClick(event) {
        const messageId = event.currentTarget.dataset.id;
        const message = this.messages.find((item) => item.id === messageId);
        if (!message?.resolvedContent) {
            return;
        }
        this.resolvedPreviewTitle = 'Resolved prompt sent to agent';
        this.resolvedPreviewText = message.resolvedContent;
        this.resolvedPreviewOpen = true;
    }

    closeResolvedPreview() {
        this.resolvedPreviewOpen = false;
        this.resolvedPreviewText = '';
        this.resolvedPreviewTitle = '';
    }

    async handleSend(text, options = {}) {
        const clientRequestId = this.generateId('client');
        const skillResolution = this.resolveSkillMentions(text);
        const userMessage = this.appendMessage('user', text, {
            clientRequestId,
            resolvedContent:
                skillResolution.usedSkillLabels.length > 0
                    ? skillResolution.resolvedText
                    : null,
            usedSkillLabels: skillResolution.usedSkillLabels
        });
        const messageWithContext = this.withAgentContext(skillResolution.resolvedText);
        this.dispatchMessageEvent(userMessage, 'outgoing');
        this.draftMessage = '';
        this.state = STATE.SENDING;

        try {
            this.state = STATE.WAITING;
            const response = await sendAgentMessage({
                agentApiName: this.agentApiName,
                message: messageWithContext,
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

    withAgentContext(text) {
        if (!this.recordId) {
            return text;
        }
        return [
            '[Salesforce Context]',
            `recordId=${this.recordId}`,
            '[/Salesforce Context]',
            '',
            text
        ].join('\n');
    }

    handleSlashCommand(text) {
        if (!text.startsWith('/')) {
            return false;
        }

        const [rawCommand] = text.split(/\s+/, 1);
        const command = rawCommand.toLowerCase();

        switch (command) {
            case '/clear':
                this.clearConversation();
                this.addSystemMessage('Conversation cleared.');
                return true;
            case '/new':
                this.clearConversation({ keepSession: false });
                this.addSystemMessage('Started a new conversation.');
                return true;
            case '/reset':
                this.clearConversation({ keepSession: false });
                this.addSystemMessage('Conversation and session reset.');
                return true;
            case '/retry':
                if (!this.lastFailedUserMessage) {
                    this.addSystemMessage('No failed message to retry.');
                    return true;
                }
                this.hasInteracted = true;
                this.handleSend(this.lastFailedUserMessage);
                return true;
            case '/session':
                this.addSystemMessage(
                    `Session: ${this.currentSessionId || 'not set'} | Agent: ${
                        this.agentApiName || 'not set'
                    }`
                );
                return true;
            case '/context':
                this.addSystemMessage(
                    this.recordId
                        ? `Context recordId: ${this.recordId}`
                        : 'No active record context.'
                );
                return true;
            case '/prompts':
                this.addSystemMessage(
                    this.parsedSuggestions.length > 0
                        ? `Prompts: ${this.parsedSuggestions.join(' | ')}`
                        : 'No sample prompts configured.'
                );
                return true;
            case '/help':
                this.addSystemMessage(this.commandHintText);
                return true;
            default:
                this.addSystemMessage(`Unknown command: ${rawCommand}. Try /help.`);
                return true;
        }
    }

    applyActiveCommandSuggestion() {
        const activeSuggestion = this.commandSuggestions[this.commandActiveIndex];
        if (!activeSuggestion) {
            return;
        }
        this.draftMessage = activeSuggestion.command;
    }

    applyActiveSkillSuggestion() {
        const activeSuggestion = this.mentionSuggestions[this.skillActiveIndex];
        if (!activeSuggestion) {
            return;
        }
        this.applySkillSuggestion(activeSuggestion.label);
    }

    applySkillSuggestion(label) {
        const info = this.mentionTokenInfo;
        if (!info) {
            return;
        }
        this.draftMessage = `${this.draftMessage.slice(
            0,
            info.startIndex
        )}@${label} `;
        this.skillActiveIndex = 0;
    }

    resolveSkillMentions(text) {
        if (!text || this.configuredSkills.length === 0) {
            return {
                resolvedText: text,
                usedSkillLabels: []
            };
        }
        const skillsByLabel = this.configuredSkills.reduce((acc, skill) => {
            acc[skill.label.toLowerCase()] = skill;
            return acc;
        }, {});
        const labels = Object.keys(skillsByLabel).sort((a, b) => b.length - a.length);
        let resolvedText = text;
        const usedSkillLabels = new Set();

        labels.forEach((labelKey) => {
            const escaped = this.escapeRegExp(labelKey);
            const pattern = new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[.,!?;:])`, 'gi');
            resolvedText = resolvedText.replace(pattern, (match, prefix) => {
                const skill = skillsByLabel[labelKey];
                if (!skill) {
                    return match;
                }
                usedSkillLabels.add(skill.label);
                return `${prefix}${skill.content}`;
            });
        });

        return {
            resolvedText,
            usedSkillLabels: Array.from(usedSkillLabels)
        };
    }

    escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            retryable: extra.retryable || false,
            resolvedContent: extra.resolvedContent || null,
            usedSkillLabels: Array.isArray(extra.usedSkillLabels)
                ? extra.usedSkillLabels
                : []
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
