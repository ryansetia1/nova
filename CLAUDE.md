# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **NOVA** - A visual office interface with Electron desktop app, featuring:
- Interactive character agents that move around an office environment
- Dockable terminal sidebar with WebSocket PTY streaming
- LLM service switching (Ollama, Claude, Sumo, Custom)
- Project & Entity management (Agents, Captains, Pets, and Workspace Objects)
- Dedicated character anchor alignment & interaction modes

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

## Architecture

```
nova/
├── server.js           # Express server with WebSocket PTY terminal
├── electron.js         # Electron desktop wrapper
├── public/             # Frontend (vanilla JS ES modules)
│   ├── index.html
│   ├── js/
│   │   ├── main.js
│   │   ├── terminal.js
│   │   ├── agent.js
│   │   └── ...
│   └── css/
├── projects/           # Project configurations
│   ├── agent/
│   ├── captain/
│   └── pet/
└── dist/               # Built Electron app
```

## Key Systems

### Terminal Docking System
- Up to 3 terminals can be docked in the sidebar
- WebSocket-based PTY streaming for real-time terminal output
- Managed via `public/js/terminal.js`

### LLM Service Switching
- Support for multiple LLM backends
- Configurable via UI settings
- Services: Ollama (local), Claude (API), Sumo (custom), Custom endpoint

### Agent Movement System
- Characters move using walkable path polygons
- Collision detection with foreground objects
- Break positions for idle animations
- Configurable via `walkable_path.json` and `foreground_objects.json`

### Character Sprite Animation
- Multi-frame sprite sheets for movement animations
- Configurable directions and frame timing
- Data stored in `break_positions.json`

## Data Persistence

Key configuration files:
- `anchor_config.json` - Character-specific sprite pivot points (Char1, Char2, etc.)
- `break_positions.json` - Named break points for agent idling
- `foreground_objects.json` - Named collision objects for agent movement
- `walkable_path.json` - Floor area polygon vertices
- `character_mapping.json` - Maps entity IDs to sprite assets and behavior profiles

## Development Patterns

### Adding New Agent Activities
1. Define activity in project config under `projects/`
2. Add sprite frames if new animations needed
3. Update `public/js/agent.js` movement logic

### WebSocket Terminal Communication
- Server creates PTY sessions via `node-pty`
- Clients connect via WebSocket to `/terminal/:id`
- Bidirectional stream for input/output

### State Persistence
- Agent positions saved periodically
- Terminal sessions stored in memory
- Config files updated on changes

## Common Tasks

### Configure character-specific anchor
- 1. Toggle **Visualize Mode** via Settings Gear
- 2. Select character (Char1, Char2, etc.) in the Anchor Adjuster panel
- 3. Adjust sliders and click **Save & Apply**

### Modify Walkable Area
1. Edit `walkable_path.json` with new polygons
2. Ensure polygons don't overlap with `foreground_objects.json`
3. Reload page to see changes

### Debug Terminal Issues
1. Check WebSocket connection in browser DevTools
2. Verify `node-pty` is installed correctly
3. Check `server.log` for PTY errors
