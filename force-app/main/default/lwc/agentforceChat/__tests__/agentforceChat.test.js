import { createElement } from 'lwc';
import AgentforceChat from 'c/agentforceChat';
import sendAgentMessage from '@salesforce/apex/AgentforceService.sendMessage';

jest.mock(
    '@salesforce/apex/AgentforceService.sendMessage',
    () => ({
        default: jest.fn()
    }),
    { virtual: true }
);

const flushPromises = () => Promise.resolve();

function createComponent(props = {}) {
    const element = createElement('c-agentforce-chat', {
        is: AgentforceChat
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-agentforce-chat', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('sends a message and renders assistant response', async () => {
        sendAgentMessage.mockResolvedValue({
            message: {
                id: 'm-2',
                role: 'assistant',
                content: 'Hello **world**'
            },
            sessionId: 'session-1',
            requestId: 'req-1',
            citations: []
        });

        const element = createComponent({
            agentApiName: 'Support_Agent'
        });

        const messageHandler = jest.fn();
        let responsePayload;
        let sessionPayload;
        element.addEventListener('message', messageHandler);
        element.addEventListener('response', (event) => {
            responsePayload = event.detail;
        });
        element.addEventListener('sessionchange', (event) => {
            sessionPayload = event.detail;
        });

        element.sendMessage('Hi there');
        await flushPromises();
        await flushPromises();

        expect(sendAgentMessage).toHaveBeenCalledTimes(1);
        expect(sendAgentMessage.mock.calls[0][0]).toMatchObject({
            agentApiName: 'Support_Agent',
            message: 'Hi there'
        });
        expect(messageHandler).toHaveBeenCalled();
        expect(responsePayload).toBeDefined();
        expect(responsePayload.sessionId).toBe('session-1');
        expect(responsePayload.message.content).toBe('Hello **world**');
        expect(sessionPayload.sessionId).toBe('session-1');
    });

    it('emits error event and keeps retry message', async () => {
        sendAgentMessage.mockRejectedValue({
            body: {
                message: 'TIMEOUT: request timed out'
            }
        });

        const element = createComponent({
            agentApiName: 'Support_Agent'
        });
        let errorPayload;
        element.addEventListener('error', (event) => {
            errorPayload = event.detail;
        });

        element.sendMessage('Will fail');
        await flushPromises();
        await flushPromises();

        expect(errorPayload).toBeDefined();
        expect(errorPayload.code).toBe('TIMEOUT');
        expect(errorPayload.retryable).toBe(true);
    });

    it('hides suggestions after first interaction', async () => {
        sendAgentMessage.mockResolvedValue({
            message: {
                id: 'm-2',
                role: 'assistant',
                content: 'Done'
            },
            sessionId: 'session-1',
            requestId: 'req-1',
            citations: []
        });

        const element = createComponent({
            agentApiName: 'Support_Agent',
            suggestions: ['Summarize account']
        });
        let suggestionButtons = element.shadowRoot.querySelectorAll(
            '.agentforce-chat__suggestion-list button'
        );
        expect(suggestionButtons.length).toBe(1);

        element.sendMessage('Hello');
        await flushPromises();
        await flushPromises();

        suggestionButtons = element.shadowRoot.querySelectorAll(
            '.agentforce-chat__suggestion-list button'
        );
        expect(suggestionButtons.length).toBe(0);
    });

    it('supports controlled session mode without internal mutation', async () => {
        sendAgentMessage.mockResolvedValue({
            message: {
                id: 'm-2',
                role: 'assistant',
                content: 'Continuing session'
            },
            sessionId: 'session-from-server',
            requestId: 'req-1',
            citations: []
        });

        const element = createComponent({
            agentApiName: 'Support_Agent',
            mode: 'controlled',
            sessionId: 'session-parent'
        });

        element.sendMessage('Hello');
        await flushPromises();
        await flushPromises();

        expect(element.sessionId).toBe('session-parent');
    });
});
