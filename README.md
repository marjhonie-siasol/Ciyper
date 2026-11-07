# 🎙️ Co-Assist AI

<div align="center">

**A discreet, privacy-first desktop AI copilot designed for live job interviews and meetings.**

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](https://github.com)
[![Electron](https://img.shields.io/badge/Electron-31.0.0-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![AI Models](https://img.shields.io/badge/Groq%20Cloud-GPT--OSS%20120B%20%2F%2020B-F55036?style=flat-square)](https://groq.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red?style=flat-square)](https://github.com)

</div>

---

## 🌟 Overview

**Co-Assist AI** is an open-source desktop copilot built to give candidates and professionals real-time assistance during live job interviews and meetings. Powered by **Groq Cloud's ultra-low latency inference engine**, Co-Assist AI delivers concise, natural, first-person answers tailored specifically to your real experience, skills, and background.

It floats as a sleek, transparent, always-on-top pill widget that sits discreetly above your meeting screen, ready to transcribe speech, answer questions, or provide technical solutions without interrupting your flow.

---

## ✨ Key Features

### ⚡ Powered by Free Groq Cloud AI Models
- Leverage high-speed production models including **OpenAI GPT-OSS 120B** (ideal for deep technical reasoning, algorithms, and system design at ~500 tps) and **OpenAI GPT-OSS 20B** (optimized for lightning-fast meeting responses and conversational banter at ~1,000 tps). Also supports **Qwen 3.8 27B** for agentic coding.
- Detailed model guide in the dashboard explains the pros, cons, context limits, and token speeds of each model to help you pick the best fit.
- Free tier available directly from [Groq Cloud](https://console.groq.com/keys)—no paid subscriptions required.

### 🛡️ Triple-Tier API Key Failover (Zero Interruptions)
- Add up to **3 Groq API keys** (Primary, Backup 1, and Backup 2).
- If your primary key hits a rate limit or encounters a network hiccup mid-interview, Co-Assist AI **automatically fails over to your backup keys** seamlessly in real time so your session never gets cut off.

### 🔒 100% Privacy & Local Storage
- **No account creation or login required.**
- All sensitive information—including your resume, context files, API keys, and session logs—is saved **100% locally on your machine** (`database.json`).
- Zero telemetry, zero tracking, and zero data sent to external servers or the developer. Your data belongs exclusively to you.

### 🎭 AI Persona & Credibility Context Files (`.txt`)
- **Resume Upload (`.txt`)**: Attach your resume so the assistant knows your previous companies, roles, metrics, and accomplishments.
- **Custom Context & Credibility File (`.txt`)**: Attach a comprehensive context file detailing your specialization, tech stack, methodologies, and specific project anecdotes.
- The assistant is system-instructed to speak **strictly in the first person ("I", "my team", "at my last role")**, answering with concise, human-like responses (3–5 sentences) without textbook jargon or unnatural filler.

### 👻 "Invisible Mode" (Screen Sharing & Screenshot Shield)
- Built-in hardware-level display protection using Electron's `setContentProtection`.
- When turned **ON**, the application window is completely masked from screen recording and video calls (Zoom, Microsoft Teams, Google Meet, Discord, OBS, etc.), keeping your assistant completely private during presentations and interviews.

### 📊 Visual API Analytics & Health Monitoring
- Integrated dashboard tracking weekly query volumes and individual health statuses across your Primary and Backup API keys.
- Quick visual indicators let you know if keys are Healthy, Degraded, or Unused before you begin an important meeting.

### 💬 Minimalist Floating Widget
- **Top Pill Bar**: Includes an animated audio visualizer, a live session duration timer, quick minimize/expand toggles, and session controls.
- **Expandable Chat Panel**: Easily expand to review responses or collapse out of view with a single click.
- **Audio Capture & Real-Time Transcription**: Built-in speech capture powered by Whisper models on Groq to capture interviewer questions on the fly.

### 🔇 Intelligent Audio & Non-Human Noise Filtering
- **Zero Accidental Responses**: During live sessions, the app actively filters out non-human sounds such as notification dings, chime sounds, bells, background music, ringtones, or ambient room noises.
- **Human-Voice Only Triggering**: The AI will **not respond** to random sound effects or background tones. It strictly evaluates authentic human speech before analyzing and responding, ensuring it never blurt out answers to system alerts, Slack/Teams notifications, or accidental noises during your meeting.

### 📚 Session History
- Every session is automatically archived locally with timestamps, duration, and generated session titles for post-interview review and learning.

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [npm](https://www.npmjs.com/) (bundled with Node.js)
* A free **Groq Cloud API Key** (Get one at [console.groq.com/keys](https://console.groq.com/keys))

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/marjhonie-siasol/co-assist-ai.git
   cd co-assist-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

---

### Running the Application

Because Electron requires access to your physical monitor's interactive desktop window manager, launch the app directly:

```powershell
npm start
```

Or download the pre-compiled installer from [GitHub Releases](https://github.com/marjhonie-siasol/co-assist-ai/releases) and double-click the desktop shortcut.

---

## 🛠️ Configuration & Usage

1. **Add Your API Key(s)**:
   - Go to the **API Keys** tab in the manager window.
   - Paste your primary Groq API key and click **Save**.
   - *(Recommended)* Add 1 or 2 backup keys for automatic failover protection during crucial meetings.

2. **Set Up Your Profile**:
   - Go to the **My Files** tab.
   - Upload your resume as a plain text file (`.txt`).
   - Add any custom context files (e.g. project details, architecture highlights, talking points) you want the AI to remember.

3. **Select Your Model**:
   - Go to the **AI Models** tab.
   - Select either `openai/gpt-oss-120b` (deep reasoning & code) or `openai/gpt-oss-20b` (ultra-fast speed & conversational flow), or `qwen/qwen3.8-27b` (agentic coding).

4. **Launch Your Session**:
   - Return to the main screen and click **Start Session**.
   - After a brief 5-second countdown, the manager minimizes and the discreet floating widget appears at the top of your screen!

---

## 🧱 Tech Stack

| Component | Technology |
|---|---|
| **Framework** | [Electron](https://www.electronjs.org/) (v31) |
| **Runtime** | [Node.js](https://nodejs.org/) |
| **Frontend Styling** | HTML5, Tailwind CSS, Custom Glassmorphic Dark UI |
| **Syntax Highlighting**| [Prism.js](https://prismjs.com/) |
| **LLM Inference** | [Groq Cloud API](https://groq.com/) (OpenAI-compatible endpoints) |
| **Audio Transcription** | Groq Whisper Large v3 |
| **Local Storage** | JSON-backed local storage (`database.json`) |

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are very welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## ⚖️ License & Disclaimer

Distributed under the **MIT License**. See `LICENSE` for more information.

> **Disclaimer:** *Co-Assist AI is intended for learning, note-taking, accessibility, and interview preparation assistance. Users are responsible for complying with the policies, codes of conduct, and honor systems of their respective employers, interviewers, and organizations.*
