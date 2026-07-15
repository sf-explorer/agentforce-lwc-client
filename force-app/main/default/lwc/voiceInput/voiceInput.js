import { LightningElement, api } from "lwc";

const VOICE_RETRY_DELAY_MS = 800;

export default class VoiceInput extends LightningElement {
  @api disabled = false;
  @api language = "en-US";
  @api baseText = "";

  speechRecognition;
  voiceDraftPrefix = "";
  voiceSupported = false;
  voiceErrorMessage = "";
  isVoiceListening = false;
  isVoiceRetrying = false;
  voiceRetryCount = 0;
  maxVoiceRetries = 1;
  voiceRetryTimeoutId = null;

  connectedCallback() {
    this.initializeVoiceInput();
  }

  disconnectedCallback() {
    this.stopVoiceCapture();
    this.clearVoiceRetryTimer();
    this.speechRecognition = null;
  }

  get canUseVoiceInput() {
    return this.voiceSupported;
  }

  get voiceButtonIconName() {
    return this.isVoiceListening ? "utility:stop" : "utility:record";
  }

  get voiceButtonTitle() {
    return this.isVoiceListening ? "Stop voice capture" : "Capture voice";
  }

  get voiceStatusText() {
    if (this.voiceErrorMessage) {
      return this.voiceErrorMessage;
    }
    if (!this.voiceSupported) {
      return "Voice capture unavailable in this browser.";
    }
    if (this.isVoiceListening) {
      return "Listening... speak now.";
    }
    if (this.isVoiceRetrying) {
      return "Reconnecting voice capture...";
    }
    return "";
  }

  get hasVoiceStatus() {
    return Boolean(this.voiceStatusText);
  }

  get voiceStatusClass() {
    return this.voiceErrorMessage
      ? "voice-input__status voice-input__status_error"
      : "voice-input__status";
  }

  get showVoiceRetryAction() {
    return Boolean(
      this.voiceErrorMessage && !this.isVoiceListening && !this.isVoiceRetrying
    );
  }

  handleVoiceToggle() {
    if (this.disabled || !this.canUseVoiceInput) {
      return;
    }
    if (this.isVoiceListening) {
      this.stopVoiceCapture();
      return;
    }
    this.startVoiceCapture();
  }

  handleVoiceRetryClick() {
    if (this.disabled || !this.canUseVoiceInput) {
      return;
    }
    this.startVoiceCapture();
  }

  initializeVoiceInput() {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.isSecureContext) {
      this.voiceSupported = false;
      this.voiceErrorMessage =
        "Voice capture requires a secure context (HTTPS Salesforce domain).";
      return;
    }
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.voiceSupported = false;
      this.voiceErrorMessage =
        "Voice capture is not supported in this browser. Try Chrome or Edge.";
      return;
    }
    this.voiceSupported = true;
    this.voiceErrorMessage = "";
    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = this.language || "en-US";

    this.speechRecognition.onstart = () => {
      this.isVoiceListening = true;
      this.isVoiceRetrying = false;
      this.voiceErrorMessage = "";
    };
    this.speechRecognition.onresult = (event) => {
      this.applyVoiceResult(event);
    };
    this.speechRecognition.onerror = (event) => {
      this.voiceErrorMessage = this.mapVoiceError(event?.error);
      this.isVoiceListening = false;
      this.dispatchEvent(
        new CustomEvent("voiceerror", {
          detail: {
            message: this.voiceErrorMessage,
            code: event?.error || "UNKNOWN"
          }
        })
      );
    };
    this.speechRecognition.onend = () => {
      this.isVoiceListening = false;
    };
  }

  startVoiceCapture({ isRetry = false } = {}) {
    if (!this.speechRecognition) {
      return;
    }
    if (!isRetry) {
      this.voiceRetryCount = 0;
      this.isVoiceRetrying = false;
      this.clearVoiceRetryTimer();
    }
    this.voiceDraftPrefix = (this.baseText || "").trim();
    if (this.voiceDraftPrefix) {
      this.voiceDraftPrefix = `${this.voiceDraftPrefix} `;
    }
    this.voiceErrorMessage = "";
    try {
      this.speechRecognition.lang = this.language || "en-US";
      this.speechRecognition.start();
    } catch (error) {
      if (isRetry && this.isRetryableVoiceStartException(error)) {
        this.scheduleVoiceRetry();
        return;
      }
      this.voiceErrorMessage = this.mapVoiceStartException(error);
    }
  }

  stopVoiceCapture() {
    this.isVoiceRetrying = false;
    this.clearVoiceRetryTimer();
    if (!this.speechRecognition) {
      return;
    }
    if (this.isVoiceListening) {
      this.speechRecognition.stop();
    }
  }

  applyVoiceResult(event) {
    if (!event?.results) {
      return;
    }
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript || "";
    }
    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("transcript", {
        detail: {
          text: `${this.voiceDraftPrefix}${normalizedTranscript}`.trim()
        }
      })
    );
  }

  mapVoiceError(errorCode) {
    if (errorCode === "network" && this.scheduleVoiceRetry()) {
      return "Network issue while transcribing speech. Retrying...";
    }
    switch (errorCode) {
      case "aborted":
        return "Voice capture was interrupted.";
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone access denied.";
      case "no-speech":
        return "No speech detected. Try again.";
      case "audio-capture":
        return "No microphone detected.";
      case "network":
        return "Network issue while transcribing speech. Please try again.";
      case "language-not-supported":
        return `Voice language "${this.language}" is not supported.`;
      default:
        return "Voice capture failed.";
    }
  }

  mapVoiceStartException(error) {
    const name = error?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Microphone permission blocked. Allow microphone access and retry.";
    }
    if (name === "InvalidStateError") {
      return "Voice capture is already running.";
    }
    if (name === "NotSupportedError") {
      return "Voice capture is not supported in this browser.";
    }
    return "Unable to start voice capture.";
  }

  isRetryableVoiceStartException(error) {
    const name = error?.name || "";
    return name === "NetworkError" || name === "AbortError" || name === "";
  }

  scheduleVoiceRetry() {
    if (this.voiceRetryCount >= this.maxVoiceRetries) {
      this.isVoiceRetrying = false;
      return false;
    }
    this.voiceRetryCount += 1;
    this.isVoiceRetrying = true;
    this.clearVoiceRetryTimer();
    this.voiceRetryTimeoutId = setTimeout(() => {
      this.voiceRetryTimeoutId = null;
      this.startVoiceCapture({ isRetry: true });
    }, VOICE_RETRY_DELAY_MS);
    return true;
  }

  clearVoiceRetryTimer() {
    if (this.voiceRetryTimeoutId) {
      clearTimeout(this.voiceRetryTimeoutId);
      this.voiceRetryTimeoutId = null;
    }
  }
}
