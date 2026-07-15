public with sharing class CoworkerSkillsController {
  @AuraEnabled(cacheable=true)
  public static List<Coworker_Skill__mdt> getSkills() {
    return [
      SELECT
        Id,
        MasterLabel,
        DeveloperName,
        Category__c,
        Content__c,
        Expected_Result__c,
        Agents__c
      FROM Coworker_Skill__mdt
      ORDER BY Category__c, MasterLabel
    ];
  }
}
