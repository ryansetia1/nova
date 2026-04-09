# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start the server (production)
npm run dev      # Start the server (development)
```

Server runs on http://localhost:3000

## Architecture

**Vagents** is a web-based workspace for managing AI robot agents. Each agent runs in an isolated terminal session powered by `node-pty` and communicates via WebSocket.

### Core Components

- `server.js` - Express server with WebSocket terminal management
  - REST API for project CRUD (`/api/projects`)
  - WebSocket terminal sessions (`ws://?project=<name>`)
  - Model discovery via Ollama CLI (`/api/models`)

- `public/` - Frontend (vanilla JS + xterm.js)
  - `index.html` - Main UI with office/workspace theme
  - `app.js` - Application logic (no framework)
  - `style.css` - Dark glassmorphism theme

### Project Structure

Projects are stored in `./projects/<name>/` with metadata in `.vagents_meta.json`:
```json
{
  "name": "project-name",
  "nickname": "Display Name",
  "model": "qwen3.5:cloud",
  "createdAt": "ISO timestamp"
}
```

### Terminal Flow

1. Frontend opens WebSocket with `?project=<name>`
2. Server spawns PTY shell in project directory
3. Auto-executes `ollama launch claude --model <model>` after 1.2s warm-up
4. `.vagents_init` marker prevents re-initialization on subsequent opens

### Dependencies

- `express` - HTTP server
- `ws` - WebSocket server
- `node-pty` - Pseudo-terminal spawning
