![Banner](.github/images/banner.png)

This is a comprehensive `README.md` for your repository, designed to be professional, visually appealing, and highly informative for developers and users.

---

# README.md

![Banner](.github/images/banner.png)

# 🏃‍♂️ Strava Agent Frontend

[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Motion](https://img.shields.io/badge/Motion-12.3-FF0055?logo=framer)](https://motion.dev/)

A high-performance, AI-driven fitness analytics dashboard and chat interface. This frontend acts as the control center for the **auto-adk-agent**, transforming raw Strava training data into actionable insights, fatigue analysis, and personalized workout recommendations through a natural language interface.

---

## ✨ Key Features

-   **🤖 Agentic Reasoning UI**: Visualizes the AI's "Plan-and-Execute" flow. See the agent's thought process as it breaks down complex fitness queries.
-   **📈 Rich Fitness Dashboards**:
    -   **Weekly KPI View**: Interactive charts for mileage, heart rate, and elevation.
    -   **Activity Deep-Dive**: Detailed tables for specific runs, including pace, cadence, and relative effort.
-   **⚡ Real-time Streaming**: Utilizes streaming responses for a low-latency, "typewriter" chat experience.
-   **🎨 Modern Design System**:
    -   Built with **Tailwind CSS** and **shadcn/ui**.
    -   **Motion (Framer Motion)** powered animations for fluid transitions.
    -   Auto-resizing textareas and keyboard shortcuts for a "command-K" feel.
-   **📝 Advanced Markdown**: Full support for GitHub Flavored Markdown (GFM), allowing the agent to present data in tables, lists, and formatted code.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/) (Concurrent Mode, Transitions) |
| **Build Tool** | [Vite 8](https://vitejs.dev/) |
| **Language** | [TypeScript 6](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) |
| **Animations** | [Motion](https://motion.dev/) (formerly Framer Motion) |
| **Data Viz** | Custom Lucide-integrated components |
| **Parsing** | `react-markdown` + `remark-gfm` |

---

## 🚀 Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18.0.0 or higher)
-   [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
-   The [auto-adk-agent](https://github.com/lasheralberto/auto-adk-agent) backend running locally or hosted.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/strava-adk-agent-frontend.git
    cd strava-adk-agent-frontend
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```env
    VITE_API_URL=http://localhost:8000
    VITE_STRAVA_CLIENT_ID=your_client_id
    ```

4.  **Start Development Server**:
    ```bash
    npm run dev
    ```

---

## 📁 Project Structure

```text
src/
├── components/ui/        # Atomic UI components (Buttons, Tables, etc.)
│   ├── activities-runs-panel.tsx  # Specialized Strava data views
│   ├── plan-react-message.tsx     # Agent reasoning visualization
│   └── ruixen-prompt-box.tsx      # Advanced chat input
├── hooks/                # Custom React hooks (e.g., use-auto-resize-textarea)
├── styles/               # Global and component-specific CSS (Tailwind)
├── types/                # TypeScript interfaces for API & Plans
├── App.tsx               # Main application logic & State management
└── main.tsx              # React entry point
```

---

## 💡 Usage Examples

### Customizing the Agent Prompt
The UI includes a specific `AgentPromptPanel` to help guide the AI. You can select pre-defined shortcuts:
- *"Analyze my last 4 weeks of training for overtraining signs."*
- *"Based on my elevation gain this month, suggest a hill workout."*
- *"Compare my average heart rate across all Zone 2 runs."*

### UI Component: Plan-React Reasoning
The application handles structured JSON responses from the backend to display the agent's internal "thinking" steps:

```typescript
// src/types/plan-react.ts
export type PlanReactBlock = {
  thought: string;
  action: string;
  observation: string;
};
```
When the agent executes a plan, the `PlanReactMessage` component renders these blocks as a step-by-step timeline, ensuring transparency in how the AI reached its conclusion.

---

## 🔧 Scripts

-   `npm run dev`: Starts the Vite dev server.
-   `npm run build`: Compiles TypeScript and builds the production bundle.
-   `npm run lint`: Runs ESLint for code quality checks.
-   `npm run preview`: Locally previews the production build.

---

## 🤝 Contributing

1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with ❤️ for the running community.**
*Data provided by [Strava API](https://developers.strava.com/)*.