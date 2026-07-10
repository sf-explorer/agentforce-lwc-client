try {
    AgentforceService.AgentResponse res = AgentforceService.sendMessage(
        'CRM_Assistant',
        'Hello from anonymous apex',
        null
    );
    System.debug('VERIFY_RESPONSE_CONTENT=' + (res != null && res.message != null ? res.message.content : null));
    System.debug('VERIFY_RESPONSE_SESSION=' + (res != null ? res.sessionId : null));
    System.debug('VERIFY_RESPONSE_REQUEST=' + (res != null ? res.requestId : null));
    System.debug('VERIFY_RESPONSE_CITATIONS=' + (res != null && res.citations != null ? res.citations.size() : null));
} catch (Exception e) {
    System.debug('VERIFY_EXCEPTION_TYPE=' + e.getTypeName());
    System.debug('VERIFY_EXCEPTION_MESSAGE=' + e.getMessage());
}
