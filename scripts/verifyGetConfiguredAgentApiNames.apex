List<String> names = AgentforceService.getConfiguredAgentApiNames();
System.debug(LoggingLevel.ERROR, 'AGENT_NAMES=' + JSON.serialize(names));
