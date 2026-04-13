const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

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

if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

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

app.get('/api/models', (req, res) => {
  const cmd = 'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && ollama list';
  exec(cmd, (error, stdout) => {
    const models = ['qwen3.5:cloud'];
    if (!error) {
      const lines = stdout.split('\n').slice(1);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts[0]) models.push(parts[0]);
      });
    }
    res.json([...new Set(models.filter(m => m))]);
  });
});

app.get('/api/claude-models', (req, res) => {
  res.json(['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
});

app.get('/api/character-animations', (req, res) => {
  const charsPath = path.join(__dirname, 'public', 'assets', 'characters');
  if (!fs.existsSync(charsPath)) return res.json({});
  try {
    const charFolders = fs.readdirSync(charsPath, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'));
    const animationMap = {};
    charFolders.forEach(folder => {
      const p = path.join(charsPath, folder.name);
      const entries = fs.readdirSync(p, { withFileTypes: true });
      const animations = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'avatar').map(e => {
        const animPath = path.join(p, e.name);
        const frameCount = fs.readdirSync(animPath).filter(f => !f.startsWith('.')).length;
        return { name: e.name, count: frameCount };
      });
      const finalAnims = {};
      animations.forEach(a => { finalAnims[a.name] = a.count; });
      if (!finalAnims.Walk) finalAnims.Walk = 42;
      if (!finalAnims.Idle) finalAnims.Idle = 80;
      animationMap[folder.name] = finalAnims;
    });
    res.json(animationMap);
  } catch (err) { res.json({}); }
});

app.get('/api/object-assets', (req, res) => {
  const objectsPath = path.join(__dirname, 'public', 'assets', 'office', 'day', 'objects');
  if (!fs.existsSync(objectsPath)) return res.json([]);
  try {
    const files = fs.readdirSync(objectsPath).filter(f => f.endsWith('_day.png')).map(f => f.replace('_day.png', ''));
    res.json(files);
  } catch (err) { res.json([]); }
});

app.post('/api/projects', (req, res) => {
  const { name, model, nickname, customPath, emoji, parentAgent, service, apiKey, baseUrl, type } = req.body;
  if (type !== 'pet' && (!name || !name.trim())) return res.status(400).json({ error: 'Project name is required' });
  const isCaptain = type === 'captain' || name === 'Captain';
  const isPet = type === 'pet';
  const safeName = isCaptain ? 'Captain' : (isPet ? `pet-${Date.now()}` : name.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-'));
  const projectPath = path.join(PROJECTS_DIR, safeName);
  try {
    let actualPath = projectPath;
    let metaStoragePath = projectPath;
    if (isCaptain) {
      actualPath = os.homedir();
      if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });
      metaStoragePath = projectPath;
    } else if (isPet) {
      if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });
      actualPath = projectPath;
      metaStoragePath = projectPath;
    } else if (parentAgent && parentAgent.trim()) {
      const parentProjectPath = path.join(PROJECTS_DIR, parentAgent.trim());
      if (!fs.existsSync(parentProjectPath)) return res.status(404).json({ error: 'Parent not found' });
      const nestedFolderPath = path.join(fs.realpathSync(parentProjectPath), safeName);
      if (!fs.existsSync(nestedFolderPath)) fs.mkdirSync(nestedFolderPath, { recursive: true });
      actualPath = nestedFolderPath;
      metaStoragePath = nestedFolderPath;
      if (!fs.existsSync(projectPath)) fs.symlinkSync(nestedFolderPath, projectPath, 'dir');
    } else if (customPath && customPath.trim()) {
      actualPath = customPath.trim() === '~' ? os.homedir() : customPath.trim();
      if (!fs.existsSync(actualPath)) fs.mkdirSync(actualPath, { recursive: true });
      if (!fs.existsSync(projectPath)) fs.symlinkSync(actualPath, projectPath, 'dir');
      metaStoragePath = actualPath;
    } else {
      if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });
      metaStoragePath = projectPath;
    }
    const meta = { name: safeName, nickname: nickname || (isCaptain ? 'Captain' : (isPet ? 'Pet' : safeName)), model: model || (isPet ? undefined : 'qwen3.5:cloud'), service: service || (isPet ? undefined : 'ollama'), apiKey, baseUrl, emoji: emoji || '🪐', customPath: (customPath || isCaptain) ? actualPath : undefined, parentAgent, type: type || 'agent', createdAt: new Date().toISOString(), active: true };
    fs.writeFileSync(path.join(metaStoragePath, '.nova-meta.json'), JSON.stringify(meta, null, 2));
    res.json(meta);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects', (req, res) => {
  try {
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries.filter(e => !e.name.startsWith('.')).map(e => {
      const p = path.join(PROJECTS_DIR, e.name);
      const metaP = path.join(p, '.nova-meta.json');
      if (fs.existsSync(metaP)) return JSON.parse(fs.readFileSync(metaP, 'utf8'));
      return { name: e.name, nickname: e.name, active: e.name === 'Captain' };
    });
    res.json(projects);
  } catch (err) { res.json([]); }
});

app.post('/api/update-emoji', (req, res) => {
  const { name, emoji, nickname, model, service, apiKey, baseUrl, uiMode, isDocked, isOpen } = req.body;
  const projectPath = path.join(PROJECTS_DIR, name);
  const metaPath = path.join(projectPath, '.nova-meta.json');
  try {
    let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : { name };
    if (emoji) meta.emoji = emoji;
    if (nickname) meta.nickname = nickname;
    if (model) meta.model = model;
    if (service) meta.service = service;
    if (apiKey !== undefined) meta.apiKey = apiKey;
    if (baseUrl !== undefined) meta.baseUrl = baseUrl;
    if (uiMode !== undefined) meta.uiMode = uiMode;
    if (isDocked !== undefined) meta.isDocked = isDocked;
    if (isOpen !== undefined) meta.isOpen = isOpen;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    res.json(meta);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/walkable-path', (req, res) => {
  try { res.json(fs.existsSync(WALKABLE_PATH_FILE) ? JSON.parse(fs.readFileSync(WALKABLE_PATH_FILE, 'utf8')) : []); } catch (e) { res.json([]); }
});
app.post('/api/walkable-path', (req, res) => {
  fs.writeFileSync(WALKABLE_PATH_FILE, JSON.stringify(req.body.path, null, 2));
  res.json({ success: true });
});

app.get('/api/anchor', (req, res) => {
  try { res.json(fs.existsSync(ANCHOR_CONFIG_FILE) ? JSON.parse(fs.readFileSync(ANCHOR_CONFIG_FILE, 'utf8')) : { Char1: { x: 50, y: 85 }, Char2: { x: 50, y: 85 } }); } catch (e) { res.json({ Char1: { x: 50, y: 85 } }); }
});
app.post('/api/anchor', (req, res) => {
  fs.writeFileSync(ANCHOR_CONFIG_FILE, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.get('/api/foreground-objects', (req, res) => {
  try { res.json(fs.existsSync(FOREGROUND_OBJECTS_FILE) ? JSON.parse(fs.readFileSync(FOREGROUND_OBJECTS_FILE, 'utf8')) : []); } catch (e) { res.json([]); }
});
app.post('/api/foreground-objects', (req, res) => {
  fs.writeFileSync(FOREGROUND_OBJECTS_FILE, JSON.stringify(req.body.objects, null, 2));
  res.json({ success: true });
});

app.get('/api/ambient-objects', (req, res) => {
  try { res.json(fs.existsSync(AMBIENT_OBJECTS_FILE) ? JSON.parse(fs.readFileSync(AMBIENT_OBJECTS_FILE, 'utf8')) : []); } catch (e) { res.json([]); }
});
app.post('/api/ambient-objects', (req, res) => {
  fs.writeFileSync(AMBIENT_OBJECTS_FILE, JSON.stringify(req.body.objects, null, 2));
  res.json({ success: true });
});

app.delete('/api/projects/:name', (req, res) => {
  const { name } = req.params;
  const projectPath = path.join(PROJECTS_DIR, name);
  if (terminals.has(name)) { terminals.get(name).kill(); terminals.delete(name); }
  try {
    if (req.query.deleteFiles === 'true' && !fs.lstatSync(projectPath).isSymbolicLink()) {
       fs.rmSync(projectPath, { recursive: true, force: true });
    } else {
       const metaP = path.join(projectPath, '.nova-meta.json');
       if (fs.existsSync(metaP)) {
         const m = JSON.parse(fs.readFileSync(metaP, 'utf8'));
         m.active = false;
         fs.writeFileSync(metaP, JSON.stringify(m, null, 2));
       }
       if (fs.lstatSync(projectPath).isSymbolicLink()) fs.unlinkSync(projectPath);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects/:name/claude-md', (req, res) => {
  const p = path.join(fs.realpathSync(path.join(PROJECTS_DIR, req.params.name)), 'CLAUDE.md');
  res.json(fs.existsSync(p) ? { exists: true, content: fs.readFileSync(p, 'utf8') } : { exists: false });
});
app.post('/api/projects/:name/claude-md', (req, res) => {
  fs.writeFileSync(path.join(fs.realpathSync(path.join(PROJECTS_DIR, req.params.name)), 'CLAUDE.md'), req.body.content);
  res.json({ success: true });
});

const terminals = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const projectName = url.searchParams.get('project');
  if (!projectName) return ws.close();

  const projectPath = path.join(PROJECTS_DIR, projectName);
  const metaPath = path.join(projectPath, '.nova-meta.json');
  let model = 'qwen3.5:cloud', service = 'ollama', apiKey = '', baseUrl = '', uiMode = url.searchParams.get('uiMode') || 'chat', projectType = 'agent', actualCwd = projectPath;

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      model = meta.model || model; service = meta.service || service; apiKey = meta.apiKey || ''; baseUrl = meta.baseUrl || '';
      if (meta.uiMode !== undefined && !url.searchParams.has('uiMode')) uiMode = meta.uiMode;
      projectType = meta.type || 'agent';
      actualCwd = (projectType === 'captain') ? os.homedir() : (meta.customPath || projectPath);
    } catch(e) {}
  }

  if (projectType === 'pet') { ws.send(JSON.stringify({ type: 'output', data: '🐾 Pet session started.' })); return; }

  const sessionKey = `${projectName}-${uiMode}`;
  if (terminals.has(sessionKey)) { terminals.get(sessionKey).kill(); terminals.delete(sessionKey); }

  const commonEnv = { ...process.env, ANTHROPIC_API_KEY: apiKey, ANTHROPIC_BASE_URL: baseUrl, LANG: 'en_US.UTF-8' };
  const initMarker = path.join(projectPath, '.nova_init');
  const hasBeenInitialized = fs.existsSync(initMarker);
  let agentProc, isPty = false;

  if (uiMode === 'chat') {
    const args = ["launch", "claude", "--model", model, "--", "--output-format", "stream-json", "--verbose"]; 
    console.log(`[ChatProxy] Attempting: ollama ${args.join(' ')} (CWD: ${actualCwd})`);
    
    ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', message: `🚀 Starting agent for ${projectName}...` }) }));

    agentProc = spawn('ollama', args, { cwd: actualCwd, env: commonEnv });
    
    agentProc.on('error', (err) => {
        console.warn(`[ChatProxy] ollama failed, trying direct 'claude' fallback: ${err.message}`);
        const claudeArgs = ["--model", model, "--output-format", "stream-json", "--verbose"];
        agentProc = spawn('claude', claudeArgs, { cwd: actualCwd, env: commonEnv });
        
        agentProc.on('error', (f) => {
             ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', subtype: 'error', message: `Failed to start agent. Ensure 'ollama' or 'claude' is installed: ${f.message}` }) }));
        });
        setupAgentHandlers(agentProc);
    });

    const setupAgentHandlers = (proc) => {
        proc.stdout.on('data', (d) => {
            if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data: d.toString() }));
        });
        proc.stderr.on('data', (d) => {
            console.error(`[ChatProxy Err] ${d}`);
        });
        proc.on('close', (code) => {
            console.log(`[ChatProxy] Closed with code ${code}`);
            terminals.delete(sessionKey);
        });
    }

    if (agentProc) {
        setupAgentHandlers(agentProc);
        terminals.set(sessionKey, agentProc);
    }
  } else {
    isPty = true;
    agentProc = pty.spawn('/bin/zsh', ['--login'], { name: 'xterm-256color', cols: 120, rows: 30, cwd: actualCwd, env: { ...commonEnv, SHELL: '/bin/zsh', TERM: 'xterm-256color' } });
    terminals.set(sessionKey, agentProc);
    
    agentProc.onData((data) => {
        if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data }));
    });
    agentProc.onExit(() => {
        terminals.delete(sessionKey);
    });
    const cmd = (service === 'ollama') ? `ollama launch claude --model ${model} ${hasBeenInitialized ? '-- --continue' : ''}` : `claude ${hasBeenInitialized ? '--continue' : `--model ${model}`}`;
    setTimeout(() => { agentProc.write(cmd + '\r'); if (!hasBeenInitialized) fs.writeFileSync(initMarker, ''); }, 1000);
  }

  ws.on('message', (m) => {
    try {
      const p = JSON.parse(m);
      if (p.type === 'input') {
        let dataToSend = p.data;
        
        // If we are in Terminal (PTY) mode, we MUST NOT send JSON to the shell.
        // If the incoming data is a string that looks like our structured JSON, extract the text.
        if (isPty && typeof dataToSend === 'string' && dataToSend.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(dataToSend.trim());
            if (parsed.type === 'user' && parsed.message && parsed.message.content) {
               dataToSend = parsed.message.content[0].text + '\r';
               console.log(`[PTY Proxy] Extracted text from JSON payload: ${dataToSend.trim()}`);
            }
          } catch(e) {
            // Not a valid JSON or not our format, send as-is
          }
        }
        
        if (agentProc) {
            if (isPty) {
                agentProc.write(dataToSend);
            } else {
                console.log(`[ChatProxy -> Agent] ${dataToSend.trim()}`);
                agentProc.stdin.write(dataToSend);
            }
        }
      } else if (p.type === 'resize' && isPty) {
        agentProc.resize(p.cols, p.rows);
      }
    } catch(e) {}
  });
  ws.on('close', () => { try { agentProc.kill(); } catch(e) {} terminals.delete(projectName); });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🪐 NOVA server on http://localhost:${PORT}`));
