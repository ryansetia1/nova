const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

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

// API: List available models from Ollama
app.get('/api/models', (req, res) => {
  const cmd = 'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && ollama list';
  exec(cmd, (error, stdout) => {
    const models = ['qwen3.5:cloud']; // Specific requested extra model
    if (!error) {
      const lines = stdout.split('\n').slice(1); // Skip header row
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts[0]) models.push(parts[0]);
      });
    }
    // De-duplicate and return
    res.json([...new Set(models.filter(m => m))]);
  });
});

// API: Create a new project folder with metadata
app.post('/api/projects', (req, res) => {
  const { name, model, nickname } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  // Sanitize folder name
  const safeName = name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-');
  const projectPath = path.join(PROJECTS_DIR, safeName);

  if (fs.existsSync(projectPath)) {
    return res.status(409).json({ error: 'Project folder already exists' });
  }

  try {
    fs.mkdirSync(projectPath, { recursive: true });

    // Store metadata
    const meta = {
      name: safeName,
      nickname: nickname || safeName,
      model: model || 'qwen3.5:cloud',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(projectPath, '.vagents_meta.json'), JSON.stringify(meta));
    
    console.log(`✅ Created project: ${safeName} (Nickname: ${meta.nickname}) with model ${meta.model}`);
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project folder' });
  }
});

// API: List all projects with metadata
app.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const projectPath = path.join(PROJECTS_DIR, e.name);
        const metaPath = path.join(projectPath, '.vagents_meta.json');
        let meta = { name: e.name, nickname: e.name, model: 'qwen3.5:cloud' };
        
        if (fs.existsSync(metaPath)) {
          try {
            const saved = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            meta = { ...meta, ...saved };
          } catch(err) {}
        }
        return meta;
      });
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

  // Resolve model from metadata
  const metaPath = path.join(projectPath, '.vagents_meta.json');
  let model = 'qwen3.5:cloud';
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      model = meta.model || model;
    } catch(err) {}
  }

  console.log(`🖥️  Terminal opened for project: ${projectName} using model: ${model}`);

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
    console.error(`❌ Failed to spawn terminal:`, err.message);
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
    ? `ollama launch claude --model ${model} -- --continue`
    : `ollama launch claude --model ${model}`;

  setTimeout(() => {
    console.log(`🚀 Executing for ${projectName}: ${agentCommand}`);
    ptyProcess.write(agentCommand + '\r');
    if (!hasBeenInitialized) {
      try { fs.writeFileSync(initMarker, new Date().toISOString()); } catch (e) {}
    }
  }, 1200);

  ptyProcess.onData((data) => {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data }));
    } catch (e) {}
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
      if (parsed.type === 'input') ptyProcess.write(parsed.data);
      else if (parsed.type === 'resize') ptyProcess.resize(parsed.cols, parsed.rows);
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log(`🔌 WebSocket closed for ${projectName}`);
    try { ptyProcess.kill(); } catch (e) {}
    terminals.delete(projectName);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n🤖 Vagents server running at http://localhost:${PORT}\n`);
});
