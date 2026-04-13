# Claude CLI Usage

```
Usage: claude [options] [command] [prompt]
```

Claude Code starts an interactive session by default.  
Use `-p` / `--print` for non-interactive output.

---

## Arguments

- `prompt`  
  Your prompt

---

## Options

### General

- `-h, --help`  
  Display help for command

- `-v, --version`  
  Output the version number

- `--verbose`  
  Override verbose mode setting from config

---

### Session Control

- `-c, --continue`  
  Continue the most recent conversation in the current directory

- `-r, --resume [value]`  
  Resume a conversation by session ID or search term

- `--fork-session`  
  Create a new session when resuming

- `--session-id <uuid>`  
  Use a specific session ID

- `-n, --name <name>`  
  Set display name for the session

- `--no-session-persistence`  
  Disable saving sessions to disk (only with `--print`)

---

### Model & Performance

- `--model <model>`  
  Set model (e.g. `sonnet`, `opus`, or full name)

- `--fallback-model <model>`  
  Fallback model if default is overloaded (only with `--print`)

- `--effort <level>`  
  Effort level: `low`, `medium`, `high`, `max`

- `--max-budget-usd <amount>`  
  Limit API spending (only with `--print`)

---

### Input / Output

- `-p, --print`  
  Print response and exit

- `--output-format <format>`  
  `text` (default), `json`, `stream-json`

- `--input-format <format>`  
  `text` (default), `stream-json`

- `--include-partial-messages`  
  Stream partial messages (requires `--print` + `stream-json`)

- `--include-hook-events`  
  Include lifecycle events (requires `stream-json`)

- `--replay-user-messages`  
  Echo input messages back (stream-json only)

---

### System Prompt

- `--system-prompt <prompt>`  
  Override system prompt

- `--append-system-prompt <prompt>`  
  Append to default system prompt

- `--exclude-dynamic-system-prompt-sections`  
  Move env info into user message (better caching)

---

### Tools & Permissions

- `--tools <tools...>`  
  Define available tools

- `--allowed-tools <tools...>`  
  Allow specific tools

- `--disallowed-tools <tools...>`  
  Deny specific tools

- `--permission-mode <mode>`  
  Modes:  
  `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`

- `--dangerously-skip-permissions`  
  Bypass all permission checks

- `--allow-dangerously-skip-permissions`  
  Enable bypass option without default activation

---

### Files & Resources

- `--file <specs...>`  
  Download files at startup  
  Format: `file_id:relative_path`

- `--add-dir <directories...>`  
  Allow tool access to additional directories

---

### MCP & Plugins

- `--mcp-config <configs...>`  
  Load MCP servers

- `--strict-mcp-config`  
  Only use provided MCP configs

- `--plugin-dir <path>`  
  Load plugins from directory

- `--disable-slash-commands`  
  Disable all skills

---

### Debugging

- `-d, --debug [filter]`  
  Enable debug mode

- `--debug-file <path>`  
  Write debug logs to file

- `--mcp-debug`  
  (Deprecated) Use `--debug` instead

---

### Integration

- `--ide`  
  Auto-connect to IDE

- `--chrome`  
  Enable Chrome integration

- `--no-chrome`  
  Disable Chrome integration

---

### Advanced

- `--bare`  
  Minimal mode (no hooks, plugins, memory, etc.)

- `--setting-sources <sources>`  
  Load settings from: `user`, `project`, `local`

- `--settings <file-or-json>`  
  Load custom settings

- `--agents <json>`  
  Define custom agents

- `--agent <agent>`  
  Select agent for session

- `--betas <betas...>`  
  Enable beta API headers

- `--brief`  
  Enable agent-to-user messaging tool

- `--remote-control-session-name-prefix <prefix>`  
  Prefix for remote session names

- `--tmux`  
  Create tmux session (requires `--worktree`)

- `-w, --worktree [name]`  
  Create new git worktree

---

## Commands

### Core

- `agents`  
  List configured agents

- `auth`  
  Manage authentication

- `auto-mode`  
  Inspect auto mode configuration

- `doctor`  
  Check system health

---

### Installation

- `install [target]`  
  Install Claude Code  
  Targets: `stable`, `latest`, or specific version

- `update`, `upgrade`  
  Check and install updates

---

### Extensions

- `mcp`  
  Manage MCP servers

- `plugin`, `plugins`  
  Manage plugins

---

### Authentication

- `setup-token`  
  Create long-lived auth token (requires subscription)
