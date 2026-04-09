/* ============================================
   VAGENTS — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    projects: [],
    activeProject: null,
    terminals: {}, // Persistent terminal objects: { projectName: { term, fitAddon, ws, container, ready } }
    terminal: null, // Current active terminal ref
    fitAddon: null,
  };

  // ---- DOM Elements ----
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    clock: $('#clock'),
    spawnBtn: $('#spawn-btn'),
    modal: $('#spawn-modal'),
    modalInput: $('#project-name-input'),
    nicknameInput: $('#nickname-input'),
    modelSelect: $('#model-select'),
    modalCancel: $('#modal-cancel-btn'),
    modalConfirm: $('#modal-confirm-btn'),
    robotCards: $('#robot-cards'),
    emptyState: $('#empty-state'),
    terminalPanel: $('#terminal-panel'),
    terminalContainer: $('#terminal-container'),
    terminalTitle: $('#terminal-title'),
    terminalBadge: $('#terminal-project-badge'),
    terminalCloseBtn: $('#terminal-close-btn'),
    toastContainer: $('#toast-container'),
    particles: $('#particles'),
  };

  // ---- Initialization ----
  function init() {
    createParticles();
    startClock();
    loadProjects();
    bindEvents();
  }

  // ---- Particles ---- 
  function createParticles() {
    for (let i = 0; i < 25; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 8 + 's';
      particle.style.animationDuration = (6 + Math.random() * 6) + 's';
      particle.style.width = particle.style.height = (2 + Math.random() * 3) + 'px';
      const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981'];
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      dom.particles.appendChild(particle);
    }
  }

  // ---- Clock ----
  function startClock() {
    function update() {
      const now = new Date();
      dom.clock.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
    }
    update();
    setInterval(update, 1000);
  }

  // ---- Events ----
  function bindEvents() {
    dom.spawnBtn.addEventListener('click', openModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', handleSpawn);
    dom.terminalCloseBtn.addEventListener('click', hideTerminal);

    dom.modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSpawn();
      if (e.key === 'Escape') closeModal();
    });

    dom.modal.addEventListener('click', (e) => {
      if (e.target === dom.modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.terminalPanel.classList.contains('hidden')) {
        hideTerminal();
      }
    });

    window.addEventListener('resize', () => {
      if (state.fitAddon && state.terminal) {
        try { state.fitAddon.fit(); } catch (e) {}
      }
    });
  }

  // ---- Modal & Models ----
  async function openModal() {
    dom.modal.classList.remove('hidden');
    dom.modalInput.value = '';
    dom.nicknameInput.value = '';
    
    // Fetch models and populate select
    try {
      dom.modelSelect.innerHTML = '<option value="" disabled selected>Loading models...</option>';
      const res = await fetch('/api/models');
      const models = await res.json();
      dom.modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
      // Default select first or qwen if available
      if (models.includes('qwen3.5:cloud')) dom.modelSelect.value = 'qwen3.5:cloud';
      else if (models.length > 0) dom.modelSelect.value = models[0];
    } catch (err) {
      dom.modelSelect.innerHTML = '<option value="qwen3.5:cloud">qwen3.5:cloud (Default)</option>';
    }

    setTimeout(() => dom.modalInput.focus(), 100);
  }

  function closeModal() {
    dom.modal.classList.add('hidden');
  }

  // ---- Project Management ----
  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      state.projects = await res.json();
      renderRobots();

      // Warm up existing terminals in background
      state.projects.forEach(project => {
        setupTerminal(project.name, false);
      });
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }

  async function handleSpawn() {
    const name = dom.modalInput.value.trim();
    const nickname = dom.nicknameInput.value.trim();
    const model = dom.modelSelect.value;

    if (!name) {
      showToast('error', '❌', 'Please enter a name for the folder');
      dom.modalInput.focus();
      return;
    }

    dom.modalConfirm.disabled = true;
    dom.modalConfirm.innerHTML = '<div class="spinner-small"></div> Deploying...';

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nickname, model }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast('error', '❌', data.error || 'Failed to spawn robot');
        return;
      }

      state.projects.push(data);
      closeModal();
      renderRobots();
      showToast('success', '🤖', `Agent "${data.nickname}" is online!`);

      // Start the terminal for this new project immediately
      setupTerminal(data.name, true);

    } catch (err) {
      showToast('error', '❌', 'Network error');
    } finally {
      dom.modalConfirm.disabled = false;
      dom.modalConfirm.innerHTML = '<span>🚀</span> Deploy Robot';
    }
  }

  // ---- Render Robot Cards ----
  function renderRobots() {
    if (state.projects.length === 0) {
      dom.emptyState.classList.remove('hidden');
      dom.robotCards.innerHTML = '';
      return;
    }

    dom.emptyState.classList.add('hidden');
    const robotEmojis = ['🤖', '🦾', '🧠', '⚙️', '🔧', '🛠️', '💡', '🎯'];

    dom.robotCards.innerHTML = state.projects.map((project, i) => {
      const emoji = robotEmojis[i % robotEmojis.length];
      const isActive = state.activeProject === project.name;
      const tState = state.terminals && state.terminals[project.name];
      const isReady = tState && tState.ready;
      
      return `
        <div class="robot-card ${isActive ? 'active' : ''} ${!isReady ? 'initializing' : ''}" 
             data-project="${project.name}" 
             style="animation-delay: ${i * 80}ms" 
             onclick="window.vagents.openTerminal('${project.name}')">
          <span class="robot-card-emoji">${emoji}</span>
          <div class="robot-card-name">${project.nickname}</div>
          <div class="robot-card-path">${project.model}</div>
          <div class="robot-card-status">
            ${isReady ? '<span class="dot ready"></span>Ready' : '<div class="spinner-small"></div>Warming up...'}
          </div>
          <div class="robot-card-actions">
            <button class="robot-card-btn terminal-btn" ${!isReady ? 'disabled' : ''}>
              ${isReady ? '⌨️ Open Terminal' : 'Wait...'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---- Terminal Management ----
  function openTerminal(projectName) {
    if (!state.terminals || !state.terminals[projectName] || !state.terminals[projectName].ready) {
      showToast('info', '⏳', 'Agent is still warming up...');
      return;
    }
    setupTerminal(projectName, true);
  }

  function setupTerminal(projectName, showUI = false) {
    if (!state.terminals) state.terminals = {};

    if (showUI) {
      state.activeProject = projectName;
      renderRobots();
      dom.terminalPanel.classList.remove('hidden');
      
      const projectMeta = state.projects.find(p => p.name === projectName);
      dom.terminalTitle.textContent = `Terminal — ${projectMeta ? projectMeta.nickname : projectName}`;
      dom.terminalBadge.textContent = projectMeta ? projectMeta.model : 'Agent';
      
      // Hide all containers
      Object.values(state.terminals).forEach(t => {
        t.container.style.display = 'none';
      });
    }

    if (!state.terminals[projectName]) {
      const projContainer = document.createElement('div');
      projContainer.className = 'terminal-instance-container';
      projContainer.style.width = '100%';
      projContainer.style.height = '100%';
      projContainer.style.display = showUI ? 'block' : 'none';
      dom.terminalContainer.appendChild(projContainer);

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#6366f1' },
      });

      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(projContainer);

      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${location.host}?project=${encodeURIComponent(projectName)}`;
      const ws = new WebSocket(wsUrl);

      state.terminals[projectName] = { term, fitAddon, ws, container: projContainer, ready: false };

      ws.onopen = () => {
        try { fitAddon.fit(); } catch(e) {}
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { fitAddon.fit(); } catch(e) {}
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            state.terminals[projectName].ready = true;
            renderRobots();
          }
        }, 1000); // Wait for PTY to be ready on server
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') term.write(msg.data);
          else if (msg.type === 'exit') term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
        } catch (e) {}
      };

      term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
      });
    } else {
      const t = state.terminals[projectName];
      if (showUI) {
        t.container.style.display = 'block';
        state.terminal = t.term;
        state.fitAddon = t.fitAddon;
        
        setTimeout(() => {
          try {
            t.fitAddon.fit();
            t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
            t.term.focus();
          } catch(e) {}
        }, 350);
      }
    }
  }

  function hideTerminal() {
    dom.terminalPanel.classList.add('hidden');
    state.activeProject = null;
    renderRobots();
  }

  // ---- Toast Notifications ----
  function showToast(type, icon, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ---- Expose for inline handlers ----
  window.vagents = { openTerminal };

  document.addEventListener('DOMContentLoaded', init);
})();
