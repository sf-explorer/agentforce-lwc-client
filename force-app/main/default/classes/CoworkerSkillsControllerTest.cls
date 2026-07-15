@isTest
private class CoworkerSkillsControllerTest {
  @isTest
  static void testGetSkills() {
    // Custom metadata can't be inserted in tests, but we can test the method runs
    Test.startTest();
    List<Coworker_Skill__mdt> skills = CoworkerSkillsController.getSkills();
    Test.stopTest();

    // Should return a list (might be empty if no metadata records exist)
    System.assertNotEquals(null, skills, 'Skills list should not be null');
  }
}
