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

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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
  const { name, model, nickname, customPath, emoji } = req.body;
  
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
    let actualPath = projectPath;
    if (customPath && customPath.trim()) {
      actualPath = customPath.trim();
      if (!path.isAbsolute(actualPath)) {
         return res.status(400).json({ error: 'Custom path must be exactly an absolute path (e.g. /Users/name/Desktop/folder)' });
      }
      if (!fs.existsSync(actualPath)) {
         fs.mkdirSync(actualPath, { recursive: true });
      }
      // Create symlink in projects dir pointing to custom path
      fs.symlinkSync(actualPath, projectPath, 'dir');
    } else {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Initialize a local git repo so agents treat this as a project root
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: actualPath });
    } catch (gitErr) {
      console.warn(`⚠️  Failed to initialize git in ${actualPath}:`, gitErr.message);
    }

    // Store metadata
    const meta = {
      name: safeName,
      nickname: nickname || safeName,
      model: model || 'qwen3.5:cloud',
      emoji: emoji || '🤖',
      customPath: customPath ? actualPath : undefined,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(actualPath, '.nova_meta.json'), JSON.stringify(meta));
    
    console.log(`✅ Created project: ${safeName} (Nickname: ${meta.nickname}) in ${actualPath}`);
    res.json(meta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project folder or symlink. Check permissions and path.' });
  }
});

// API: List all projects with metadata
app.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries
      .filter(e => {
         if (e.name.startsWith('.')) return false;
         if (e.isDirectory()) return true;
         if (e.isSymbolicLink()) {
             try { return fs.statSync(path.join(PROJECTS_DIR, e.name)).isDirectory(); }
             catch(err) { return false; }
         }
         return false;
      })
      .map(e => {
        const projectPath = path.join(PROJECTS_DIR, e.name);
        const metaPath = path.join(projectPath, '.nova_meta.json');
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

// API: Update a project's metadata
app.post('/api/update-emoji', (req, res) => {
  const { name, emoji, nickname, model } = req.body;
  
  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const metaPath = path.join(projectPath, '.nova_meta.json');
  try {
    let meta = {};
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    
    if (emoji) meta.emoji = emoji;
    if (nickname) meta.nickname = nickname;
    if (model) meta.model = model;
    
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    console.log(`✨ Updated metadata for ${name}:`, meta);
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// API: Ping to check server status
app.get('/api/ping', (req, res) => res.json({ status: 'alive', time: new Date() }));

// API: Delete a project
app.delete('/api/projects/:name', (req, res) => {
  const { name } = req.params;
  const projectPath = path.join(PROJECTS_DIR, name);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    // Kill existing terminal if running
    if (terminals.has(name)) {
      try { terminals.get(name).kill(); } catch(e) {}
      terminals.delete(name);
    }

    // Handle symlink deletion (follow link to delete original folder)
    let finalPathToDelete = projectPath;
    try {
      if (fs.lstatSync(projectPath).isSymbolicLink()) {
        finalPathToDelete = fs.readlinkSync(projectPath);
        // Remove the symlink first
        fs.unlinkSync(projectPath);
      }
    } catch (e) {}

    // Delete the actual folder (either the symlink target or the local projects folder)
    if (fs.existsSync(finalPathToDelete)) {
      fs.rmSync(finalPathToDelete, { recursive: true, force: true });
    }

    console.log(`🗑️  Deleted project and folder: ${name} (at ${finalPathToDelete})`);
    res.json({ success: true, message: 'Project and folder deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project reference' });
  }
});

// API: Upload file to a project (drag and drop support)
app.post('/api/projects/:name/upload', (req, res) => {
  const { name } = req.params;
  const { filename, filedata } = req.body; // filedata should be base64 data URL

  if (!filename || !filedata) {
    return res.status(400).json({ error: 'Filename and filedata are required' });
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const uploadsDir = path.join(projectPath, '_uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  try {
    // extract base64 data from dataURL (e.g. data:image/png;base64,iVBOR...)
    const base64Data = filedata.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const safeFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_'); // sanitize
    const targetPath = path.join(uploadsDir, safeFilename);

    fs.writeFileSync(targetPath, base64Data, 'base64');
    
    res.json({ success: true, absolutePath: targetPath, filename: safeFilename });
  } catch (err) {
    console.error('File Upload Error:', err);
    res.status(500).json({ error: 'Failed to process file upload' });
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
  const metaPath = path.join(projectPath, '.nova_meta.json');
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
  const initMarker = path.join(projectPath, '.nova_init');
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

      // --- Auto-Recovery Logic ---
      // If we see "No conversation found", it means the --continue flag failed.
      // We should instantly fallback to a fresh start.
      const errorMarkers = ["No conversation found", "no conversation matching"];
      const hasError = errorMarkers.some(marker => data.includes(marker));
      
      if (hasError && !ptyProcess._hasRecovered) {
          ptyProcess._hasRecovered = true; // Prevent infinite loops
          console.log(`⚠️  Detected missing conversation for ${projectName}. Rescuing...`);
          
          // Clear the init marker so next cold start is also fresh
          try { if (fs.existsSync(initMarker)) fs.unlinkSync(initMarker); } catch(e) {}

          const fallbackCmd = `ollama launch claude --model ${model}`;
          setTimeout(() => {
              ptyProcess.write('\x03'); // Send Ctrl+C to clear any stuck prompt
              setTimeout(() => {
                  ptyProcess.write(fallbackCmd + '\r');
              }, 500);
          }, 500);
      }
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
  console.log(`\n🤖 NOVA server running at http://localhost:${PORT}\n`);
});
