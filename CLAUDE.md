# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **NOVA** — A visual office interface with an optional Electron desktop app, featuring:
- Interactive character agents that move around an office environment
- **Chat mode** and **terminal mode** per agent, with WebSocket streaming to Claude CLI / PTY
- Dockable terminal panels (up to 3) with WebSocket PTY streaming
- LLM service switching (Ollama, Claude, Sumo, Custom)
- Project & entity management (Agents, Captains, Pets, and workspace objects)
- Character anchor alignment, dev/layout tools, and ambient weather

## Quick Start

```bash
# Install dependencies
npm install

# Run Express + WebSocket server
npm start

# Run both server and Electron concurrently (development)
npm run electron:dev

# Build Electron app for macOS
npm run build
npm run dist
```

### Troubleshooting

If you experience chat hangs, missing sprites, or server crashes, refer to:

- **[Troubleshooting Overview](troubleshooting/GUIDE.md)**
- **Repair utility**: Run `./troubleshooting/repair.sh` to clear locks and hanging processes.

## Architecture

```
nova/
├── server.js              # Express + WebSockets (chat + PTY), Claude CLI spawn
├── electron.js            # Electron desktop wrapper
├── public/                # Frontend (vanilla JS ES modules)
│   ├── index.html         # App shell + #terminal-template
│   ├── main.js            # Boot, office UI, imports terminal helpers
│   ├── terminal.js        # Panels, chat WebSocket, resize, activity UI
│   ├── walking.js         # Agents, paths, robot state
│   ├── state.js           # Shared state + DOM refs
│   ├── style.css          # Global + chat + panel styles
│   └── ...
├── projects/              # Per-agent project folders + configs
└── dist/                  # Built Electron output (after dist)
```

## Key Systems

### Floating terminal / chat panels

- Panels are `.terminal-panel` instances cloned from `#terminal-template` in `index.html`.
- **Move**: drag the header (not when docked or maximized).
- **Resize**: corner handle (`nwse-resize`) plus **edge strips** on all four sides when floating; docked panels use the left-edge width handle only (`--docked-width`).
- Logic lives in `bindWindowEvents` in `public/terminal.js`; styles in `public/style.css` (`.terminal-resize-edge`, `.terminal-resizer`, `.terminal-left-resizer`).

### Chat mode & Claude streaming

- Chat uses a WebSocket (see `setupModeWs('chat')` in `public/terminal.js`).
- The server spawns the Claude CLI with **`--include-partial-messages`** (and stream JSON) so tool use and partial assistant output can arrive incrementally — see `server.js` for the exact spawn args.
- **`handleChatJsonEvent`** in `terminal.js` parses stream events (`content_block_start`, `content_block_delta`, `message_*`, tool-related payloads) and must not swallow events meant for text/thinking/tool UI.

### Chat UX (thinking, activity, cancel, input)

- **Thinking / typing**: WhatsApp-style typing bubble in the chat transcript; CSS uses longhand `animation-*` on `.typing-dot` so staggered delays are not reset by overrides. Avoid calling `syncThinkingBubblesWithAgents` on very tight animation loops (it was removed from the 42ms walk loop in `walking.js` for that reason).
- **Activity stream**: `handleToolActivityStream` / related helpers surface tool calls and results as in-chat “activity” rows so long-running work (e.g. web search) is visible before the final reply.
- **Processing gaps**: `showProcessingIndicator` / `monitorResponseGaps` (and related) cover quiet periods between streamed chunks so the window does not look frozen.
- **Cancel**: While the agent is busy, the send control becomes a **stop** control; **Escape** also cancels — see `cancelOperation`, `isAgentBusy`, and `updateSendButton` in `bindChatEvents` (`terminal.js`).
- **Chat input**: Textarea **auto-resizes** up to a max height, then scrolls; manual vertical resize is allowed within CSS bounds (`style.css` + `autoResize` / listeners in `bindChatEvents`).
- **Copy on bubbles**: Copy button uses clipboard API with fallback; SVG paths in templates must stay valid (broken paths break the icon / animation).

### Terminal Docking System

- Up to three panels can be `.docked-right`; layout helper updates widths/heights.
- WebSocket PTY streaming for terminal mode; refit via xterm `FitAddon` on resize (`refit`).

### LLM service switching

- Configurable from the UI (model badge / modals).
- Services: Ollama (local), Claude (API/CLI path used by server), Sumo, Custom.

### Agent movement

- Walkable polygons, foreground collision, break positions — `walkable_path.json`, `foreground_objects.json`, `break_positions.json`; logic in `walking.js` and related.

### Ambient & weather

- CSS-driven particles (e.g. Starry / Rainy), Open-Meteo + geolocation in auto mode; see existing weather modules in `public/`.

### Character sprites

- Multi-frame sheets, mapping in `character_mapping.json`, anchors in `anchor_config.json`.

## Data Persistence

Key configuration files:

- `anchor_config.json` — Sprite pivot / alignment per character
- `break_positions.json` — Named idle/break points
- `foreground_objects.json` — Collision / layout objects
- `walkable_path.json` — Floor polygons
- `character_mapping.json` — Entity → sprite / behavior
- Chat history — `localStorage` keys `nova-chat-<projectName>` (see `terminal.js`)

## Development Patterns

### Adding new agent-facing UI in chat

1. Extend `handleChatJsonEvent` only with clear event types; keep `IGNORED_TYPES` intentional — dropping `tool_*` types hides the activity stream.
2. Add styles beside existing chat blocks in `style.css` to preserve specificity rules (avoid resetting shorthand `animation` on children that rely on `animation-delay`).

### WebSocket terminal communication

- Server: PTY via `node-pty`; clients attach per project/mode.
- Resize messages may be sent after `fit` so the PTY column/row count matches the viewport.

### State persistence

- Agent positions and project metadata sync to the server where implemented; terminals are largely in-memory.

## Common Tasks

### Configure character-specific anchor

1. Toggle **Visualize Mode** (settings gear).
2. Select character in the Anchor Adjuster.
3. Adjust and **Save & Apply**.

### Modify walkable area

1. Edit `walkable_path.json`.
2. Avoid impossible overlaps with `foreground_objects.json`.
3. Reload the app.

### Debug chat or stream issues

1. DevTools → Network / console for WebSocket and JSON parse errors (`terminal.js` logs malformed lines in places).
2. Confirm server Claude/Ollama launch flags include partial streaming if you need live tool events (`server.js`).
3. For PTY-only issues: `server.log`, `node-pty`, and the troubleshooting guide.
