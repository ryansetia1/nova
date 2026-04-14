# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **NOVA** — A visual office interface with an optional Electron desktop app, featuring:
- **Multi-workspace environments**: Switch between NOVA HQ Office and Space Station with independent configurations, agents, and layouts
- Interactive character agents that move around workspace environments
- **Agent deployment**: Deploy existing agents across workspaces via UI or maintain workspace-specific agent lists
- **Chat mode** and **terminal mode** per agent, with WebSocket streaming to Claude CLI / PTY
- Dockable terminal panels (up to 3) with WebSocket PTY streaming
- LLM service switching (Ollama, Claude, Sumo, Custom)
- Project & entity management (Agents, Captains, Pets, and workspace objects)
- Character anchor alignment, dev/layout tools, and ambient weather per workspace

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
├── server.js              # Express + WebSockets (chat + PTY), Claude CLI spawn, workspace API
├── electron.js            # Electron desktop wrapper
├── public/                # Frontend (vanilla JS ES modules)
│   ├── index.html         # App shell + #terminal-template + workspace switcher
│   ├── main.js            # Boot, workspace switching, deploy agent UI
│   ├── terminal.js        # Panels, chat WebSocket, resize, activity UI
│   ├── walking.js         # Agents, paths, robot state (workspace-scoped)
│   ├── state.js           # Shared state + DOM refs + workspace state
│   ├── style.css          # Global + chat + panel styles + workspace UI
│   └── assets/            # Character sprites, office assets, spacestation assets
│       ├── office/        # Office day/night backgrounds, objects
│       └── spacestation/  # Space station day/night backgrounds, objects
├── projects/              # GLOBAL agent project folders (shared across workspaces)
├── workspaces/            # Per-workspace configurations
│   ├── office/            # NOVA HQ workspace configs + agent list
│   │   ├── workspace.json # Metadata: name, icon, backgrounds, order
│   │   ├── agents.json    # List of agents deployed to this workspace
│   │   ├── walkable_path.json, foreground_objects.json, etc.
│   │   └── ...
│   └── spacestation/      # Space Station workspace (same structure)
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

### Multi-workspace system

- **Workspace isolation**: Each workspace has independent `walkable_path.json`, `foreground_objects.json`, `ambient_objects.json`, `actions.json`, `schedules.json`, `anchor_config.json`, `character_config.json`.
- **Global agent pool**: `projects/` folder is shared across all workspaces; agents can be deployed to multiple workspaces simultaneously.
- **Agent deployment**: `agents.json` per workspace lists which agents appear in that workspace (references global projects by name).
- **Workspace switching**: Chevron navigation (‹ ›) in room header triggers `switchWorkspace()` → fade transition → clear scene → load new configs → re-render.
- **Background swapping**: CSS custom properties (`--ws-bg-day`, `--ws-bg-night`, etc.) set dynamically via `applyWorkspaceBackground()` in `main.js`.
- **State management**: `state.activeWorkspace` persisted to localStorage; all API calls include `?workspace=` param for scoped data.

### Deploy existing agents

- **UI**: "📦 Deploy Existing Agent" option in spawn dropdown menu opens modal with multi-select agent list.
- **Logic**: `openDeployModal()` fetches global `/api/projects`, filters out agents already in current workspace, displays with avatars.
- **Deployment**: Updates workspace's `agents.json` via `/api/workspaces/:id/agents`, then refreshes local `state.projects` from workspace agent API.

### Agent movement

- Walkable polygons, foreground collision, actions — per-workspace `walkable_path.json`, `foreground_objects.json`, `actions.json`; logic in `walking.js` and related.

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

### Global data (shared across workspaces)
- `projects/` — Agent project folders with `.nova-meta.json`, `CLAUDE.md`, symlinks, working directories
- Chat history — `localStorage` keys `nova-chat-<projectName>` (see `terminal.js`)
- User preferences — `localStorage` keys `nova_active_workspace`, `nova_hidden_agents`, theme settings

### Per-workspace configuration files (in `workspaces/<id>/`)
- `workspace.json` — Metadata: name, subtitle, icon, background/foreground/fx image paths, objectAssetsPath, order
- `agents.json` — Array of agent names deployed to this workspace (references global `projects/`)
- `walkable_path.json` — Floor navigation polygons (coordinate arrays)
- `foreground_objects.json` — Placed objects with collision/rendering
- `ambient_objects.json` — Embedded media (iframes, videos) with positioning
- `actions.json` — Named action points (positions with animations for scheduling)
- `schedules.json` — User-created agent schedules (persisted, loaded on boot per workspace)
- `anchor_config.json` — Sprite pivot/alignment per character (workspace-specific tuning)
- `character_config.json` — Per-character settings (walkSpeed, animSpeed, scale, nicknameY)

### Migration and workspace setup
- **Auto-migration**: On server start, `migrateToWorkspaces()` copies root-level configs to `workspaces/office/` if workspace structure doesn't exist
- **Electron**: Copies entire `workspaces/` folder from app bundle to userData on first launch
- **Backward compatibility**: Server APIs accept `?workspace=` param; defaults to root-level files when no workspace specified

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

### Switch workspaces

1. Use chevron buttons **‹ ›** around the workspace title (NOVA HQ ↔ SPACE STATION).
2. System triggers fade transition → clears current scene → loads new workspace data → applies new background → renders agents/objects.
3. Each workspace maintains separate configurations, schedules, and agent deployments.

### Deploy existing agents to workspace

1. Click spawn dropdown arrow (▾) → **"📦 Deploy Existing Agent"**.
2. Modal shows agents from global pool NOT currently in this workspace.
3. Click to multi-select agents (checkmarks), then **"Deploy Selected"**.
4. Agents are added to current workspace's `agents.json` and appear immediately.

### Create agent schedules (per workspace)

1. Right-click in workspace area → **Manage Schedules**.
2. Choose **Broadcast** (all agents in workspace) or **Per Agent** (specific agent).
3. Set timing: **Specific time** (with AM/PM and day selection) or **Interval** (preset or custom).
4. Select **Action** from dropdown (with avatar previews) — actions are workspace-specific.
5. Set **Duration** (30s to 5 minutes).
6. **Save & Activate** or save inactive for later.

### Create actions for scheduling (per workspace)

1. Enable **Dev Mode** (`Ctrl+D`).
2. Click **Actions** tab in dev panel.
3. Click on workspace floor to place action point.
4. Configure: **Name**, **Emoji**, **Animation**, optionally link to **Object**.
5. **Save** — action becomes available for scheduling in this workspace only.

### Configure character-specific anchors (per workspace)

1. Toggle **Visualize Mode** (settings gear).
2. Select character in the Anchor Adjuster.
3. Adjust and **Save & Apply** — settings saved to current workspace's `anchor_config.json`.

### Modify walkable area (per workspace)

1. Edit workspace-specific `workspaces/<id>/walkable_path.json`.
2. Avoid impossible overlaps with workspace's `foreground_objects.json`.
3. Reload the app or switch to another workspace and back.

### Debug chat or stream issues

1. DevTools → Network / console for WebSocket and JSON parse errors (`terminal.js` logs malformed lines in places).
2. Confirm server Claude/Ollama launch flags include partial streaming if you need live tool events (`server.js`).
3. For PTY-only issues: `server.log`, `node-pty`, and the troubleshooting guide.

### Debug scheduling issues

1. Check **Console** → `window.novaScheduler` object for active timers and schedule state.
2. Verify **Actions** exist in Dev Mode before creating schedules (workspace-specific).
3. **Schedule timing**: Logs show "will fire in Xh Ym Zs" for precise countdown verification.
4. **Agent eligibility**: Broadcast schedules filter agents by animation compatibility (emoji agents always eligible).
5. **Workspace context**: Schedules are workspace-scoped — switching workspaces clears active timers and loads new schedules.

### Debug workspace issues

1. **API endpoints**: Test workspace listing with `GET /api/workspaces`, workspace config with `GET /api/workspaces/:id/config`.
2. **Agent deployment**: Check `GET /api/workspaces/:id/agents` vs `GET /api/projects` to compare workspace vs global agent lists.
3. **Config scoping**: All workspace-scoped APIs accept `?workspace=<id>` param; verify correct workspace in Network tab.
4. **Migration**: Check server logs for "Migrated X → workspaces/office/" messages on first run with existing configs.
5. **Background images**: Inspect CSS custom properties `--ws-bg-day`, `--ws-fg-night` etc. on `#floor-wrapper` element.
6. **State persistence**: Check `localStorage.nova_active_workspace` and verify workspace switching updates this value.

### Workspace API endpoints

**Workspace management:**
- `GET /api/workspaces` — List all workspaces with metadata (sorted by order)
- `GET /api/workspaces/:id` — Get workspace metadata (workspace.json)
- `GET /api/workspaces/:id/config` — Get all configs for workspace (combined response)
- `GET /api/workspaces/:id/agents` — Get agents deployed to workspace (filtered project list)
- `POST /api/workspaces/:id/agents` — Update agents deployed to workspace

**Workspace-scoped data APIs (accept `?workspace=<id>`):**
- `GET/POST /api/walkable-path?workspace=<id>`
- `GET/POST /api/anchor?workspace=<id>`
- `GET/POST /api/actions?workspace=<id>`
- `GET/POST /api/schedules?workspace=<id>`
- `GET/POST /api/foreground-objects?workspace=<id>`
- `GET/POST /api/ambient-objects?workspace=<id>`
- `GET/POST /api/character-config?workspace=<id>`
5. **File system**: Check `schedules.json` for persistence and `/api/schedules` endpoint for CRUD operations.
