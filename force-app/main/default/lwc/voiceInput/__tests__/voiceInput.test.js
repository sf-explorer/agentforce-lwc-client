import { createElement } from "lwc";
import VoiceInput from "c/voiceInput";

const flushPromises = () => Promise.resolve();

describe("c-voice-input", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows unsupported message when speech recognition is unavailable", async () => {
    const previousSpeechRecognition = window.SpeechRecognition;
    const previousWebkitSpeechRecognition = window.webkitSpeechRecognition;
    const previousSecureContext = window.isSecureContext;
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true
    });
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;

    const element = createElement("c-voice-input", { is: VoiceInput });
    document.body.appendChild(element);
    await flushPromises();

    const status = element.shadowRoot.querySelector(".voice-input__status");
    expect(status.textContent).toContain("not supported");

    window.SpeechRecognition = previousSpeechRecognition;
    window.webkitSpeechRecognition = previousWebkitSpeechRecognition;
    Object.defineProperty(window, "isSecureContext", {
      value: previousSecureContext,
      configurable: true
    });
  });
});
