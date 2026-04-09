/* ============================================
   VAGENTS — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    projects: [],
    activeProject: null,
    projectToDelete: null,
    terminals: {}, 
    terminal: null,
    fitAddon: null,
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    isMaximized: false,
    prevRect: null
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
    terminalHeader: $('#terminal-panel .terminal-header'),
    terminalContainer: $('#terminal-container'),
    terminalTitle: $('#terminal-title'),
    terminalBadge: $('#terminal-project-badge'),
    terminalCloseDot: $('#terminal-close-dot'),
    terminalMaximizeDot: $('#terminal-maximize-dot'),
    toastContainer: $('#toast-container'),
    particles: $('#particles'),
    deleteModal: $('#delete-modal'),
    deleteRobotName: $('#delete-robot-name'),
    deleteCancelBtn: $('#delete-cancel-btn'),
    deleteConfirmBtn: $('#delete-confirm-btn'),
  };

  // ---- Initialization ----
  function init() {
    createParticles();
    startClock();
    loadProjects();
    bindEvents();
    bindDraggable();
  }

  // ---- Features ---- 
  function createParticles() {
    for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (6 + Math.random() * 6) + 's';
        const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        dom.particles.appendChild(particle);
    }
  }

  function startClock() {
    function update() {
        dom.clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }
    update();
    setInterval(update, 1000);
  }

  // ---- Events ----
  function bindEvents() {
    dom.spawnBtn.addEventListener('click', openModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', handleSpawn);
    
    // Terminal Control Dots
    dom.terminalCloseDot.addEventListener('click', hideTerminal);
    dom.terminalMaximizeDot.addEventListener('click', toggleMaximize);

    dom.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    dom.deleteConfirmBtn.addEventListener('click', handleDelete);

    dom.modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSpawn();
        if (e.key === 'Escape') closeModal();
    });

    [dom.modal, dom.deleteModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) { closeModal(); closeDeleteModal(); } });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeDeleteModal();
            if (!dom.terminalPanel.classList.contains('hidden')) hideTerminal();
        }
    });

    window.addEventListener('resize', () => {
        if (state.isMaximized) {
            dom.terminalPanel.style.width = (window.innerWidth - 40) + 'px';
            dom.terminalPanel.style.height = (window.innerHeight - 40) + 'px';
        }
        if (state.fitAddon && state.terminal) {
            try { state.fitAddon.fit(); } catch (e) {}
        }
    });
  }

  // ---- Draggable & Maximize ----
  function bindDraggable() {
    dom.terminalHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('.terminal-dot')) return;
        if (state.isMaximized) return; // Disable drag when maximized
        
        state.dragging = true;
        const rect = dom.terminalPanel.getBoundingClientRect();
        dom.terminalPanel.style.transform = 'none';
        dom.terminalPanel.style.left = rect.left + 'px';
        dom.terminalPanel.style.top = rect.top + 'px';
        dom.terminalPanel.style.margin = '0';

        state.dragOffset.x = e.clientX - rect.left;
        state.dragOffset.y = e.clientY - rect.top;
        document.addEventListener('mousemove', onDragging);
        document.addEventListener('mouseup', stopDragging);
    });

    function onDragging(e) {
        if (!state.dragging) return;
        let x = e.clientX - state.dragOffset.x;
        let y = e.clientY - state.dragOffset.y;
        x = Math.max(0, Math.min(x, window.innerWidth - dom.terminalPanel.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - dom.terminalPanel.offsetHeight));
        dom.terminalPanel.style.left = x + 'px';
        dom.terminalPanel.style.top = y + 'px';
    }

    function stopDragging() {
        state.dragging = false;
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', stopDragging);
        if (state.fitAddon) try { state.fitAddon.fit(); } catch (e) {}
    }
  }

  function toggleMaximize() {
    if (state.isMaximized) {
        // Restore
        const r = state.prevRect;
        dom.terminalPanel.style.width = r.width + 'px';
        dom.terminalPanel.style.height = r.height + 'px';
        dom.terminalPanel.style.left = r.left + 'px';
        dom.terminalPanel.style.top = r.top + 'px';
        state.isMaximized = false;
    } else {
        // Maximize
        state.prevRect = dom.terminalPanel.getBoundingClientRect();
        dom.terminalPanel.style.left = '20px';
        dom.terminalPanel.style.top = '20px';
        dom.terminalPanel.style.width = (window.innerWidth - 40) + 'px';
        dom.terminalPanel.style.height = (window.innerHeight - 40) + 'px';
        dom.terminalPanel.style.transform = 'none';
        state.isMaximized = true;
    }
    
    setTimeout(() => {
        if (state.fitAddon) {
            state.fitAddon.fit();
            if (state.terminal) {
                const t = state.terminals[state.activeProject];
                if (t) t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
            }
        }
    }, 300);
  }

  // ---- Modal & Models ----
  async function openModal() {
    dom.modal.classList.remove('hidden');
    dom.modalInput.value = '';
    dom.nicknameInput.value = '';
    try {
        const res = await fetch('/api/models');
        const models = await res.json();
        dom.modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
        if (models.includes('qwen3.5:cloud')) dom.modelSelect.value = 'qwen3.5:cloud';
        else if (models.length > 0) dom.modelSelect.value = models[0];
    } catch (err) {
        dom.modelSelect.innerHTML = '<option value="qwen3.5:cloud">qwen3.5:cloud</option>';
    }
    setTimeout(() => dom.modalInput.focus(), 100);
  }

  function closeModal() { dom.modal.classList.add('hidden'); }
  function openDeleteModal(project) {
    state.projectToDelete = project;
    dom.deleteRobotName.textContent = project.nickname || project.name;
    dom.deleteModal.classList.remove('hidden');
  }
  function closeDeleteModal() { dom.deleteModal.classList.add('hidden'); }

  // ---- Project Management ----
  async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        state.projects = await res.json();
        renderRobots();
        state.projects.forEach(project => setupTerminal(project.name, false));
    } catch (err) {}
  }

  async function handleSpawn() {
    const name = dom.modalInput.value.trim();
    const nickname = dom.nicknameInput.value.trim();
    const model = dom.modelSelect.value;
    if (!name) return showToast('error', '❌', 'Name required');
    dom.modalConfirm.disabled = true;
    try {
        const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, nickname, model }) });
        const data = await res.json();
        if (!res.ok) return showToast('error', '❌', data.error);
        state.projects.push(data);
        closeModal();
        renderRobots();
        setupTerminal(data.name, true);
    } catch (err) {} finally { dom.modalConfirm.disabled = false; }
  }

  async function handleDelete() {
    const project = state.projectToDelete;
    if (!project) return;
    try {
        await fetch(`/api/projects/${encodeURIComponent(project.name)}`, { method: 'DELETE' });
        state.projects = state.projects.filter(p => p.name !== project.name);
        if (state.terminals[project.name]) {
            state.terminals[project.name].ws.close();
            state.terminals[project.name].container.remove();
            delete state.terminals[project.name];
        }
        if (state.activeProject === project.name) hideTerminal();
        closeDeleteModal();
        renderRobots();
    } catch (err) {}
  }

  // ---- Render Robot Cards ----
  function renderRobots() {
    if (state.projects.length === 0) { dom.emptyState.classList.remove('hidden'); dom.robotCards.innerHTML = ''; return; }
    dom.emptyState.classList.add('hidden');
    const robotEmojis = ['🤖', '🦾', '🧠', '⚙️', '🔧', '🛠️', '💡', '🎯'];
    dom.robotCards.innerHTML = state.projects.map((project, i) => {
        const emoji = robotEmojis[i % robotEmojis.length];
        const isActive = state.activeProject === project.name;
        const tState = state.terminals && state.terminals[project.name];
        const isReady = tState && tState.ready;
        return `<div class="robot-card ${isActive ? 'active' : ''} ${!isReady ? 'initializing' : ''}" onclick="window.vagents.openTerminal('${project.name}')">
            <button class="robot-card-delete-btn" onclick="event.stopPropagation(); window.vagents.confirmDelete('${project.name}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            <span class="robot-card-emoji">${emoji}</span>
            <div class="robot-card-name">${project.nickname}</div>
            <div class="robot-card-path">${project.model}</div>
            <div class="robot-card-status">${isReady ? '<span class="dot ready"></span>Ready' : '<div class="spinner-small"></div>Warming up...'}</div>
        </div>`;
    }).join('');
  }

  // ---- Terminal Management ----
  function openTerminal(projectName) {
    if (!state.terminals[projectName] || !state.terminals[projectName].ready) return showToast('info', '⏳', 'Warming up...');
    setupTerminal(projectName, true);
  }

  function setupTerminal(projectName, showUI = false) {
    if (showUI) {
        state.activeProject = projectName;
        renderRobots();
        dom.terminalPanel.classList.remove('hidden');
        const projectMeta = state.projects.find(p => p.name === projectName);
        dom.terminalTitle.textContent = `Terminal — ${projectMeta ? projectMeta.nickname : projectName}`;
        dom.terminalBadge.textContent = projectMeta ? projectMeta.model : '';
        Object.values(state.terminals).forEach(t => t.container.style.display = 'none');
    }
    if (!state.terminals[projectName]) {
        const projContainer = document.createElement('div');
        projContainer.className = 'terminal-instance-container';
        projContainer.style.width = '100%'; projContainer.style.height = '100%';
        projContainer.style.display = showUI ? 'block' : 'none';
        dom.terminalContainer.appendChild(projContainer);
        const term = new Terminal({ fontFamily: "monospace", fontSize: 13, theme: { background: '#0d1117', foreground: '#e6edf3' } });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(projContainer);
        const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(projectName)}`;
        const ws = new WebSocket(wsUrl);
        state.terminals[projectName] = { term, fitAddon, ws, container: projContainer, ready: false };
        ws.onopen = () => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    try { fitAddon.fit(); } catch(e) {}
                    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
                    state.terminals[projectName].ready = true;
                    renderRobots();
                }
            }, 1000);
        };
        ws.onmessage = (event) => {
            try { const msg = JSON.parse(event.data); if (msg.type === 'output') term.write(msg.data); } catch (e) {}
        };
        term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data })); });
    } else {
        const t = state.terminals[projectName];
        if (showUI) {
            t.container.style.display = 'block';
            state.terminal = t.term;
            state.fitAddon = t.fitAddon;
            setTimeout(() => { try { t.fitAddon.fit(); t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows })); t.term.focus(); } catch(e) {} }, 350);
        }
    }
  }

  function hideTerminal() { dom.terminalPanel.classList.add('hidden'); state.activeProject = null; renderRobots(); }
  function showToast(type, icon, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 4000);
  }

  window.vagents = { 
    openTerminal, 
    confirmDelete: (name) => { const p = state.projects.find(x => x.name === name); if (p) openDeleteModal(p); }
  };
  document.addEventListener('DOMContentLoaded', init);
})();
