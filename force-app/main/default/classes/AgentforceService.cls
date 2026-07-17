/**
 * Facade service for invoking Agentforce from Lightning Web Components.
 * This class validates client input, calls the supported Agentforce invocable action,
 * and returns a normalized response contract to the UI layer.
 */
public with sharing class AgentforceService {
  private static final Integer MAX_MESSAGE_LENGTH = 4000;
  private static final String ACTION_TYPE = 'generateAiAgentResponse';
  private static final String ACTION_NAME = 'generateAiAgentResponse';

  /**
   * DTO that represents a chat message.
   */
  public class ChatMessage {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String role;
    @AuraEnabled
    public String content;
    @AuraEnabled
    public Datetime timestamp;
  }

  /**
   * DTO that represents an Agentforce citation.
   */
  public class Citation {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String url;
    @AuraEnabled
    public String snippet;
    @AuraEnabled
    public String sourceType;
    @AuraEnabled
    public Integer offsetStart;
    @AuraEnabled
    public Integer offsetEnd;
  }

  /**
   * Top-level response DTO returned to LWC.
   */
  public class AgentResponse {
    @AuraEnabled
    public ChatMessage message;
    @AuraEnabled
    public String sessionId;
    @AuraEnabled
    public String requestId;
    @AuraEnabled
    public List<Citation> citations;
    @AuraEnabled
    public String errorCode;
    @AuraEnabled
    public Boolean retryable;
  }

  /**
   * Agent definition metadata exposed to the LWC picker.
   */
  public class AgentDefinitionOption {
    @AuraEnabled
    public String agentApiName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Datetime lastModifiedDate;
  }

  /**
   * Internal normalized invocation result.
   */
  public class InvocationResult {
    public String responseText;
    public String sessionId;
    public String requestId;
    public List<Citation> citations;
  }

  /**
   * Strategy interface used to allow deterministic unit testing.
   */
  public interface AgentInvoker {
    InvocationResult invoke(
      String agentApiName,
      String userMessage,
      String sessionId
    );
  }

  /**
   * Default invoker that uses the supported invocable action mechanism.
   */
  public class DefaultAgentInvoker implements AgentInvoker {
    public InvocationResult invoke(
      String agentApiName,
      String userMessage,
      String sessionId
    ) {
      Invocable.Action action = Invocable.Action.createCustomAction(
        ACTION_TYPE,
        null,
        agentApiName,
        '1.1.0'
      );
      action.setInvocationParameter('userMessage', userMessage);
      if (!String.isBlank(sessionId)) {
        action.setInvocationParameter('sessionId', sessionId);
      }

      List<Invocable.Action.Result> actionResults = action.invoke();
      if (actionResults == null || actionResults.isEmpty()) {
        throw new AgentforceServiceException(
          'Agentforce invocation returned no result.'
        );
      }

      Invocable.Action.Result actionResult = actionResults[0];
      if (!actionResult.isSuccess()) {
        String invocationError = actionResult.getErrors() != null &&
          !actionResult.getErrors().isEmpty()
          ? actionResult.getErrors()[0].getMessage()
          : 'Agentforce invocation failed.';
        throw new AgentforceServiceException(invocationError);
      }

      Map<String, Object> output = actionResult.getOutputParameters();
      InvocationResult normalized = new InvocationResult();
      normalized.responseText = resolveResponseText(output);
      normalized.sessionId = safeToString(output.get('sessionId'));
      normalized.requestId = safeToString(output.get('requestId'));
      normalized.citations = parseCitations(output.get('citations'));
      return normalized;
    }
  }

  public class AgentforceServiceException extends Exception {
  }

  @TestVisible
  private static AgentInvoker invoker = new DefaultAgentInvoker();

  /**
   * Invokes an Agentforce agent and returns a normalized response for UI clients.
   *
   * @param agentApiName Agent API name configured in Agentforce.
   * @param message User message content to send.
   * @param sessionId Existing session id, optional.
   * @return AgentResponse containing assistant message and session context.
   * @throws AuraHandledException when validation or invocation fails.
   */
  @AuraEnabled
  public static AgentResponse sendMessage(
    String agentApiName,
    String message,
    String sessionId
  ) {
    try {
      validateInput(agentApiName, message);

      InvocationResult result = invoker.invoke(
        agentApiName.trim(),
        message.trim(),
        String.isBlank(sessionId) ? null : sessionId.trim()
      );

      AgentResponse response = new AgentResponse();
      response.message = new ChatMessage();
      response.message.id = generateMessageId();
      response.message.role = 'assistant';
      response.message.content = String.isBlank(result.responseText)
        ? 'I was unable to generate a response.'
        : result.responseText;
      response.message.timestamp = Datetime.now();
      response.sessionId = result.sessionId;
      response.requestId = result.requestId;
      response.citations = result.citations == null
        ? new List<Citation>()
        : result.citations;
      response.retryable = false;
      return response;
    } catch (Exception ex) {
      throw toAuraHandledException(ex);
    }
  }

  /**
   * Returns agent definitions from BotDefinition metadata.
   *
   * @return List of configured agent definitions for picker UX.
   */
  @AuraEnabled(cacheable=true)
  public static List<AgentDefinitionOption> getConfiguredAgents() {
    List<BotDefinition> definitions = [
      SELECT
        Id,
        DeveloperName,
        MasterLabel,
        Description,
        LastModifiedDate,
        AgentType
      FROM BotDefinition
      WHERE AgentType = 'AgentforceEmployeeAgent'
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
      LIMIT 20
    ];

    List<AgentDefinitionOption> options = new List<AgentDefinitionOption>();
    for (BotDefinition definition : definitions) {
      AgentDefinitionOption option = new AgentDefinitionOption();
      option.agentApiName = definition.DeveloperName;
      option.label = String.isBlank(definition.MasterLabel)
        ? definition.DeveloperName
        : definition.MasterLabel;
      option.description = definition.Description;
      option.lastModifiedDate = definition.LastModifiedDate;
      if (!String.isBlank(option.agentApiName)) {
        options.add(option);
      }
    }
    return options;
  }

  /**
   * Returns available Agentforce agent API names.
   *
   * @return Unique sorted list of available agent API names.
   */
  @AuraEnabled
  public static List<String> getConfiguredAgentApiNames() {
    Set<String> uniqueNames = new Set<String>();
    for (AgentDefinitionOption option : getConfiguredAgents()) {
      if (option != null && !String.isBlank(option.agentApiName)) {
        uniqueNames.add(option.agentApiName);
      }
    }
    List<String> names = new List<String>(uniqueNames);
    names.sort();
    return names;
  }

  @TestVisible
  private static Map<String, Object> buildActionInputs(
    String agentApiName,
    String userMessage,
    String sessionId
  ) {
    Map<String, Object> input = new Map<String, Object>{
      'agentName' => agentApiName,
      'userMessage' => userMessage
    };
    if (!String.isBlank(sessionId)) {
      input.put('sessionId', sessionId);
    }
    return new Map<String, Object>{ 'inputs' => new List<Object>{ input } };
  }

  @TestVisible
  private static Map<String, Object> extractOutputFromRestResponse(
    String responseBody
  ) {
    if (String.isBlank(responseBody)) {
      throw new AgentforceServiceException(
        'Agentforce invocation returned empty response.'
      );
    }

    Object raw = JSON.deserializeUntyped(responseBody);
    if (!(raw instanceof Map<String, Object>)) {
      throw new AgentforceServiceException(
        'Unexpected Agentforce response format.'
      );
    }

    Map<String, Object> body = (Map<String, Object>) raw;
    Object resultsObject = body.get('results');
    if (!(resultsObject instanceof List<Object>)) {
      throw new AgentforceServiceException(
        'Agentforce response missing results.'
      );
    }

    List<Object> results = (List<Object>) resultsObject;
    if (results.isEmpty() || !(results[0] instanceof Map<String, Object>)) {
      throw new AgentforceServiceException(
        'Agentforce response contains no result item.'
      );
    }

    Map<String, Object> firstResult = (Map<String, Object>) results[0];
    Object successValue = firstResult.get('isSuccess');
    if (successValue != null && !(Boolean) successValue) {
      String errorMessage = safeToString(firstResult.get('message'));
      if (String.isBlank(errorMessage)) {
        errorMessage = safeToString(firstResult.get('errorMessage'));
      }
      if (String.isBlank(errorMessage)) {
        errorMessage = 'Agentforce invocation failed.';
      }
      throw new AgentforceServiceException(errorMessage);
    }

    if (firstResult.get('outputValues') instanceof Map<String, Object>) {
      return (Map<String, Object>) firstResult.get('outputValues');
    }

    Map<String, Object> passthrough = new Map<String, Object>();
    if (firstResult.get('response') != null) {
      passthrough.put('response', firstResult.get('response'));
    }
    if (firstResult.get('agentResponse') != null) {
      passthrough.put('agentResponse', firstResult.get('agentResponse'));
    }
    if (firstResult.get('sessionId') != null) {
      passthrough.put('sessionId', firstResult.get('sessionId'));
    }
    if (firstResult.get('requestId') != null) {
      passthrough.put('requestId', firstResult.get('requestId'));
    }
    if (firstResult.get('citations') != null) {
      passthrough.put('citations', firstResult.get('citations'));
    }
    return passthrough;
  }

  @TestVisible
  private static void validateInput(String agentApiName, String message) {
    if (String.isBlank(agentApiName)) {
      throw new AgentforceServiceException(
        'INVALID_INPUT: agentApiName is required.'
      );
    }
    if (String.isBlank(message)) {
      throw new AgentforceServiceException(
        'INVALID_INPUT: message is required.'
      );
    }
    if (message.length() > MAX_MESSAGE_LENGTH) {
      throw new AgentforceServiceException(
        'INVALID_INPUT: message exceeds maximum length.'
      );
    }
  }

  @TestVisible
  private static AuraHandledException toAuraHandledException(Exception ex) {
    String message = ex == null ? 'Unknown error.' : ex.getMessage();
    String code = deriveErrorCode(message);
    Boolean retryable = isRetryableCode(code);

    String safeMessage = code + ': ' + userSafeMessage(code);
    if (retryable) {
      safeMessage += ' Please retry.';
    }

    return new AuraHandledException(safeMessage);
  }

  @TestVisible
  private static String deriveErrorCode(String message) {
    if (String.isBlank(message)) {
      return 'UNKNOWN_ERROR';
    }
    String lowered = message.toLowerCase();
    if (
      lowered.contains('invalid_agent') || lowered.contains('invalid agent')
    ) {
      return 'INVALID_AGENT';
    }
    if (lowered.contains('permission')) {
      return 'PERMISSION_DENIED';
    }
    if (lowered.contains('timeout')) {
      return 'TIMEOUT';
    }
    if (lowered.contains('session') && lowered.contains('expired')) {
      return 'SESSION_EXPIRED';
    }
    if (
      lowered.contains('limit') ||
      lowered.contains('too many') ||
      lowered.contains('governor')
    ) {
      return 'GOVERNOR_LIMIT';
    }
    if (lowered.contains('unavailable')) {
      return 'AGENT_UNAVAILABLE';
    }
    if (lowered.startsWith('invalid_input')) {
      return 'INVALID_INPUT';
    }
    return 'UNKNOWN_ERROR';
  }

  @TestVisible
  private static Boolean isRetryableCode(String code) {
    return code == 'TIMEOUT' ||
      code == 'SESSION_EXPIRED' ||
      code == 'GOVERNOR_LIMIT' ||
      code == 'AGENT_UNAVAILABLE';
  }

  @TestVisible
  private static String userSafeMessage(String code) {
    if (code == 'INVALID_INPUT') {
      return 'Please review your input and try again.';
    }
    if (code == 'INVALID_AGENT') {
      return 'The configured agent could not be found.';
    }
    if (code == 'PERMISSION_DENIED') {
      return 'You do not have permission to use this agent.';
    }
    if (code == 'TIMEOUT') {
      return 'The request timed out.';
    }
    if (code == 'SESSION_EXPIRED') {
      return 'The conversation session expired.';
    }
    if (code == 'GOVERNOR_LIMIT') {
      return 'The platform is temporarily busy.';
    }
    if (code == 'AGENT_UNAVAILABLE') {
      return 'The agent is currently unavailable.';
    }
    return 'Something went wrong while contacting the agent.';
  }

  @TestVisible
  private static String safeToString(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  @TestVisible
  private static String resolveResponseText(Map<String, Object> output) {
    if (output == null) {
      return null;
    }

    String responseText = safeToString(output.get('response'));
    if (!String.isBlank(responseText)) {
      return responseText;
    }

    if (
      !output.containsKey('agentResponse') ||
      output.get('agentResponse') == null
    ) {
      return null;
    }

    try {
      Object parsed = JSON.deserializeUntyped(
        safeToString(output.get('agentResponse'))
      );
      if (!(parsed instanceof Map<String, Object>)) {
        return null;
      }

      Map<String, Object> agentResponse = (Map<String, Object>) parsed;
      if (!(agentResponse.get('value') instanceof Map<String, Object>)) {
        return null;
      }

      Map<String, Object> valueMap = (Map<String, Object>) agentResponse.get(
        'value'
      );
      return safeToString(valueMap.get('message'));
    } catch (Exception ex) {
      return null;
    }
  }

  @TestVisible
  private static String generateMessageId() {
    return String.valueOf(Crypto.getRandomLong()).replace('-', '');
  }

  @TestVisible
  private static List<Citation> parseCitations(Object rawCitations) {
    List<Citation> parsed = new List<Citation>();
    if (rawCitations == null || !(rawCitations instanceof List<Object>)) {
      return parsed;
    }

    List<Object> values = (List<Object>) rawCitations;
    for (Object value : values) {
      if (!(value instanceof Map<String, Object>)) {
        continue;
      }
      Map<String, Object> rawCitation = (Map<String, Object>) value;
      Citation citation = new Citation();
      citation.id = safeToString(rawCitation.get('id'));
      citation.title = safeToString(rawCitation.get('title'));
      citation.url = safeToString(rawCitation.get('url'));
      citation.snippet = safeToString(rawCitation.get('snippet'));
      citation.sourceType = safeToString(rawCitation.get('sourceType'));
      citation.offsetStart = toInteger(rawCitation.get('offsetStart'));
      citation.offsetEnd = toInteger(rawCitation.get('offsetEnd'));
      parsed.add(citation);
    }
    return parsed;
  }

  @TestVisible
  private static Integer toInteger(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return Integer.valueOf(String.valueOf(value));
    } catch (Exception ex) {
      return null;
    }
  }
}
