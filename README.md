# 🌴 Trippy

![Project Status](https://img.shields.io/badge/status-active-brightgreen)
![Tech Stack](https://img.shields.io/badge/tech-React%20%7C%20Express%20%7C%20Gemini-blue)

**Trippy** is an autonomous AI-driven travel planning agent designed to bridge the gap between imagination and exploration. By leveraging **Agentic AI** and real-world data, Trippy transforms natural language requests into detailed, actionable itineraries.

---

## 🚀 Overview

Trippy is built to solve "planning fatigue." Unlike static search engines, Trippy acts as a digital concierge that understands context, preferences, and constraints to build personalized travel experiences.

### Key Capabilities
* **Agentic Orchestration:** Uses LLM reasoning to process travel requests and determine necessary actions.
* **Real-World Integration:** Connects to the **Google Places API** for up-to-date location data, photos, and descriptions.
* **Intelligent Itineraries:** Generates multi-day plans categorized by time of day and activity type.
* **Interactive Chat:** A seamless interface for refining plans through natural conversation.

---

## 🏗️ Architecture

The system is designed with a modular architecture, separating the reasoning engine from the delivery layers.

```text
[ Frontend ] <----> [ Backend ] <----> [ AI Agent Core ] <----> [ LLM API ]
(Vite/React)       (Express.js)       (LangChain/Agent)        (Gemini Flash)
                                              |
                                              +-------> [ Google Places API ]
