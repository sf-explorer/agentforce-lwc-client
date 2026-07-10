Invocable.Action action = Invocable.Action.createCustomAction(
    'generateAiAgentResponse',
    null,
    'CRM_Assistant',
    '1.1.0'
);
action.setInvocationParameter('userMessage', 'Inspect raw result payload');
action.setInvocationParameter('sessionId', null);

List<Invocable.Action.Result> results = action.invoke();
System.debug('INSPECT_RESULTS_SIZE=' + (results == null ? null : results.size()));

if (results != null && !results.isEmpty()) {
    Invocable.Action.Result r = results[0];
    System.debug('INSPECT_IS_SUCCESS=' + r.isSuccess());
    System.debug(
        'INSPECT_ERRORS_JSON=' +
        JSON.serializePretty(r.getErrors())
    );

    Map<String, Object> out = r.getOutputParameters();
    System.debug('INSPECT_OUTPUT_KEYS=' + (out == null ? null : out.keySet()));
    System.debug('INSPECT_OUTPUT_JSON=' + JSON.serializePretty(out));

    if (out != null) {
        if (out.containsKey('response')) {
            System.debug('INSPECT_RESPONSE_VALUE=' + String.valueOf(out.get('response')));
        }
        if (out.containsKey('value')) {
            System.debug('INSPECT_VALUE_VALUE=' + JSON.serializePretty(out.get('value')));
        }
        if (out.containsKey('result')) {
            System.debug('INSPECT_RESULT_VALUE=' + JSON.serializePretty(out.get('result')));
        }
        if (out.containsKey('data')) {
            System.debug('INSPECT_DATA_VALUE=' + JSON.serializePretty(out.get('data')));
        }
        if (out.containsKey('sessionId')) {
            System.debug('INSPECT_SESSIONID_VALUE=' + String.valueOf(out.get('sessionId')));
        }
    }
}
