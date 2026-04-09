/* ============================================
   VAGENTS — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    projects: [],
    activeProject: null,
    terminal: null,
    fitAddon: null,
    ws: null,
  };

  // ---- DOM Elements ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    clock: $('#clock'),
    spawnBtn: $('#spawn-btn'),
    modal: $('#spawn-modal'),
    modalInput: $('#project-name-input'),
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
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
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

    // Enter key in modal
    dom.modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSpawn();
      if (e.key === 'Escape') closeModal();
    });

    // Click overlay to close modal
    dom.modal.addEventListener('click', (e) => {
      if (e.target === dom.modal) closeModal();
    });

    // Escape key to close terminal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.terminalPanel.classList.contains('hidden')) {
        hideTerminal();
      }
    });

    // Resize terminal on window resize
    window.addEventListener('resize', () => {
      if (state.fitAddon && state.terminal) {
        try {
          state.fitAddon.fit();
        } catch (e) { /* ignore */ }
      }
    });
  }

  // ---- Modal ----
  function openModal() {
    dom.modal.classList.remove('hidden');
    dom.modalInput.value = '';
    setTimeout(() => dom.modalInput.focus(), 100);
  }

  function closeModal() {
    dom.modal.classList.add('hidden');
    dom.modalInput.value = '';
  }

  // ---- Project Management ----
  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      state.projects = await res.json();
      renderRobots();
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }

  async function handleSpawn() {
    const name = dom.modalInput.value.trim();
    if (!name) {
      showToast('error', '❌', 'Please enter a project name');
      dom.modalInput.focus();
      return;
    }

    // Disable button
    dom.modalConfirm.disabled = true;
    dom.modalConfirm.innerHTML = '<div class="spinner"></div> Creating...';

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast('error', '❌', data.error || 'Failed to create project');
        return;
      }

      state.projects.push(data);
      closeModal();
      renderRobots();
      showToast('success', '🤖', `Robot deployed to "${data.name}"`);

      // Auto-open terminal for the new project
      setTimeout(() => openTerminal(data.name), 600);

    } catch (err) {
      showToast('error', '❌', 'Network error — is the server running?');
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
      const shortPath = `./projects/${project.name}`;

      return `
        <div class="robot-card ${isActive ? 'active' : ''}" data-project="${project.name}" style="animation-delay: ${i * 80}ms" onclick="window.vagents.openTerminal('${project.name}')">
          <span class="robot-card-emoji">${emoji}</span>
          <div class="robot-card-name">${project.name}</div>
          <div class="robot-card-path">${shortPath}</div>
          <div class="robot-card-status">
            <span class="dot"></span>
            Assigned & Ready
          </div>
          <div class="robot-card-actions">
            <button class="robot-card-btn terminal-btn">
              ⌨️ Terminal
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---- Terminal Management ----
  function openTerminal(projectName) {
    state.activeProject = projectName;
    renderRobots();

    // Show panel
    dom.terminalPanel.classList.remove('hidden');
    dom.terminalTitle.textContent = `Terminal — ${projectName}`;
    dom.terminalBadge.textContent = projectName;

    // Initialize state.terminals if missing
    if (!state.terminals) state.terminals = {};

    // Hide all existing terminal containers
    Object.values(state.terminals).forEach(t => {
      t.container.style.display = 'none';
    });

    // Check if we need to create a new one
    if (!state.terminals[projectName]) {
      // Create new container for this project's terminal
      const projContainer = document.createElement('div');
      projContainer.style.width = '100%';
      projContainer.style.height = '100%';
      dom.terminalContainer.appendChild(projContainer);

      // Create xterm
      const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#6366f1',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(99, 102, 241, 0.3)',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#7ee787',
          yellow: '#d29922',
          blue: '#79c0ff',
          magenta: '#d2a8ff',
          cyan: '#a5d6ff',
          white: '#e6edf3',
          brightBlack: '#484f58',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#a5d6ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#b6e3ff',
          brightWhite: '#ffffff',
        },
      });

      const fitAddon = new FitAddon.FitAddon();
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(projContainer);

      // Connect WebSocket
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${location.host}?project=${encodeURIComponent(projectName)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`✅ Terminal connected for: ${projectName}`);
        setTimeout(() => {
          fitAddon.fit();
          ws.send(JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows,
          }));
        }, 100);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            term.write(msg.data);
          } else if (msg.type === 'exit') {
            term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        showToast('error', '❌', 'Terminal connection error');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

      // Save to state
      state.terminals[projectName] = {
        term: term,
        fitAddon: fitAddon,
        ws: ws,
        container: projContainer
      };
      
      // Update global refs for resize events
      state.terminal = term;
      state.fitAddon = fitAddon;
      
    } else {
      // Restore existing terminal UI
      const t = state.terminals[projectName];
      t.container.style.display = 'block';
      state.terminal = t.term;
      state.fitAddon = t.fitAddon;
    }

    // Fit and focus
    setTimeout(() => {
      if (state.terminals[projectName].fitAddon) {
        state.terminals[projectName].fitAddon.fit();
      }
      state.terminals[projectName].term.focus();
    }, 200);
  }

  function hideTerminal() {
    dom.terminalPanel.classList.add('hidden');
    // We intentionally DO NOT close the WebSocket or dispose the terminal anymore!
    // This allows background processes like npm run dev to keep running.
    state.activeProject = null;
    renderRobots();
  }

  // function closeTerminalConnection is no longer needed but kept for completeness
  function closeTerminalConnection() {
    // Intentionally empty to preserve persistency.
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
    }, 3500);
  }

  // ---- Expose for inline handlers ----
  window.vagents = {
    openTerminal,
  };

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', init);
})();
