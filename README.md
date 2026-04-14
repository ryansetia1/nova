# NOVA — Agent Workspace 🪐

**Nucleus Orchestrator for Virtual Agents**  
A high-fidelity, interactive office environment for autonomous coding agents. NOVA gives your AI agents a spatial workspace: they can roam the office, run shells, and hold **chat** or **terminal** sessions backed by real processes and WebSockets.

![NOVA Preview](public/assets/office/day/office_bg_day.png)

## Features

- **Autonomous agent visuals**: Sprite-based walking and idle animations, with status cues (thinking, done, error) tied to agent state.
- **Chat + terminal per agent**: Each agent has **chat mode** (streamed Claude-style CLI output over WebSockets) and classic **terminal mode** (`xterm.js` + `node-pty`). Tool use and partial streams can surface in the UI while the model works.
- **Chat UX**: WhatsApp-style typing indicator, optional processing-gap hints so quiet periods do not look like a freeze, and an **activity stream** for tool calls (e.g. web search) before the final answer. **Copy** on assistant bubbles includes a clear success state.
- **Cancel while busy**: When an agent is thinking or streaming, the send button becomes **stop**; **Escape** cancels the in-flight chat operation (similar spirit to terminal interrupt).
- **Comfortable input**: Chat input **grows with content** up to a sensible limit, supports **vertical resize**, then **scrolls** for very long messages.
- **Floating window controls**: Drag the panel header to move; resize from the **bottom-right corner** or from **any edge** when the panel is floating. Up to **three** panels can **dock** to the right; docked width is adjustable from the left edge of the dock.
- **Multi-service LLM support**: Switch between **Ollama (local)**, **Claude**, **Sumo**, and **custom** endpoints from the UI (model badge / settings flows).
- **Integrated `CLAUDE.md` editor**: Open from the terminal header menu to edit agent instructions in place.
- **Day / night & weather**: Office theme follows time of day; weather-style ambience can follow real location (Open-Meteo) when enabled.
- **NOVA HQ office**: Depth sorting, walkable zones, dev-mode layout for objects and break positions, tooltips, and persistence for paths and anchors.
- **Roles & visibility**: Agents, captains, and pets; per-entity visibility toggles in the sidebar without necessarily killing processes.
- **Safe removals**: Confirmations for destructive actions (e.g. delete agent, dismiss pet).
- **Ambient media**: Lightweight music / video controls that stay unobtrusive until needed.

## Tech stack

- **Frontend**: Vanilla JavaScript (ES modules), CSS (variables, glass-style UI), HTML5.
- **Backend**: Node.js, Express.
- **Real-time**: WebSockets for chat streams, terminal I/O, and related sync.
- **Terminal**: `node-pty` + `xterm.js` (with fit addon).
- **Models**: Ollama and Anthropic Claude (via server-spawned CLI / configured paths — see `server.js` and project settings).

## Installation

1. **Prerequisites**
   - Node.js v18+ recommended  
   - Ollama and/or Claude CLI setup as needed for your chosen backend  

2. **Clone and install**

   ```bash
   git clone https://github.com/ryansetia1/nova.git
   cd nova
   npm install
   ```

3. **Run**

   ```bash
   npm start
   ```

   Open `http://localhost:3000`.

4. **Electron (optional)**

   ```bash
   npm run electron:dev    # dev
   npm run build && npm run dist   # macOS build
   ```

## How to use

- **Spawn agent**: Use the spawn flow; pick name, appearance (emoji or character), and project path as prompted.
- **Chat vs terminal**: Use the 💬 / 💻 toggle on the panel header.
- **Dock**: Yellow header dot pins the panel to the right stack (max three).
- **Resize**: Corner or edge handles when floating; docked panels — drag the **left** strip to change shared dock width.
- **Switch model / service**: Click the model badge in the header.
- **Edit rules**: Header menu → **Edit CLAUDE.md**.
- **Cancel reply**: While the agent is busy, click **stop** or press **Escape**.
- **Sidebar eye icon**: Hide or show an entity on the floor.
- **Dev mode (`Ctrl+D`)**: Layout and position tools for the office (see on-screen hints).
- **Visualize mode** (settings gear): Adjust per-character foot anchors.

## Troubleshooting

- **[Troubleshooting guide](troubleshooting/GUIDE.md)** — hangs, sprites, crashes, PTY issues.  
- **Quick repair**: `./troubleshooting/repair.sh` — clears common lock / zombie issues.

## Project structure

| Path | Role |
|------|------|
| `public/` | Frontend: `main.js`, `terminal.js`, `walking.js`, `style.css`, assets |
| `server.js` | HTTP + WebSockets, process spawn for chat/terminal |
| `electron.js` | Desktop shell (optional) |
| `projects/` | Agent project directories |
| `walkable_path.json`, `foreground_objects.json`, `break_positions.json`, `anchor_config.json` | Office / agent layout data |

Agent-oriented implementation details for contributors and coding agents are summarized in **[CLAUDE.md](CLAUDE.md)**.

## License

MIT
