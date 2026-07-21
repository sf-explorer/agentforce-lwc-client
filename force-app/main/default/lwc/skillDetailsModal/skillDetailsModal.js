import { api, LightningElement } from "lwc";

export default class SkillDetailsModal extends LightningElement {
  @api skill;

  get modalHeader() {
    return this.skill?.MasterLabel || "";
  }

  get modalExpectedResult() {
    return this.skill?.Expected_Result__c || "No expected result specified.";
  }

  get modalContent() {
    return this.skill?.Content__c || "";
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  handleLaunchCoworker() {
    this.dispatchEvent(
      new CustomEvent("launchagent", {
        detail: {
          mode: "coworker",
          content: this.modalContent
        }
      })
    );
  }
}
