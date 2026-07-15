@IsTest
private class AgentforceServiceTest {
  private class SuccessInvoker implements AgentforceService.AgentInvoker {
    public AgentforceService.InvocationResult invoke(
      String agentApiName,
      String userMessage,
      String sessionId
    ) {
      AgentforceService.InvocationResult result = new AgentforceService.InvocationResult();
      result.responseText = 'You currently have **14** open opportunities.';
      result.sessionId = String.isBlank(sessionId) ? 'SESSION-001' : sessionId;
      result.requestId = 'REQ-001';
      result.citations = new List<AgentforceService.Citation>();
      AgentforceService.Citation citation = new AgentforceService.Citation();
      citation.id = 'CIT-1';
      citation.title = 'Opportunities';
      citation.url = 'https://example.com/opps';
      citation.snippet = 'Open opportunity summary';
      citation.sourceType = 'record';
      result.citations.add(citation);
      return result;
    }
  }

  private class ErrorInvoker implements AgentforceService.AgentInvoker {
    private String message;

    ErrorInvoker(String message) {
      this.message = message;
    }

    public AgentforceService.InvocationResult invoke(
      String agentApiName,
      String userMessage,
      String sessionId
    ) {
      throw new AgentforceService.AgentforceServiceException(message);
    }
  }

  @IsTest
  static void sendMessage_createsNewSessionWhenMissing() {
    AgentforceService.invoker = new SuccessInvoker();

    Test.startTest();
    AgentforceService.AgentResponse response = AgentforceService.sendMessage(
      'Support_Agent',
      'Hello',
      null
    );
    Test.stopTest();

    System.assertNotEquals(null, response);
    System.assertNotEquals(null, response.message);
    System.assertEquals('assistant', response.message.role);
    System.assertEquals('SESSION-001', response.sessionId);
    System.assertEquals('REQ-001', response.requestId);
    System.assertEquals(1, response.citations.size());
  }

  @IsTest
  static void sendMessage_reusesExistingSession() {
    AgentforceService.invoker = new SuccessInvoker();

    AgentforceService.AgentResponse response = AgentforceService.sendMessage(
      'Support_Agent',
      'Continue conversation',
      'SESSION-EXISTING'
    );

    System.assertEquals('SESSION-EXISTING', response.sessionId);
  }

  @IsTest
  static void sendMessage_throwsForBlankAgent() {
    String code = AgentforceService.deriveErrorCode(
      'INVALID_INPUT: agentApiName is required.'
    );
    System.assertNotEquals(null, code);
  }

  @IsTest
  static void sendMessage_throwsForBlankMessage() {
    String code = AgentforceService.deriveErrorCode(
      'INVALID_INPUT: message is required.'
    );
    System.assertNotEquals(null, code);
  }

  @IsTest
  static void sendMessage_mapsInvalidAgentError() {
    String code = AgentforceService.deriveErrorCode('invalid agent');
    System.assertNotEquals(null, code);
  }

  @IsTest
  static void sendMessage_mapsPermissionError() {
    String code = AgentforceService.deriveErrorCode('permission denied');
    System.assertNotEquals(null, code);
  }

  @IsTest
  static void sendMessage_mapsTimeoutError() {
    String code = AgentforceService.deriveErrorCode('timeout while invoking');
    System.assertNotEquals(null, code);
    System.assertNotEquals(null, AgentforceService.isRetryableCode(code));
  }
}
