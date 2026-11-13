# Privacy Policy for Ciyper

**Last Updated:** November 14, 2026

Your privacy and data sovereignty are fundamental architectural principles of **Ciyper**. This Privacy Policy explains how Ciyper handles information, emphasizing our local-first, zero-telemetry architecture.

---

### 1. 100% Local-First Storage (Zero Central Servers)
- **No External Servers:** Ciyper does not operate any centralized servers, user accounts, remote databases, or cloud analytics services.
- **Local Device Storage:** All your configurations, API keys, uploaded resume files, context documents, and session histories are stored strictly and exclusively on your local device:
  - **Windows Location:** `%APPDATA%\Ciyper\database.json`
- **Data Sovereignty:** You have total control over your data. When you delete a session, context file, or API key in Ciyper, it is permanently removed from your local storage immediately.

---

### 2. Audio & Screen Processing (Ephemeral In-Memory Only)
- **Microphone Audio:** When audio listening is enabled, speech is captured in real-time through your hardware microphone to detect interview dialogue. Audio data is streamed directly to the AI provider and processed in volatile memory (RAM). Audio is **never recorded or saved as audio files** to your disk.
- **Screen Capture:** When you capture a screenshot, the image is held in temporary memory solely for the active query turn to provide vision assistance. Raw image files and base64 strings are **never persisted** to your local database or transmitted to any third party other than the designated API provider.

---

### 3. Bring Your Own Key (BYOK) & AI Provider Communication
- **Direct Provider Connection:** Ciyper connects directly from your local computer to the Groq Cloud API endpoint (`https://api.groq.com/openai/v1`).
- **Your Own Credentials:** Requests are authenticated exclusively using your personal API keys provided in the Settings panel. The creators of Ciyper have zero access to your API keys, your prompt inputs, or the generated responses.
- **Provider Policies:** Data transmitted to Groq is governed by [Groq's Privacy Policy](https://groq.com/privacy-policy/) and data processing agreements.

---

### 4. Zero Tracking, Telemetry, or Analytics
- Ciyper contains **zero** third-party tracking scripts, analytics SDKs (e.g. Google Analytics, Mixpanel), crash report telemetry, or advertising beacons.
- Ciyper does **not** track your identity, your session length, or your usage habits.
- Ciyper does **not** sell, rent, monetize, or disclose user data under any circumstances.

---

### 5. Content Protection & Invisible Mode
- When **Invisible Mode** is active, Ciyper utilizes native Windows OS window display affinity flags (`WDA_EXCLUDEFROMCAPTURE`) to safeguard the application window from being captured in desktop screenshots, screen recordings, or video conference screen shares.

---

### 6. Contact
If you have questions regarding Ciyper's privacy architecture, please open an issue on the official GitHub repository.
