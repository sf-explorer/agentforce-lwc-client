import { LightningElement, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getSkills from "@salesforce/apex/CoworkerSkillsController.getSkills";

export default class CoworkerSkills extends NavigationMixin(LightningElement) {
  launchAgent(content) {
    const encodedContent = encodeURIComponent(content || "");
    const timestamp = Date.now();
    const baseUrl = window.location.origin;
    const agentSearchUrl = `${baseUrl}/lightning/search/agent?c__term=${encodedContent}&c__ts=${timestamp}`;

    this[NavigationMixin.Navigate]({
      type: "standard__webPage",
      attributes: {
        url: agentSearchUrl
      }
    });
  }

  skills = [];
  groupedSkills = {};
  error;
  selectedSkill = null;
  showModal = false;
  showCreateModal = false;
  isGenerating = false;

  // Create/Edit form fields
  intention = "";
  selectedCategory = "";
  generatedTitle = "";
  generatedExpectedResult = "";
  generatedContent = "";
  agents = "";
  editingSkillId = null;

  @wire(getSkills)
  wiredSkills({ error, data }) {
    if (data) {
      this.skills = data;
      this.groupedSkills = this.groupSkillsByCategory(data);
      this.error = undefined;
    } else if (error) {
      this.error = error;
      this.skills = [];
      this.groupedSkills = {};
    }
  }

  groupSkillsByCategory(skills) {
    const grouped = {};
    const categoryIcons = {
      "Service Client": "standard:service_crew",
      "Gestion Commerciale": "standard:opportunity",
      "Gestion des Sinistres": "standard:case",
      Productivité: "standard:today"
    };

    skills.forEach((skill) => {
      const category = skill.Category__c || "Other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      // Create new object instead of mutating wire data
      let icon = "";
      if (skill.Agents__c === "Solaris Claims Agent") {
        icon = "standard:case_log_a_call";
      } else if (skill.Agents__c === "Magic Argument Agent") {
        icon = "utility:comments";
      }

      const skillWithIcon = {
        ...skill,
        icon
      };
      grouped[category].push(skillWithIcon);
    });

    // Convert to array for iteration in template
    return Object.keys(grouped).map((category) => ({
      category: category,
      icon: categoryIcons[category] || "standard:default",
      skills: grouped[category]
    }));
  }

  handleInfoClick(event) {
    event.stopPropagation();
    const skillId = event.currentTarget.dataset.id;
    this.selectedSkill = this.skills.find((s) => s.Id === skillId);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedSkill = null;
  }

  handleModalAction(event) {
    const mode = event.detail?.mode || "coworker";
    if (mode === "coworker") {
      const content = event.detail?.content || this.selectedSkill?.Content__c || "";
      this.launchAgent(content);
    }
    this.closeModal();
  }

  handleModalError(event) {
    const message =
      event.detail?.message || "Unable to launch Agentforce from this skill.";
    this.showToast("Agent Launch Failed", message, "error");
  }

  get hasSkills() {
    return this.skills && this.skills.length > 0;
  }

  get categories() {
    return this.groupedSkills;
  }

  get categoryOptions() {
    const categories = new Set(
      (this.skills || []).map((skill) => skill.Category__c).filter(Boolean)
    );

    // Keep currently selected value visible even if dataset changed.
    if (this.selectedCategory) {
      categories.add(this.selectedCategory);
    }

    return Array.from(categories)
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
      .map((category) => ({
        label: category,
        value: category
      }));
  }

  get canGenerate() {
    return this.intention && this.selectedCategory && !this.isGenerating;
  }

  get hasGeneratedSkill() {
    return this.generatedTitle && this.generatedContent;
  }

  handleCreateNew() {
    this.showCreateModal = true;
    this.editingSkillId = null;
    this.resetForm();
  }

  handleEditSkill(event) {
    event.stopPropagation();
    const skillId = event.currentTarget.dataset.id;
    const skill = this.skills.find((s) => s.Id === skillId);

    if (skill) {
      this.editingSkillId = skillId;
      this.generatedTitle = skill.MasterLabel;
      this.selectedCategory = skill.Category__c;
      this.generatedExpectedResult = skill.Expected_Result__c || "";
      this.generatedContent = skill.Content__c;
      this.showCreateModal = true;
    }
  }

  handleIntentionChange(event) {
    this.intention = event.target.value;
  }

  handleCategoryChange(event) {
    this.selectedCategory = event.detail.value;
  }

  handleTitleChange(event) {
    this.generatedTitle = event.target.value;
  }

  handleExpectedResultChange(event) {
    this.generatedExpectedResult = event.target.value;
  }

  handleContentChange(event) {
    this.generatedContent = event.target.value;
  }

  handleSaveSkill() {
    // Since we can't create custom metadata via Apex, show instructions
    const developerName = this.generatedTitle.replace(/[^a-zA-Z0-9]/g, "_");

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<CustomMetadata xmlns="http://soap.sforce.com/2006/04/metadata" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <label>${this.generatedTitle}</label>
    <protected>false</protected>
    <values>
        <field>Category__c</field>
        <value xsi:type="xsd:string">${this.selectedCategory}</value>
    </values>
    <values>
        <field>Expected_Result__c</field>
        <value xsi:type="xsd:string">${this.generatedExpectedResult}</value>
    </values>
    <values>
        <field>Content__c</field>
        <value xsi:type="xsd:string">${this.generatedContent}</value>
    </values>
</CustomMetadata>`;

    // Copy to clipboard
    this.copyToClipboard(xmlContent);

    this.showToast(
      "Instructions",
      `XML copied to clipboard! Create file: force-app/main/default/customMetadata/Coworker_Skill.${developerName}.md-meta.xml and deploy.`,
      "info",
      10000
    );

    this.closeCreateModal();
  }

  copyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  closeCreateModal() {
    this.showCreateModal = false;
    this.resetForm();
  }

  resetForm() {
    this.intention = "";
    this.selectedCategory = "";
    this.generatedTitle = "";
    this.generatedExpectedResult = "";
    this.generatedContent = "";
    this.editingSkillId = null;
  }

  showToast(title, message, variant, duration = 5000) {
    this.dispatchEvent(
      new ShowToastEvent({
        title,
        message,
        variant,
        mode: duration > 5000 ? "sticky" : "dismissable",
        duration
      })
    );
  }
}
