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
- **Maximize**: double-click header to toggle maximize/restore state.
- **Resize**: **All four corner handles** (`ne`, `nw`, `se`, `sw`) plus **edge strips** on all four sides when floating; docked panels use the left-edge width handle only (`--docked-width`).
- Logic lives in `bindWindowEvents` in `public/terminal.js`; styles in `public/style.css` (`.terminal-resize-edge`, `.terminal-resize-corner`, `.terminal-left-resizer`).

### Chat mode & Claude streaming

- Chat uses a WebSocket (see `setupModeWs('chat')` in `public/terminal.js`).
- The server spawns the Claude CLI with **`--include-partial-messages`** (and stream JSON) so tool use and partial assistant output can arrive incrementally — see `server.js` for the exact spawn args.
- **`handleChatJsonEvent`** in `terminal.js` parses stream events (`content_block_start`, `content_block_delta`, `message_*`, tool-related payloads) and must not swallow events meant for text/thinking/tool UI.

### Chat UX (thinking, activity, cancel, input)

- **Thinking / typing**: WhatsApp-style typing bubble in the chat transcript; CSS uses longhand `animation-*` on `.typing-dot` so staggered delays are not reset by overrides. Avoid calling `syncThinkingBubblesWithAgents` on very tight animation loops (it was removed from the 42ms walk loop in `walking.js` for that reason).
- **Activity stream**: `handleToolActivityStream` / related helpers surface tool calls and results as in-chat “activity” rows so long-running work (e.g. web search) is visible before the final reply.
- **Processing gaps**: `showProcessingIndicator` / `monitorResponseGaps` (and related) cover quiet periods between streamed chunks so the window does not look frozen.
- **Cancel**: While the agent is busy, the send control becomes a **stop** control; **Escape** also cancels — see `cancelOperation`, `isAgentBusy`, and `updateSendButton` in `bindChatEvents` (`terminal.js`).
- **Chat input**: Textarea **auto-resizes** up to a max height, then scrolls; manual vertical resize via **top-right handle** (drag up to expand) with custom implementation replacing native browser resize (`style.css` + `autoResize` / listeners in `bindChatEvents`).
- **Copy on bubbles**: Copy button uses clipboard API with fallback; SVG paths in templates must stay valid (broken paths break the icon / animation).

### Terminal Docking System

- Up to three panels can be `.docked-right`; layout helper updates widths/heights.
- WebSocket PTY streaming for terminal mode; refit via xterm `FitAddon` on resize (`refit`).

### LLM service switching

- Configurable from the UI (model badge / modals).
- Services: Ollama (local), Claude (API/CLI path used by server), Sumo, Custom.

### Agent movement

- Walkable polygons, foreground collision, actions — `walkable_path.json`, `foreground_objects.json`, `actions.json`; logic in `walking.js` and related.

### User-driven scheduling system

- **Custom schedules**: Users create schedules from scratch (no templates) via `schedule-ui.js` with form-based creation.
- **Precise timing**: Uses `setTimeout` chaining for exact execution (not polling) — see `scheduleNextOccurrence` in `scheduler.js`.
- **Two modes**: **Broadcast** (all eligible agents) or **Per Agent** (specific agent selection).
- **Timing options**: Specific times with day selection (AM/PM format) or custom intervals (e.g. "2h30m").
- **Action selection**: Custom dropdown with **avatar images** for sprite characters, emoji display for emoji agents.
- **Persistence**: Stored in `schedules.json`, loaded on server boot with full CRUD operations via `/api/schedules`.
- **Duration management**: Actions run for specified duration, then agents resume random walking via `clearForcedTarget`.
- **Collision handling**: New schedules cancel active ones; broadcast mode applies visual offsets to prevent agent stacking.

### Folder path navigation

- **Clickable paths**: Terminal header folder paths are clickable with hover indication.
- **System integration**: Popover with "Open in Finder" (macOS), "Open in Explorer" (Windows), or system file manager (Linux).
- **Server endpoint**: `/api/open-in-finder` handles cross-platform directory opening via `exec` commands.
- **Copy functionality**: Path copying to clipboard with visual feedback.

### Ambient & weather

- CSS-driven particles (e.g. Starry / Rainy), Open-Meteo + geolocation in auto mode; see existing weather modules in `public/`.

### Character sprites

- Multi-frame sheets, mapping in `character_mapping.json`, anchors in `anchor_config.json`.

## Data Persistence

Key configuration files:

- `anchor_config.json` — Sprite pivot / alignment per character
- `actions.json` — Named action points (positions with animations for scheduling)
- `schedules.json` — User-created agent schedules (persisted, loaded on boot)
- `foreground_objects.json` — Collision / layout objects
- `walkable_path.json` — Floor polygons
- `character_mapping.json` — Entity → sprite / behavior
- Chat history — `localStorage` keys `nova-chat-<projectName>` (see `terminal.js`)

## Development Patterns

### Custom dropdown components

- **Avatar dropdowns**: Replace native `<select>` with custom implementation when images are needed (e.g. agent selection).
- **Structure**: Wrapper div → selected display area → options list with click handlers.
- **Avatar rendering**: Uses `getAppearanceHtml` from `ui.js` to handle SPRITE: vs emoji agent appearances.
- **CSS styling**: `.custom-dropdown`, `.dropdown-option`, `.dropdown-option-avatar` classes with proper z-indexing and animations.

### Adding new agent-facing UI in chat

1. Extend `handleChatJsonEvent` only with clear event types; keep `IGNORED_TYPES` intentional — dropping `tool_*` types hides the activity stream.
2. Add styles beside existing chat blocks in `style.css` to preserve specificity rules (avoid resetting shorthand `animation` on children that rely on `animation-delay`).

### WebSocket terminal communication

- Server: PTY via `node-pty`; clients attach per project/mode.
- Resize messages may be sent after `fit` so the PTY column/row count matches the viewport.

### State persistence

- Agent positions and project metadata sync to the server where implemented; terminals are largely in-memory.

## Common Tasks

### Create agent schedules

1. Right-click in office area → **Manage Schedules**.
2. Choose **Broadcast** (all agents) or **Per Agent** (specific agent).
3. Set timing: **Specific time** (with AM/PM and day selection) or **Interval** (preset or custom).
4. Select **Action** from dropdown (with avatar previews).
5. Set **Duration** (30s to 5 minutes).
6. **Save & Activate** or save inactive for later.

### Create actions for scheduling

1. Enable **Dev Mode** (`Ctrl+D`).
2. Click **Actions** tab in dev panel.
3. Click on office floor to place action point.
4. Configure: **Name**, **Emoji**, **Animation**, optionally link to **Object**.
5. **Save** — action becomes available for scheduling.

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

### Debug scheduling issues

1. Check **Console** → `window.novaScheduler` object for active timers and schedule state.
2. Verify **Actions** exist in Dev Mode before creating schedules.
3. **Schedule timing**: Logs show "will fire in Xh Ym Zs" for precise countdown verification.
4. **Agent eligibility**: Broadcast schedules filter agents by animation compatibility (emoji agents always eligible).
5. **File system**: Check `schedules.json` for persistence and `/api/schedules` endpoint for CRUD operations.
