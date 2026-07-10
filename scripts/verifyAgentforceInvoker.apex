try {
    AgentforceService.DefaultAgentInvoker invoker = new AgentforceService.DefaultAgentInvoker();
    AgentforceService.InvocationResult raw = invoker.invoke(
        'CRM_Assistant',
        'Hello from anonymous apex',
        null
    );
    System.debug('VERIFY_INVOKER_RESPONSE=' + raw.responseText);
    System.debug('VERIFY_INVOKER_SESSION=' + raw.sessionId);
    System.debug('VERIFY_INVOKER_REQUEST=' + raw.requestId);
    System.debug('VERIFY_INVOKER_CITATIONS=' + (raw.citations == null ? null : raw.citations.size()));
} catch (Exception e) {
    System.debug('VERIFY_INVOKER_EXCEPTION_TYPE=' + e.getTypeName());
    System.debug('VERIFY_INVOKER_EXCEPTION_MESSAGE=' + e.getMessage());
}
