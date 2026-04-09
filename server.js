const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PROJECTS_DIR = path.join(__dirname, 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Create a new project folder
app.post('/api/projects', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  // Sanitize folder name
  const safeName = name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-');
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  const projectPath = path.join(PROJECTS_DIR, safeName);

  if (fs.existsSync(projectPath)) {
    return res.status(409).json({ error: 'Project already exists' });
  }

  fs.mkdirSync(projectPath, { recursive: true });
  console.log(`✅ Created project: ${safeName} at ${projectPath}`);

  res.json({
    name: safeName,
    path: projectPath,
    createdAt: new Date().toISOString()
  });
});

// API: List all projects
app.get('/api/projects', (req, res) => {
  try {
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(PROJECTS_DIR, e.name)
      }));
    res.json(projects);
  } catch (err) {
    res.json([]);
  }
});

// WebSocket: Terminal sessions
const terminals = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const projectName = url.searchParams.get('project');

  if (!projectName) {
    ws.close(1008, 'Project name required');
    return;
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);
  if (!fs.existsSync(projectPath)) {
    ws.close(1008, 'Project not found');
    return;
  }

  console.log(`🖥️  Terminal opened for project: ${projectName}`);

  // Detect shell — hardcode path for macOS reliability
  const shell = '/bin/zsh';

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, ['--login'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectPath,
      env: {
        HOME: process.env.HOME || os.homedir(),
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
        SHELL: shell,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8',
        USER: process.env.USER || os.userInfo().username,
      }
    });
  } catch (err) {
    console.error(`❌ Failed to spawn terminal for ${projectName}:`, err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data: `\r\n❌ Failed to spawn terminal: ${err.message}\r\n` }));
      ws.close();
    }
    return;
  }

  terminals.set(projectName, ptyProcess);

  // --- Auto-execute Agent Command ---
  const initMarker = path.join(projectPath, '.vagents_init');
  const hasBeenInitialized = fs.existsSync(initMarker);
  const agentCommand = hasBeenInitialized 
    ? 'ollama launch claude --model qwen3.5:cloud -- --continue'
    : 'ollama launch claude --model qwen3.5:cloud';

  // Send command after a small delay to let the shell settle
  setTimeout(() => {
    console.log(`🚀 Executing for ${projectName}: ${agentCommand}`);
    ptyProcess.write(agentCommand + '\r');
    if (!hasBeenInitialized) {
      try {
        fs.writeFileSync(initMarker, new Date().toISOString());
      } catch (e) {
        console.error('Failed to write init marker', e);
      }
    }
  }, 1200);

  ptyProcess.onData((data) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    } catch (e) {
      // ignore
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`🔚 Terminal exited for ${projectName} with code ${exitCode}`);
    terminals.delete(projectName);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      ws.close();
    }
  });

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'input') {
        ptyProcess.write(parsed.data);
      } else if (parsed.type === 'resize') {
        ptyProcess.resize(parsed.cols, parsed.rows);
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => {
    console.log(`🔌 WebSocket closed for ${projectName}`);
    try { ptyProcess.kill(); } catch (e) { /* already dead */ }
    terminals.delete(projectName);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🤖 Vagents server running at http://localhost:${PORT}\n`);
});
