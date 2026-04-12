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

const DATA_PATH = process.env.NOVA_DATA_PATH || __dirname;
const PROJECTS_DIR = path.join(DATA_PATH, 'projects');

const WALKABLE_PATH_FILE = path.join(DATA_PATH, 'walkable_path.json');
const ANCHOR_CONFIG_FILE = path.join(DATA_PATH, 'anchor_config.json');
const BREAK_POSITIONS_FILE = path.join(DATA_PATH, 'break_positions.json');
const FOREGROUND_OBJECTS_FILE = path.join(DATA_PATH, 'foreground_objects.json');
const AMBIENT_OBJECTS_FILE = path.join(DATA_PATH, 'ambient_objects.json');

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

app.get('/api/claude-models', (req, res) => {
  res.json([
    'claude-opus-4-6',
    'claude-sonnet-4-6', 
    'claude-haiku-4-5-20251001',
  ]);
});

// API: List available animations for all character folders
app.get('/api/character-animations', (req, res) => {
  const charsPath = path.join(__dirname, 'public', 'assets', 'characters');
  if (!fs.existsSync(charsPath)) return res.json({});

  try {
    const charFolders = fs.readdirSync(charsPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'));
    
    const animationMap = {};
    charFolders.forEach(folder => {
      const p = path.join(charsPath, folder.name);
      const entries = fs.readdirSync(p, { withFileTypes: true });
      const animations = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'avatar')
        .map(e => {
          const animPath = path.join(p, e.name);
          const frameCount = fs.readdirSync(animPath).filter(f => !f.startsWith('.')).length;
          return { name: e.name, count: frameCount };
        });
      
      // Also add standard ones if not detected or to normalize
      const finalAnims = {};
      animations.forEach(a => { finalAnims[a.name] = a.count; });
      if (!finalAnims.Walk) finalAnims.Walk = 42;
      if (!finalAnims.Idle) finalAnims.Idle = 80;
      
      animationMap[folder.name] = finalAnims;
    });
    res.json(animationMap);
  } catch (err) {
    res.json({});
  }
});

// API: List available foreground object assets
app.get('/api/object-assets', (req, res) => {
  const objectsPath = path.join(__dirname, 'public', 'assets', 'office', 'day', 'objects');
  if (!fs.existsSync(objectsPath)) return res.json([]);

  try {
    const files = fs.readdirSync(objectsPath)
      .filter(f => f.endsWith('_day.png'))
      .map(f => f.replace('_day.png', ''));
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// API: Create a new project folder with metadata
app.post('/api/projects', (req, res) => {
  const { name, model, nickname, customPath, emoji, parentAgent, service, apiKey, baseUrl, type } = req.body;
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 API: Create Project request:`, { name, nickname, parentAgent, customPath, type });
  
  if (type !== 'pet' && (!name || !name.trim())) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const isCaptain = type === 'captain' || name === 'Captain';
  const isPet = type === 'pet';

  // Sanitize folder name
  const safeName = isCaptain ? 'Captain' : (isPet ? `pet-${Date.now()}` : name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-'));
  const projectPath = path.join(PROJECTS_DIR, safeName);

  if (fs.existsSync(projectPath) && !isPet) {
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
      } catch (e) {}
    }
  }

  try {
    const os = require('os');
    let actualPath = projectPath;
    let metaStoragePath = projectPath; // Where .nova-meta.json lives
    
    if (isCaptain) {
      actualPath = os.homedir();
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      metaStoragePath = projectPath; // Write meta to the project folder, not home!
    } else if (isPet) {
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      actualPath = projectPath;
      metaStoragePath = projectPath;
    } else if (parentAgent && parentAgent.trim()) {
      // Logic for nesting inside an existing agent
      const parentName = parentAgent.trim();
      const parentProjectPath = path.join(PROJECTS_DIR, parentName);
      
      if (!fs.existsSync(parentProjectPath) || parentName === '.' || parentName === '..') {
        return res.status(404).json({ error: `Parent agent "${parentName}" not found` });
      }
      const resolvedParentPath = fs.realpathSync(parentProjectPath);
      const nestedFolderPath = path.join(resolvedParentPath, safeName);
      
      if (fs.existsSync(projectPath) && !fs.lstatSync(projectPath).isSymbolicLink()) {
        if (!fs.existsSync(nestedFolderPath)) {
          fs.renameSync(projectPath, nestedFolderPath);
        }
      }

      if (!fs.existsSync(nestedFolderPath)) {
        fs.mkdirSync(nestedFolderPath, { recursive: true });
      }
      
      actualPath = nestedFolderPath;
      metaStoragePath = nestedFolderPath;

      if (!fs.existsSync(projectPath)) {
        fs.symlinkSync(nestedFolderPath, projectPath, 'dir');
      }
    } else if (customPath && customPath.trim()) {
      let resolvedCustom = customPath.trim();
      if (resolvedCustom === '~') resolvedCustom = os.homedir();

      actualPath = resolvedCustom;
      if (!path.isAbsolute(actualPath)) {
         return res.status(400).json({ error: 'Custom path must be an absolute path or ~' });
      }

      const resolvedCustomAbs = path.resolve(actualPath);
      const resolvedNova = path.resolve(__dirname);

      const isNovaRoot = resolvedCustomAbs === resolvedNova;
      const criticalFolders = ['public', 'node_modules', 'projects', 'dist'];
      const isCriticalSubfolder = criticalFolders.some(folder =>
        resolvedCustomAbs === path.join(resolvedNova, folder) ||
        resolvedCustomAbs.startsWith(path.join(resolvedNova, folder) + path.sep)
      );

      if (isNovaRoot || isCriticalSubfolder) {
        return res.status(400).json({ 
          error: 'Cannot use this folder as a project path — it conflicts with NOVA system folders'
        });
      }
      if (!fs.existsSync(actualPath)) {
         fs.mkdirSync(actualPath, { recursive: true });
      }
      if (!fs.existsSync(projectPath)) {
        fs.symlinkSync(actualPath, projectPath, 'dir');
      }
      metaStoragePath = actualPath;
    } else {
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      metaStoragePath = projectPath;
    }

    // Initialize git ONLY for regular agents, NOT for Captain (home dir) or Pets
    if (!isCaptain && !isPet && actualPath !== os.homedir()) {
      try {
        const { execSync } = require('child_process');
        execSync('git init', { cwd: actualPath });
      } catch (gitErr) {
        console.warn(`⚠️  Failed to initialize git in ${actualPath}:`, gitErr.message);
      }
    }

    // Store metadata
    const meta = {
      name: safeName,
      nickname: nickname || (isCaptain ? 'Captain' : (isPet ? 'Pet' : safeName)),
      model: model || (isPet ? undefined : 'qwen3.5:cloud'),
      service: service || (isPet ? undefined : 'ollama'),
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      emoji: emoji || '🪐',
      customPath: (customPath || isCaptain) ? actualPath : undefined,
      parentAgent: parentAgent || undefined,
      type: type || 'agent',
      createdAt: new Date().toISOString(),
      active: true
    };
    fs.writeFileSync(path.join(metaStoragePath, '.nova-meta.json'), JSON.stringify(meta, null, 2));
    console.log(`✅ Created ${meta.type}: ${safeName} (Nickname: ${meta.nickname})`);
    res.json(meta);
  } catch (err) {
    console.error(`❌ Error creating project:`, err);
    res.status(500).json({ error: err.message });
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
            // Auto-activate older projects or Force Captain to be active
            if (!wasActiveDefined || meta.type === 'captain' || meta.name === 'Captain') {
                meta.active = true;
            }
          } catch(err) {}
        } else {
           meta.active = (e.name === 'Captain');
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
  const { name, emoji, nickname, model, service, apiKey, baseUrl } = req.body;
  
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
    if (service) meta.service = service;
    if (apiKey !== undefined) meta.apiKey = apiKey;
    if (baseUrl !== undefined) meta.baseUrl = baseUrl;
    if (req.body.isDocked !== undefined) meta.isDocked = !!req.body.isDocked;
    if (req.body.isOpen !== undefined) meta.isOpen = !!req.body.isOpen;
    
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
  const defaultAnchors = { Char1: { x: 50, y: 85 }, Char2: { x: 50, y: 85 } };
  if (fs.existsSync(ANCHOR_CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ANCHOR_CONFIG_FILE, 'utf8'));
      // Migrate old format (single object) to new format (map)
      if (typeof data.x === 'number') {
        return res.json({ Char1: data, Char2: { x: 50, y: 85 } });
      }
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read anchor file' });
    }
  }
  res.json(defaultAnchors);
});

app.post('/api/anchor', (req, res) => {
  const anchors = req.body;
  if (typeof anchors !== 'object') {
    return res.status(400).json({ error: 'Invalid anchor data' });
  }
  try {
    fs.writeFileSync(ANCHOR_CONFIG_FILE, JSON.stringify(anchors, null, 2));
    console.log(`⚓  Anchors updated for: ${Object.keys(anchors).join(', ')}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save anchor' });
  }
});

// API: Get/Save Break Positions
app.get('/api/break-positions', (req, res) => {
  if (fs.existsSync(BREAK_POSITIONS_FILE)) {
    try {
      const data = fs.readFileSync(BREAK_POSITIONS_FILE, 'utf8');
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read break positions file' });
    }
  }
  res.json([]);
});

app.post('/api/break-positions', (req, res) => {
  const { positions } = req.body;
  if (!Array.isArray(positions)) {
    return res.status(400).json({ error: 'Positions must be an array' });
  }
  try {
    fs.writeFileSync(BREAK_POSITIONS_FILE, JSON.stringify(positions, null, 2));
    console.log(`☕  Break positions updated: ${positions.length} spots`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save break positions' });
  }
});

// API: Get/Save Foreground Objects
app.get('/api/foreground-objects', (req, res) => {
  if (fs.existsSync(FOREGROUND_OBJECTS_FILE)) {
    try {
      const data = fs.readFileSync(FOREGROUND_OBJECTS_FILE, 'utf8');
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read foreground objects file' });
    }
  }
  res.json([]);
});

app.post('/api/foreground-objects', (req, res) => {
  const { objects } = req.body;
  if (!Array.isArray(objects)) {
    return res.status(400).json({ error: 'Objects must be an array' });
  }
  try {
    fs.writeFileSync(FOREGROUND_OBJECTS_FILE, JSON.stringify(objects, null, 2));
    console.log(`🖼️  Foreground objects updated: ${objects.length} items`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save foreground objects' });
  }
});

// API: Get/Save Ambient Objects (Iframes)
app.get('/api/ambient-objects', (req, res) => {
  if (fs.existsSync(AMBIENT_OBJECTS_FILE)) {
    try {
      const data = fs.readFileSync(AMBIENT_OBJECTS_FILE, 'utf8');
      return res.json(JSON.parse(data));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read ambient objects file' });
    }
  }
  res.json([]);
});

app.post('/api/ambient-objects', (req, res) => {
  const { objects } = req.body;
  console.log('🎬  Received ambient objects save request:', (objects || []).length, 'items');
  if (!Array.isArray(objects)) {
    return res.status(400).json({ error: 'Objects must be an array' });
  }
  try {
    fs.writeFileSync(AMBIENT_OBJECTS_FILE, JSON.stringify(objects, null, 2));
    console.log('✅  Ambient objects written to disk');
    res.json({ success: true });
  } catch (e) {
    console.error('❌  Failed to save ambient objects:', e);
    res.status(500).json({ error: 'Failed to save ambient objects' });
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
    const os = require('os');
    const homeDir = os.homedir();

    const isPathSafeToDelete = (p) => {
      if (!p) return false;
      const rp = path.resolve(p);
      if (rp === homeDir || rp === '/' || rp === PROJECTS_DIR || rp === __dirname) return false;
      return true;
    };

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
        if (deleteFiles && isPathSafeToDelete(meta.nestedPath)) {
          if (fs.existsSync(meta.nestedPath)) {
            fs.rmSync(meta.nestedPath, { recursive: true, force: true });
            console.log(`🗑️  Deleted nested project folder: ${meta.nestedPath}`);
          }
        } else if (deleteFiles) {
          console.warn(`🛑 Blocked deletion of unsafe path: ${meta.nestedPath}`);
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
        if (isPathSafeToDelete(projectPath)) {
          fs.rmSync(projectPath, { recursive: true, force: true });
          console.log(`🗑️  Deleted project folder entirely: ${name}`);
          return res.json({ success: true, message: 'Agent and files deleted', type: 'full' });
        } else {
          return res.status(403).json({ error: 'Cannot delete system-protected directory' });
        }
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
    
    // Save to _uploads/ subdirectory to keep project root clean
    const resolvedProjectPath = fs.realpathSync(projectPath);
    const uploadsDir = path.join(resolvedProjectPath, '_uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const resolvedTargetPath = path.join(uploadsDir, safeFilename);
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

app.delete('/api/projects/:name/uploads/:filename', (req, res) => {
  const { name, filename } = req.params;

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const resolvedProjectPath = fs.realpathSync(projectPath);
    const uploadsDir = path.join(resolvedProjectPath, '_uploads');
    
    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const targetPath = path.join(uploadsDir, safeFilename);

    // Ensure the file is actually inside _uploads/
    if (!targetPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.unlinkSync(targetPath);
    console.log(`🗑️  Deleted upload: ${safeFilename} from ${name}`);
    res.json({ success: true, filename: safeFilename });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// API: Get CLAUDE.md content
app.get('/api/projects/:name/claude-md', (req, res) => {
  const { name } = req.params;
  const projectPath = path.join(PROJECTS_DIR, name);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const resolvedPath = fs.realpathSync(projectPath);
    const claudeMdPath = path.join(resolvedPath, 'CLAUDE.md');

    if (!fs.existsSync(claudeMdPath)) {
      return res.json({ exists: false, content: '' });
    }

    const content = fs.readFileSync(claudeMdPath, 'utf8');
    res.json({ exists: true, content });
  } catch (err) {
    console.error('CLAUDE.md read error:', err);
    res.status(500).json({ error: 'Failed to read CLAUDE.md' });
  }
});

// API: Save CLAUDE.md content
app.post('/api/projects/:name/claude-md', (req, res) => {
  const { name } = req.params;
  const { content } = req.body;

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const resolvedPath = fs.realpathSync(projectPath);
    const claudeMdPath = path.join(resolvedPath, 'CLAUDE.md');

    fs.writeFileSync(claudeMdPath, content, 'utf8');
    console.log(`📋 CLAUDE.md saved for project: ${name}`);
    res.json({ success: true });
  } catch (err) {
    console.error('CLAUDE.md write error:', err);
    res.status(500).json({ error: 'Failed to save CLAUDE.md' });
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
  let service = 'ollama'; // default
  let apiKey = '';
  let baseUrl = '';
  let projectType = 'agent';
  let actualCwd = projectPath;

  if (metaPath) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      model = meta.model || model;
      service = meta.service || 'ollama';
      apiKey = meta.apiKey || '';
      baseUrl = meta.baseUrl || '';
      projectType = meta.type || 'agent';
      if (meta.type === 'captain') {
        actualCwd = os.homedir();
      } else if (meta.customPath) {
        actualCwd = meta.customPath;
      }
    } catch(err) {}
  }

  // If it's a pet, we don't spawn a PTY
  if (projectType === 'pet') {
    ws.send(JSON.stringify({ type: 'output', data: '\r\n🐾 \x1b[1;36mThis is a decorative pet.\x1b[0m No terminal interaction available.\r\n' }));
    return;
  }

  console.log(`🖥️  Terminal opened for ${projectType}: ${projectName} using model: ${model} in ${actualCwd}`);

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
      cwd: actualCwd,
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
        ANTHROPIC_API_KEY: (service === 'sumo' || service === 'custom') ? apiKey : (process.env.ANTHROPIC_API_KEY || ''),
        ANTHROPIC_BASE_URL: service === 'sumo' ? 'https://ai.sumopod.com' : (service === 'custom' ? baseUrl : (process.env.ANTHROPIC_BASE_URL || '')),
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
  
  let agentCommand;
  if (service === 'claude' || service === 'sumo' || service === 'custom') {
    agentCommand = hasBeenInitialized
      ? `claude --continue`
      : `claude --model ${model}`;
  } else {
    // default: ollama
    agentCommand = hasBeenInitialized
      ? `ollama launch claude --model ${model} -- --continue`
      : `ollama launch claude --model ${model}`;
  }

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
      const errorMarkers = [
        "No conversation found", 
        "no conversation matching",
        "Invalid model name"
      ];
      const hasError = errorMarkers.some(marker => data.includes(marker));
      
      if (hasError && !ptyProcess._hasRecovered) {
          ptyProcess._hasRecovered = true; // Prevent infinite loops
          console.log(`⚠️  Detected missing conversation for ${projectName}. Rescuing...`);
          
          // Clear the init marker so next cold start is also fresh
          try { if (fs.existsSync(initMarker)) fs.unlinkSync(initMarker); } catch(e) {}

          // If the agent wrapper exited, we are likely in raw zsh. 
          // Re-running the full command without --continue is the safest recovery.
          const fallbackCmd = (service === 'claude' || service === 'sumo' || service === 'custom')
            ? `claude --model ${model}`
            : `ollama launch claude --model ${model}`;

          setTimeout(() => {
              ptyProcess.write('\x03'); // Send Ctrl+C to clear any stuck prompt
              setTimeout(() => {
                  ptyProcess.write(fallbackCmd + '\r');
                  console.log(`♻️  Restarted agent for ${projectName} using: ${fallbackCmd}`);
              }, 800);
          }, 400);
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
