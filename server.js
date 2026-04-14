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
const ACTIONS_FILE = path.join(DATA_PATH, 'actions.json');
const SCHEDULES_FILE = path.join(DATA_PATH, 'schedules.json');
const FOREGROUND_OBJECTS_FILE = path.join(DATA_PATH, 'foreground_objects.json');
const AMBIENT_OBJECTS_FILE = path.join(DATA_PATH, 'ambient_objects.json');
const CHARACTER_CONFIG_FILE = path.join(DATA_PATH, 'character_config.json');

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

app.get('/api/actions', (req, res) => {
  try { res.json(fs.existsSync(ACTIONS_FILE) ? JSON.parse(fs.readFileSync(ACTIONS_FILE, 'utf8')) : []); } catch (e) { res.json([]); }
});
app.post('/api/actions', (req, res) => {
  fs.writeFileSync(ACTIONS_FILE, JSON.stringify(req.body.actions, null, 2));
  res.json({ success: true });
});

// Schedule persistence
app.get('/api/schedules', (req, res) => {
  try { res.json(fs.existsSync(SCHEDULES_FILE) ? JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8')) : []); } catch (e) { res.json([]); }
});
app.post('/api/schedules', (req, res) => {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(req.body.schedules, null, 2));
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

app.get('/api/character-config', (req, res) => {
  try { res.json(fs.existsSync(CHARACTER_CONFIG_FILE) ? JSON.parse(fs.readFileSync(CHARACTER_CONFIG_FILE, 'utf8')) : {}); } catch (e) { res.json({}); }
});
app.post('/api/character-config', (req, res) => {
  fs.writeFileSync(CHARACTER_CONFIG_FILE, JSON.stringify(req.body, null, 2));
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

app.post('/api/open-in-finder', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath required' });

  let resolved;
  if (path.isAbsolute(folderPath)) {
    resolved = folderPath;
  } else {
    resolved = path.resolve(__dirname, folderPath);
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Path does not exist' });
  }

  const platform = process.platform;
  if (platform === 'darwin') {
    exec(`open "${resolved}"`);
  } else if (platform === 'win32') {
    exec(`explorer "${resolved}"`);
  } else {
    exec(`xdg-open "${resolved}"`);
  }

  res.json({ success: true, path: resolved });
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

  // Detect prior conversation: .claude/ directory is created by the CLI when a real session runs
  const claudeDir = path.join(actualCwd, '.claude');
  const hasConversation = fs.existsSync(claudeDir) && fs.readdirSync(claudeDir).length > 0;

  let agentProc = null, isPty = false;

  if (uiMode !== 'chat') {
    isPty = true;
    agentProc = pty.spawn('/bin/zsh', ['--login'], { name: 'xterm-256color', cols: 120, rows: 30, cwd: actualCwd, env: { ...commonEnv, SHELL: '/bin/zsh', TERM: 'xterm-256color' } });
    terminals.set(sessionKey, agentProc);

    let outputBuffer = '';
    let retried = false;

    function buildTermCmd(withContinue) {
      const binName = service === 'claude' ? 'claude' : service;
      if (service === 'ollama') {
        return `ollama launch claude --model ${model}${withContinue ? ' -- --continue' : ''}`;
      }
      return `${binName}${withContinue ? ' --continue' : ` --model ${model}`}`;
    }

    agentProc.onData((data) => {
        if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data }));

        if (!retried && hasConversation) {
          outputBuffer += data;
          if (outputBuffer.length > 4000) outputBuffer = outputBuffer.slice(-2000);
          if (/No conversation found to continue/i.test(outputBuffer) || /exit status 1/.test(outputBuffer)) {
            retried = true;
            outputBuffer = '';
            console.log(`[NOVA] --continue failed for ${projectName}, retrying without it`);
            setTimeout(() => { agentProc.write(buildTermCmd(false) + '\r'); }, 500);
          }
        }
    });
    agentProc.onExit(() => {
        terminals.delete(sessionKey);
    });

    const cmd = buildTermCmd(hasConversation);
    setTimeout(() => { agentProc.write(cmd + '\r'); }, 1000);
  } else {
      // Just notify frontend that we're connected
      ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', message: `🚀 Agent '${projectName}' connected in chat mode...` }) }));
  }

  ws.on('message', (m) => {
    try {
      const p = JSON.parse(m);
      if (p.type === 'input') {
        let dataToSend = p.data;
        
        if (isPty) {
            // Extract text from JSON payload if necessary (PTY shouldn't receive stream-json envelopes)
            if (typeof dataToSend === 'string' && dataToSend.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(dataToSend.trim());
                if (parsed.type === 'user' && parsed.message && parsed.message.content) {
                   dataToSend = parsed.message.content[0].text + '\r';
                }
              } catch(e) {}
            }
            if (agentProc) agentProc.write(dataToSend);
        } else {
            // -- CHAT MODE: Spawn process per-interaction --
            // Claude with -p exits after producing a final result.
            if (agentProc) {
               // Kill any lingering process for this chat before starting a new one
               try { agentProc.kill(); } catch(e) {}
            }

            let cmd, args;
            const chatHasConv = fs.existsSync(claudeDir) && fs.readdirSync(claudeDir).length > 0;

            function spawnChat(withContinue) {
                if (service === 'ollama') {
                    cmd = 'ollama';
                    args = ["launch", "claude", "--model", model, "--", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
                    if (withContinue) args.push("--continue");
                } else {
                    const binName = service === 'claude' ? 'claude' : service;
                    const binPath = path.join(os.homedir(), '.local', 'bin', binName);
                    cmd = fs.existsSync(binPath) ? binPath : binName;
                    args = ["-p", "--model", model, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
                    if (withContinue) args.push("--continue");
                }

                const chatEnv = { ...commonEnv, PATH: `${path.join(os.homedir(), '.local', 'bin')}:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` };
                console.log(`[ChatProxy] Spawning per-msg: ${cmd} ${args.join(' ')} (CWD: ${actualCwd})`);

                agentProc = spawn(cmd, args, { cwd: actualCwd, env: chatEnv });
                terminals.set(sessionKey, agentProc);

                let stderrBuf = '';
                agentProc.stdout.on('data', (d) => { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data: d.toString() })); });
                agentProc.stderr.on('data', (d) => {
                   const chunk = d.toString();
                   stderrBuf += chunk;
                   console.error(`[ChatProxy Err] ${chunk}`);
                   // Forward rate-limit / overloaded / retry info so the client can show it
                   if (/rate_limit|overloaded|429|503|Retrying in|attempt \d+/i.test(chunk)) {
                     if (ws.readyState === WebSocket.OPEN) {
                       ws.send(JSON.stringify({ type: 'output', data: chunk }));
                     }
                   }
                });
                agentProc.on('close', (code) => {
                   console.log(`[ChatProxy] Closed with code ${code}`);
                   if (withContinue && code !== 0 && /No conversation found/i.test(stderrBuf)) {
                     console.log(`[ChatProxy] --continue failed for ${projectName}, retrying without it`);
                     spawnChat(false);
                     const rawText2 = dataToSend.replace(/\n$/, '').replace(/\r$/, '');
                     const jsonMsg2 = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: rawText2 }] } });
                     agentProc.stdin.write(jsonMsg2 + '\n');
                     agentProc.stdin.end();
                     return;
                   }
                   // If process exited with error and stderr has rate-limit, send error event
                   if (code !== 0 && /rate_limit|overloaded|429|503/i.test(stderrBuf)) {
                     const errMatch = stderrBuf.match(/"message"\s*:\s*"([^"]+)"/);
                     const errMsg = errMatch ? errMatch[1] : 'Rate limit reached — retries exhausted';
                     if (ws.readyState === WebSocket.OPEN) {
                       ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', subtype: 'error', message: errMsg }) }));
                     }
                   } else if (code !== 0 && stderrBuf.trim()) {
                     if (ws.readyState === WebSocket.OPEN) {
                       const errMsg = stderrBuf.substring(0, 300).replace(/\n/g, ' ');
                       ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', subtype: 'error', message: errMsg }) }));
                     }
                   }
                   terminals.delete(sessionKey);
                   agentProc = null;
                });
                agentProc.on('error', (err) => {
                   if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data: JSON.stringify({ type: 'system', subtype: 'error', message: `Execution failed: ${err.message}` }) }));
                });
            }

            spawnChat(chatHasConv);

            // Format input as stream-json envelope
            const rawText = dataToSend.replace(/\n$/, '').replace(/\r$/, '');
            const jsonMsg = JSON.stringify({
                type: "user",
                message: {
                    role: "user",
                    content: [{ type: "text", text: rawText }]
                }
            });
            
            console.log(`[ChatProxy -> Agent] ${jsonMsg}`);
            agentProc.stdin.write(jsonMsg + '\n');
            agentProc.stdin.end(); // Important: signal EOF so Claude knows input is complete
        }
      } else if (p.type === 'resize' && isPty) {
        if (agentProc) agentProc.resize(p.cols, p.rows);
      }
    } catch(e) {
      console.error('[ChatProxy Exception]', e);
    }
  });
  ws.on('close', () => { try { if(agentProc) agentProc.kill(); } catch(e) {} terminals.delete(projectName); terminals.delete(sessionKey); });
});

const net = require('net');

const PREFERRED_PORT = parseInt(process.env.PORT || process.env.NOVA_PORT || '3000', 10);

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function findFreePort(start, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    if (await isPortFree(start + i)) return start + i;
  }
  return null;
}

(async () => {
  const port = await findFreePort(PREFERRED_PORT);
  if (!port) {
    console.error(`NOVA: no free port found (tried ${PREFERRED_PORT}–${PREFERRED_PORT + 49})`);
    process.exit(1);
  }
  if (port !== PREFERRED_PORT) {
    console.warn(`NOVA: port ${PREFERRED_PORT} in use — using ${port} instead`);
  }

  server.listen(port, () => {
    if (process.env.NOVA_DATA_PATH) {
      try {
        fs.writeFileSync(
          path.join(process.env.NOVA_DATA_PATH, '.nova-port'),
          String(port),
          'utf8'
        );
      } catch (e) {
        console.warn('NOVA: could not write .nova-port:', e.message);
      }
    }
    console.log(`🪐 NOVA server on http://localhost:${port}`);
  });
})();
