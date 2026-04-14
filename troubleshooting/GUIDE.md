# NOVA Troubleshooting Guide

This guide covers common critical issues encountered during development and deployment of the NOVA workspace.

---

## 1. Chat Interface Stuck on "Thinking..." 💭
**Problem:** The chat window shows "Thinking..." indefinitely after sending a message.

### Common Causes & Solutions:
- **Missing Variables in `server.js`:** 
  - Ensure `agentProc` and `isPty` are correctly declared within the `wss.on('connection')` scope.
  - Check for `ReferenceError` in the server terminal output.
- **WebSocket Silencing:**
  - If the server encounters an error during message processing, it might crash or remain silent.
  - **Fix:** Check `server.js` message listener and ensure there is a `try-catch` block with `console.error(err)` to catch silent failures.
- **PTY Initialization Failure:**
  - If `isPty` is true but the terminal process fails to start, the frontend waits forever.
  - **Fix:** Verify `node-pty` is correctly installed for your architecture (M1/M2 Mac vs Intel).

---

## 2. Agent Sprites Not Appearing / Broken Image Icons 🖼️
**Problem:** Agents show a broken image placeholder or don't appear in the workspace at all.

### Common Causes & Solutions:
- **Asset Initialization Bug:**
  - The `preloadAllAssets` function in `public/ui.js` might have incorrect default frame counts if the server API fails to respond.
  - **Fix:** Ensure the default `animationMap` in `ui.js` matches the actual frame counts in `public/assets/characters/`.
- **Path Mismatch:**
  - The path construction logic in `public/state.js` must exactly match the naming convention in the filesystem (e.g., `Char1Idle_00001.png` vs `frame_001.png`).
- **Server Crash during Load:**
  - If `server.js` crashes during the `DOMContentLoaded` event, the initial asset fetch will fail.
  - **Fix:** Check terminal for `ReferenceError: hasBeenInitialized is not defined` or similar crashes.

---

## 3. Server Error & "Blank Screen" on Reload (Cmd+R) 🌑
**Problem:** Pressing Cmd+R results in a blank screen or "ERR_CONNECTION_REFUSED".

### Common Causes & Solutions:
- **Port 3000 Crashed:**
  - If `node server.js` exits with code 1, the port is closed and Electron cannot load the app.
  - **Fix:** Resolve the exception in `server.js`. Common culprit: `hasBeenInitialized` variable missing when trying to spawn the agent process.
- **Database / LevelDB Lock:**
  - If you see `LOCK: No further details` in logs, an old process didn't clean up its IndexedDB lock.
  - **Fix:** Close all instances of Electron and Node, then restart.

---

## 4. Slash Commands (/model, /effort) Not Working ⌨️
**Problem:** Typing `/model` doesn't trigger the command or hangs.

### Common Causes & Solutions:
- **Input Filtering Logic:**
  - The `terminal.js` or `server.js` might be swallowing the input before it reaches the agent.
  - **Fix:** Check the WebSocket message handler in `server.js`. Ensure that `input` types are correctly written to the `agentProc`.

---

## 5. Model Switching Fails 🔄
**Problem:** Changing the model via the UI doesn't actually update the agent's behavior.

### Common Causes & Solutions:
- **Dangling Processes:**
  - The old agent process might still be running in the background.
  - **Fix:** Ensure `agentProc.kill()` is called before spawning a new process for the same session.
- **Meta-File Sync:**
  - The `.nova-meta.json` in the project folder might not have been updated correctly.
  - **Fix:** Verify the `/api/update-model` endpoint logic in `server.js`.
