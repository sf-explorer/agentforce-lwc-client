@isTest
private class CoworkerSkillsControllerTest {
  @isTest
  static void testGetSkills() {
    // Custom metadata records can't be inserted in tests, so this compares
    // against the records deployed in the org. If the org has no inactive
    // records, the exclusion of inactive skills is not actually exercised.
    Integer total = [SELECT COUNT() FROM Coworker_Skill__mdt];
    Integer inactive = [
      SELECT COUNT()
      FROM Coworker_Skill__mdt
      WHERE Active__c = false
    ];

    Test.startTest();
    List<Coworker_Skill__mdt> skills = CoworkerSkillsController.getSkills();
    Test.stopTest();

    System.assertNotEquals(null, skills, 'Skills list should not be null');
    System.assertEquals(
      total - inactive,
      skills.size(),
      'Inactive skills should be excluded'
    );
  }
}
