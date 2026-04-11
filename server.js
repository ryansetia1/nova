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

const WALKABLE_PATH_FILE = path.join(__dirname, 'walkable_path.json');
const ANCHOR_CONFIG_FILE = path.join(__dirname, 'anchor_config.json');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Simplified logging: exclude static assets (images, css, etc.) to keep terminal clean
app.use((req, res, next) => {
  const isStatic = req.url.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|png\.map)$/i);
  if (!isStatic) {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
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
  const { name, model, nickname, customPath, emoji, parentAgent } = req.body;
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 API: Create Project request:`, { name, nickname, parentAgent, customPath });
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  // Sanitize folder name
  const safeName = name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-');
  const projectPath = path.join(PROJECTS_DIR, safeName);

  if (fs.existsSync(projectPath)) {
    // Check if it is an orphaned NOVA project
    const metaPathNew = path.join(projectPath, '.nova-meta.json');
    const metaPathOld = path.join(projectPath, '.nova_meta.json');
    const metaPath = fs.existsSync(metaPathNew) ? metaPathNew : (fs.existsSync(metaPathOld) ? metaPathOld : null);

    if (metaPath) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.active === true || meta.active === "true") {
          return res.status(409).json({ error: 'Agent already active for this folder' });
        }
        console.log(`♻️  Re-activating orphaned project: ${safeName}`);
      } catch (e) {
        // invalid meta? just overwrite later
      }
    } else {
      console.log(`📂 Using existing folder without meta: ${safeName}`);
    }
  }

  try {
    let actualPath = projectPath;
    
    if (parentAgent && parentAgent.trim()) {
      // Logic for nesting inside an existing agent
      const parentName = parentAgent.trim();
      const parentProjectPath = path.join(PROJECTS_DIR, parentName);
      
      // Safety check: ensure it's actually within PROJECTS_DIR and not the directory itself
      if (!fs.existsSync(parentProjectPath) || parentName === '.' || parentName === '..') {
        return res.status(404).json({ error: `Parent agent "${parentName}" not found` });
      }
      // Resolve symlink to get the real path
      const resolvedParentPath = fs.realpathSync(parentProjectPath);
      
      const nestedFolderPath = path.join(resolvedParentPath, safeName);
      
      // If a real directory already exists in /projects/[name], we should MOVE it to the nested location
      if (fs.existsSync(projectPath) && !fs.lstatSync(projectPath).isSymbolicLink()) {
        if (!fs.existsSync(nestedFolderPath)) {
          console.log(`📦 Moving existing standalone folder to nested location: ${projectPath} -> ${nestedFolderPath}`);
          fs.renameSync(projectPath, nestedFolderPath);
        } else if (projectPath !== nestedFolderPath) {
          // Conflict. Note: if they are the same path (unlikely given logic), we skip.
          console.warn(`⚠️  Conflict: Both standalone and nested folders exist for ${safeName}. Using nested.`);
        }
      }

      if (fs.existsSync(nestedFolderPath)) {
        // allow resumption
        const nestedMetaPath = path.join(nestedFolderPath, '.nova-meta.json');
        if (fs.existsSync(nestedMetaPath)) {
            try {
                const nestedMeta = JSON.parse(fs.readFileSync(nestedMetaPath, 'utf8'));
                if (nestedMeta.active === true || nestedMeta.active === "true") {
                    return res.status(409).json({ error: 'Agent already active for this folder' });
                }
                console.log(`♻️  Re-activating nested orphaned folder: ${safeName}`);
            } catch(e) {}
        }
      } else {
        fs.mkdirSync(nestedFolderPath, { recursive: true });
      }
      
      actualPath = nestedFolderPath;

      // Create a symlink in /projects pointing to the nested folder (if not exists or if it was a directory we just moved)
      if (!fs.existsSync(projectPath)) {
        fs.symlinkSync(nestedFolderPath, projectPath, 'dir');
        console.log(`🔗 Created symlink for nested agent: ${projectPath} -> ${nestedFolderPath}`);
      } else if (!fs.lstatSync(projectPath).isSymbolicLink()) {
        // If it's still a directory here (which shouldn't happen if we moved it, but safety first)
        // We'll rename it as a backup and then symlink
        const backupPath = `${projectPath}_backup_${Date.now()}`;
        fs.renameSync(projectPath, backupPath);
        fs.symlinkSync(nestedFolderPath, projectPath, 'dir');
        console.log(`🔗 Safety-linked nested agent after backup: ${projectPath} -> ${nestedFolderPath}`);
      }

    } else if (customPath && customPath.trim()) {
      actualPath = customPath.trim();
      if (!path.isAbsolute(actualPath)) {
         return res.status(400).json({ error: 'Custom path must be exactly an absolute path (e.g. /Users/name/Desktop/folder)' });
      }
      if (!fs.existsSync(actualPath)) {
         fs.mkdirSync(actualPath, { recursive: true });
      }
      // Create symlink in projects dir pointing to custom path (if it doesn't exist yet)
      if (!fs.existsSync(projectPath)) {
        fs.symlinkSync(actualPath, projectPath, 'dir');
      }
    } else {
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
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
      emoji: emoji || '🪐',
      customPath: customPath ? actualPath : (parentAgent ? undefined : undefined),
      parentAgent: parentAgent || undefined,
      nestedPath: parentAgent ? actualPath : undefined,
      createdAt: new Date().toISOString(),
      lastAgentSpawned: new Date().toISOString(),
      active: true
    };
    fs.writeFileSync(path.join(actualPath, '.nova-meta.json'), JSON.stringify(meta, null, 2));
    
    console.log(`✅ Created project: ${safeName} (Nickname: ${meta.nickname}) in ${actualPath}`);
    res.json(meta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project. Check permissions and path.' });
  }
});

  app.get('/api/projects', (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] 📊 API: Fetching project list for client`);
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
        const metaPathNew = path.join(projectPath, '.nova-meta.json');
        const metaPathOld = path.join(projectPath, '.nova_meta.json');
        
        let meta = { name: e.name, nickname: e.name, model: 'qwen3.5:cloud', active: false };
        
        const metaPath = fs.existsSync(metaPathNew) ? metaPathNew : (fs.existsSync(metaPathOld) ? metaPathOld : null);
        
        if (metaPath) {
          try {
            const saved = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const wasActiveDefined = saved.active !== undefined;
            meta = { ...meta, ...saved };
            // Auto-activate projects that existed before the 'active' flag was introduced
            if (!wasActiveDefined) {
                meta.active = true;
            }
          } catch(err) {}
        } else {
           meta.active = false;
        }
        
        if (e.isSymbolicLink() && !meta.active) return null;
        
        return meta;
      })
      .filter(m => m !== null);
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

  const metaPathNew = path.join(projectPath, '.nova-meta.json');
  const metaPathOld = path.join(projectPath, '.nova_meta.json');
  const metaPath = fs.existsSync(metaPathNew) ? metaPathNew : (fs.existsSync(metaPathOld) ? metaPathOld : metaPathNew);

  try {
    let meta = {};
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    
    if (emoji) meta.emoji = emoji;
    if (nickname) meta.nickname = nickname;
    if (model) meta.model = model;
    
    // Always save as new format for consistency
    fs.writeFileSync(metaPathNew, JSON.stringify(meta, null, 2));
    // Remove old format if it exists and we're switching
    if (metaPath === metaPathOld && fs.existsSync(metaPathOld)) {
      fs.unlinkSync(metaPathOld);
    }
    
    console.log(`✨ Updated metadata for ${name}:`, meta);
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// API: Ping to check server status
app.get('/api/ping', (req, res) => res.json({ status: 'alive', time: new Date() }));

// API: Get/Save Walkable Path
app.get('/api/walkable-path', (req, res) => {
  if (fs.existsSync(WALKABLE_PATH_FILE)) {
    try {
      const data = fs.readFileSync(WALKABLE_PATH_FILE, 'utf8');
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read path file' });
    }
  }
  res.json([]); // Return empty if not found
});

app.post('/api/walkable-path', (req, res) => {
  const { path: newPath } = req.body;
  if (!Array.isArray(newPath)) {
    return res.status(400).json({ error: 'Path must be an array of points' });
  }
  try {
    fs.writeFileSync(WALKABLE_PATH_FILE, JSON.stringify(newPath, null, 2));
    console.log(`🗺️  Walkable path updated: ${newPath.length} points`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save path' });
  }
});

// API: Get/Save Anchor Config
app.get('/api/anchor', (req, res) => {
  if (fs.existsSync(ANCHOR_CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(ANCHOR_CONFIG_FILE, 'utf8');
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read anchor file' });
    }
  }
  res.json({ x: 50, y: 85 }); // Default fallback
});

app.post('/api/anchor', (req, res) => {
  const { x, y } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'Invalid anchor coordinates' });
  }
  try {
    fs.writeFileSync(ANCHOR_CONFIG_FILE, JSON.stringify({ x, y }, null, 2));
    console.log(`⚓  Anchor updated: x=${x}, y=${y}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save anchor' });
  }
});

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

    const isSymlink = fs.lstatSync(projectPath).isSymbolicLink();
    const deleteFiles = req.query.deleteFiles === 'true';

    // Get metadata to check if it's a nested agent
    let meta = null;
    const metaPathNew = path.join(projectPath, '.nova-meta.json');
    const metaPathOld = path.join(projectPath, '.nova_meta.json');
    const metaPath = fs.existsSync(metaPathNew) ? metaPathNew : (fs.existsSync(metaPathOld) ? metaPathOld : null);
    if (metaPath) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch(e) {}
    }

    if (isSymlink) {
      // If it's a nested agent (has parentAgent), we might want to delete the actual folder
      if (meta && meta.parentAgent && meta.nestedPath) {
        if (deleteFiles) {
          if (fs.existsSync(meta.nestedPath)) {
            fs.rmSync(meta.nestedPath, { recursive: true, force: true });
            console.log(`🗑️  Deleted nested project folder: ${meta.nestedPath}`);
          }
        } else {
          // Keep folder, but set active: false so it can be resumed
          meta.active = false;
          fs.writeFileSync(path.join(meta.nestedPath, '.nova-meta.json'), JSON.stringify(meta, null, 2));
          console.log(`💼 Nested agent marked as inactive (orphaned): ${name}`);
        }
      }
      
      // Always remove the symlink from /projects
      fs.unlinkSync(projectPath);
      console.log(`🗑️  Removed symlink: ${name}`);
      return res.json({ success: true, message: 'Agent removed', type: 'symlink' });
    } else {
      // 2. If real directory
      if (deleteFiles) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        console.log(`🗑️  Deleted project folder entirely: ${name}`);
        return res.json({ success: true, message: 'Agent and files deleted', type: 'full' });
      } else {
        // Just remove agent status, keep folder orphaned
        if (metaPath) {
          try {
            if (meta) {
              meta.active = false;
              fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            }
          } catch(e) {
            console.error(`Failed to update meta for orphan: ${name}`, e);
          }
        } else {
           // create a basic meta to mark as inactive
           const newMeta = { name, active: false };
           fs.writeFileSync(metaPathNew, JSON.stringify(newMeta, null, 2));
        }
        console.log(`💼 Agent removed, folder kept (orphaned): ${name}`);
        return res.json({ success: true, message: 'Agent removed, project files kept', type: 'orphaned' });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process deletion' });
  }
});

// API: Upload file to a project (drag and drop support)
app.post('/api/projects/:name/upload', (req, res) => {
  const { name } = req.params;
  const { filename, filedata, isText, textContent } = req.body;

  if (!filename || (!isText && !filedata)) {
    return res.status(400).json({ error: 'Filename and filedata are required' });
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // For text files, no need to save — just return success
  // The frontend already has the text content
  if (isText) {
    return res.json({ 
      success: true, 
      type: 'text',
      filename: filename,
      textContent: textContent 
    });
  }

  // For binary files, save directly to project root
  try {
    const base64Data = filedata.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const safeFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    
    // Save directly to project root, not _uploads/
    const targetPath = path.join(projectPath, safeFilename);
    
    // Resolve symlink to get actual path
    const resolvedProjectPath = fs.realpathSync(projectPath);
    const resolvedTargetPath = path.join(resolvedProjectPath, safeFilename);
    
    fs.writeFileSync(resolvedTargetPath, base64Data, 'base64');
    
    res.json({ 
      success: true, 
      type: 'binary',
      absolutePath: resolvedTargetPath, 
      filename: safeFilename 
    });
  } catch (err) {
    console.error('File Upload Error:', err);
    res.status(500).json({ error: 'Failed to save file' });
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

  const metaPathNew = path.join(projectPath, '.nova-meta.json');
  const metaPathOld = path.join(projectPath, '.nova_meta.json');
  const metaPath = fs.existsSync(metaPathNew) ? metaPathNew : (fs.existsSync(metaPathOld) ? metaPathOld : null);

  let model = 'qwen3.5:cloud';
  if (metaPath) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      model = meta.model || model;
    } catch(err) {}
  }

  console.log(`🖥️  Terminal opened for project: ${projectName} using model: ${model}`);

  // Fix 2: Kill existing PTY if it exists for this project to avoid zombie processes
  if (terminals.has(projectName)) {
    try { 
      terminals.get(projectName).kill(); 
      console.log(`🔄 Killed existing PTY for ${projectName} before reconnect`);
    } catch(e) {}
    terminals.delete(projectName);
  }

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
        PATH: [
          '/usr/local/bin',
          '/usr/bin', 
          '/bin',
          '/usr/sbin',
          '/sbin',
          '/opt/homebrew/bin',
          process.env.PATH || ''
        ].filter(Boolean).join(':'),
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
  console.log(`\n🪐 NOVA server running at http://localhost:${PORT}\n`);
});
