# NOVA — Agent Workspace 🪐

**Nucleus Orchestrator for Virtual Agents**  
A high-fidelity, interactive office environment for autonomous coding agents. NOVA provides a physical workspace for your AI agents, where they can roam, think, and execute tasks in dedicated persistent terminals.

![NOVA Preview](public/assets/office/day/office_bg_day.png)

## ✨ Features

- **Autonomous Agent Visuals**: Beautiful sprite-based character animations with support for walking, idling, and color-coded status chips in the sidebar (Thinking, Done, Error).
- **Dynamic Multi-Service Support**: Switch seamlessly between **Ollama (local)**, **Claude (Anthropic)**, **Sumo**, and **Custom API** services directly from the terminal.
- **Persistent Sidebar Docking**: Snap up to 3 terminal windows to the right sidebar. They automatically divide the screen height equally and maintain their state across page refreshes.
- **Integrated Agent Editor**: Dedicated `CLAUDE.md` editor built into terminal headers for rapid documentation and agent rules management.
- **Dynamic Day/Night System**: The office environment automatically transitions between Day and Night themes based on your local system time, featuring custom lighting (FX) and dimmed agent states.
- **Persistent Terminals**: Every agent manages its own project folder with a real, integrated terminal (powered by `xterm.js` and `node-pty`).
- **Dynamic Office Environment (NOVA HQ)**:
    - **Depth Sorting**: Agents naturally overlap based on their vertical position, creating a 3D depth illusion.
    - **Walkable Zones**: Precise pathing logic to keep agents within the office floor boundaries.
    - **Ambient Experience**: Integrated YouTube music player in the sidebar for a focused deep-work environment.
- **Developer Suite (Ctrl+D)**:
    - **Floor Drawing**: Draw custom walkable paths directly on the floor.
    - **Point Tweaking**: Interactive drag-and-drop system to refine paths.
    - **Anchor Adjustment**: Visually align character pivot points for perfect floor placement.
- **Smart Persistence**: All floor paths, anchor settings, project metadata, and **UI docking states** are automatically synced to the server.

## 🚀 Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules), CSS3 (Glassmorphism, CSS Variables, Modern Gradients), HTML5.
- **Backend**: Node.js, Express.
- **Real-time**: WebSockets for terminal streaming and real-time state sync.
- **Process Management**: `node-pty` for pseudo-terminal execution.
- **Intelligence**: Native support for **Ollama** and **Anthropic Claude** (via official SDK or custom endpoints).

## 🛠️ Installation

1. **Prerequisites**:
    - Node.js (v18 or higher)
    - Ollama (Optional, for local agent intelligence)

2. **Clone & Install**:
    ```bash
    git clone https://github.com/yourusername/nova.git
    cd nova
    npm install
    ```

3. **Run the Workspace**:
    ```bash
    npm start
    ```
    Access the UI at `http://localhost:3000`.

## 🎮 How to Use

- **Spawn Agent**: Click the "Spawn Agent" button, name your project, and choose an appearance (Emoji or Character Sprite).
- **Docking Mode**: Click the **Yellow Dot** in the terminal header to pin the terminal to the sidebar.
- **Switch Service**: Click the model badge (pill) in any terminal header to change LLM providers or models on the fly.
- **Edit Rules**: Click the 📋 icon to edit the agent's `CLAUDE.md` context.
- **Dev Mode (`Ctrl + D`)**: 
    - Use the floating toolbar to **Draw** new paths or **Tweak** existing ones.
    - Click **Save & Apply** to persist changes.
- **Visualize Mode**: Toggle via the settings gear (top right) to see/adjust agent foot anchors.

## 📂 Project Structure

- `/public`: Frontend assets, styles, and logic.
- `/projects`: The actual workspace folders for your agents.
- `server.js`: Express server and terminal orchestrator.
- `walkable_path.json`: Persistent floor configuration.
- `anchor_config.json`: Persistent sprite alignment data.

## 📜 License
MIT
