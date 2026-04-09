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
    prevRect: null,
    walkingRobots: {}, // { name: { x, y, tx, ty, speed, isWalking, isHovered } }
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
    terminalMenuBtn: $('#terminal-menu-btn'),
    terminalDropdown: $('#terminal-dropdown'),
    terminalDeleteBtn: $('#terminal-delete-btn'),
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
    startWalkingLoop();
    bindHoverListeners();
  }

  // ---- Features ---- 
  function createParticles() {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.animationDuration = (6 + Math.random() * 6) + 's';
        p.style.background = colors[Math.floor(Math.random() * 4)];
        dom.particles.appendChild(p);
    }
  }

  function startClock() {
    function update() { dom.clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false }); }
    update(); setInterval(update, 1000);
  }

  // ---- Events ----
  function bindEvents() {
    dom.spawnBtn.addEventListener('click', openModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', handleSpawn);
    dom.terminalCloseDot.addEventListener('click', hideTerminal);
    dom.terminalMaximizeDot.addEventListener('click', toggleMaximize);
    dom.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    dom.deleteConfirmBtn.addEventListener('click', handleDelete);
    
    dom.terminalMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.terminalDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => dom.terminalDropdown.classList.add('hidden'));
    dom.terminalDeleteBtn.addEventListener('click', () => {
        const p = state.projects.find(x => x.name === state.activeProject);
        if (p) openDeleteModal(p);
    });

    dom.modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSpawn();
        if (e.key === 'Escape') closeModal();
    });

    [dom.modal, dom.deleteModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) { closeModal(); closeDeleteModal(); } });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(); closeDeleteModal();
            if (!dom.terminalPanel.classList.contains('hidden')) hideTerminal();
        }
    });

    window.addEventListener('resize', () => {
        if (state.isMaximized) {
            dom.terminalPanel.style.width = (window.innerWidth - 40) + 'px';
            dom.terminalPanel.style.height = (window.innerHeight - 40) + 'px';
        }
        if (state.fitAddon && state.terminal) try { state.fitAddon.fit(); } catch (e) {}
    });
  }

  // ---- Hover Persistence (Event Delegation) ----
  function bindHoverListeners() {
    // Using delegation on the parent container which is never re-rendered
    dom.robotCards.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.robot-card');
        if (card) {
            const name = card.dataset.project;
            if (state.walkingRobots[name]) state.walkingRobots[name].isHovered = true;
        }
    });

    dom.robotCards.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.robot-card');
        if (card) {
            const name = card.dataset.project;
            if (state.walkingRobots[name]) state.walkingRobots[name].isHovered = false;
        }
    });
  }

  // ---- Walking Animation Logic ----
  function startWalkingLoop() {
    const updateInterval = 80; 
    setInterval(() => {
        state.projects.forEach(project => {
            let r = state.walkingRobots[project.name];
            if (!r) {
                r = state.walkingRobots[project.name] = {
                    x: 10 + Math.random() * 70, y: 10 + Math.random() * 70,
                    tx: Math.random() * 100, ty: Math.random() * 100,
                    speed: 0.15 + Math.random() * 0.25,
                    isWalking: true, isHovered: false
                };
            }

            // Stop if active terminal OR hovered
            if (state.activeProject === project.name || r.isHovered) {
                r.isWalking = false;
            } else {
                r.isWalking = true;
            }

            if (r.isWalking) {
                const dx = r.tx - r.x;
                const dy = r.ty - r.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) {
                    r.tx = 10 + Math.random() * 80;
                    r.ty = 10 + Math.random() * 80;
                } else {
                    r.x += (dx / dist) * r.speed;
                    r.y += (dy / dist) * r.speed;
                }
            }

            const el = dom.robotCards.querySelector(`[data-project="${project.name}"]`);
            if (el) {
                el.style.left = r.x + '%';
                el.style.top = r.y + '%';
            }
        });
    }, updateInterval);
  }

  // ---- Draggable ----
  function bindDraggable() {
    dom.terminalHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('.terminal-dot') || e.target.closest('.terminal-menu-container')) return;
        if (state.isMaximized) return;
        
        state.dragging = true;
        dom.terminalPanel.classList.add('dragging');
        
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
        if (!state.dragging) return;
        state.dragging = false;
        dom.terminalPanel.classList.remove('dragging');
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', stopDragging);
        if (state.fitAddon) try { state.fitAddon.fit(); } catch (e) {}
    }
  }

  function toggleMaximize() {
    if (state.isMaximized) {
        const r = state.prevRect;
        dom.terminalPanel.style.width = r.width + 'px'; dom.terminalPanel.style.height = r.height + 'px';
        dom.terminalPanel.style.left = r.left + 'px'; dom.terminalPanel.style.top = r.top + 'px';
        state.isMaximized = false;
    } else {
        state.prevRect = dom.terminalPanel.getBoundingClientRect();
        dom.terminalPanel.style.left = '20px'; dom.terminalPanel.style.top = '20px';
        dom.terminalPanel.style.width = (window.innerWidth - 40) + 'px';
        dom.terminalPanel.style.height = (window.innerHeight - 40) + 'px';
        dom.terminalPanel.style.transform = 'none';
        state.isMaximized = true;
    }
    setTimeout(() => { if (state.fitAddon) { state.fitAddon.fit(); if (state.terminal) { const t = state.terminals[state.activeProject]; if (t) t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows })); } } }, 300);
  }

  // ---- Modal & Projects ----
  async function openModal() {
    dom.modal.classList.remove('hidden'); dom.modalInput.value = ''; dom.nicknameInput.value = '';
    try {
        const res = await fetch('/api/models');
        const models = await res.json();
        dom.modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
        dom.modelSelect.value = models.includes('qwen3.5:cloud') ? 'qwen3.5:cloud' : models[0];
    } catch (e) { dom.modelSelect.innerHTML = '<option value="qwen3.5:cloud">qwen3.5:cloud</option>'; }
    setTimeout(() => dom.modalInput.focus(), 100);
  }
  function closeModal() { dom.modal.classList.add('hidden'); }
  function openDeleteModal(project) {
    state.projectToDelete = project;
    dom.deleteRobotName.textContent = project.nickname || project.name;
    dom.deleteModal.classList.remove('hidden');
    dom.terminalDropdown.classList.add('hidden');
  }
  function closeDeleteModal() { dom.deleteModal.classList.add('hidden'); }

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
        closeModal(); renderRobots();
        setupTerminal(data.name, true);
    } catch (err) {} finally { dom.modalConfirm.disabled = false; }
  }

  async function handleDelete() {
    const project = state.projectToDelete;
    if (!project) return;
    try {
        await fetch(`/api/projects/${encodeURIComponent(project.name)}`, { method: 'DELETE' });
        state.projects = state.projects.filter(p => p.name !== project.name);
        if (state.terminals[project.name]) { state.terminals[project.name].ws.close(); state.terminals[project.name].container.remove(); delete state.terminals[project.name]; }
        if (state.activeProject === project.name) hideTerminal();
        closeDeleteModal(); renderRobots();
        showToast('success', '🗑️', 'Project removed');
    } catch (err) {}
  }

  // ---- Render ----
  function renderRobots() {
    if (state.projects.length === 0) { dom.emptyState.classList.remove('hidden'); dom.robotCards.innerHTML = ''; return; }
    dom.emptyState.classList.add('hidden');
    const emojis = ['🤖', '🦾', '🧠', '⚙️', '🔧', '🛠️', '💡', '🎯'];
    dom.robotCards.innerHTML = state.projects.map((p, i) => {
        const emoji = emojis[i % emojis.length];
        const isActive = state.activeProject === p.name;
        const isReady = state.terminals[p.name] && state.terminals[p.name].ready;
        const r = state.walkingRobots[p.name];
        const posStyle = r ? `left: ${r.x}%; top: ${r.y}%;` : '';
        return `
            <div class="robot-card ${isActive ? 'active' : ''} ${!isReady ? 'initializing' : ''}" 
                 data-project="${p.name}" style="${posStyle}"
                 onclick="window.vagents.openTerminal('${p.name}')">
                <span class="robot-card-emoji">${emoji}</span>
                <div class="robot-card-name">${p.nickname}</div>
                <div class="robot-card-status">${isReady ? '<span class="dot ready"></span>Active' : 'Warming up...'}</div>
            </div>`;
    }).join('');
  }

  // ---- Terminal Management ----
  function openTerminal(pName) {
    if (!state.terminals[pName] || !state.terminals[pName].ready) return showToast('info', '⏳', 'Warming up...');
    setupTerminal(pName, true);
  }

  function setupTerminal(pName, showUI = false) {
    if (showUI) {
        state.activeProject = pName; renderRobots();
        dom.terminalPanel.classList.remove('hidden');
        const meta = state.projects.find(x => x.name === pName);
        dom.terminalTitle.textContent = meta ? meta.nickname : pName;
        dom.terminalBadge.textContent = meta ? meta.model : '';
        Object.values(state.terminals).forEach(t => t.container.style.display = 'none');
    }
    if (!state.terminals[pName]) {
        const cont = document.createElement('div');
        cont.className = 'terminal-instance-container';
        cont.style.width = '100%'; cont.style.height = '100%';
        cont.style.display = showUI ? 'block' : 'none';
        dom.terminalContainer.appendChild(cont);
        const term = new Terminal({ fontFamily: "monospace", fontSize: 13, theme: { background: '#0d1117', foreground: '#e6edf3' } });
        const fit = new FitAddon.FitAddon();
        term.loadAddon(fit); term.open(cont);
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(pName)}`);
        state.terminals[pName] = { term, fitAddon: fit, ws, container: cont, ready: false };
        ws.onopen = () => { setTimeout(() => { if (ws.readyState === WebSocket.OPEN) { try { fit.fit(); } catch(e) {} ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })); state.terminals[pName].ready = true; renderRobots(); } }, 1000); };
        ws.onmessage = (e) => { try { const msg = JSON.parse(e.data); if (msg.type === 'output') term.write(msg.data); } catch (e) {} };
        term.onData(d => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d })); });
    } else {
        const t = state.terminals[pName];
        if (showUI) {
            t.container.style.display = 'block'; state.terminal = t.term; state.fitAddon = t.fitAddon;
            setTimeout(() => { 
                try { 
                    t.fitAddon.fit(); 
                    t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows })); 
                    t.term.scrollToBottom();
                    t.term.focus(); 
                } catch(e) {} 
            }, 350);
        }
    }
  }

  function hideTerminal() { 
    dom.terminalPanel.classList.add('hidden'); 
    state.activeProject = null; 
    // Reset all robots to walking state
    Object.values(state.walkingRobots).forEach(r => r.isWalking = true);
    renderRobots(); 
  }

  function showToast(type, icon, msg) {
    const t = document.createElement('div'); t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    dom.toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 4000);
  }

  window.vagents = { openTerminal };
  document.addEventListener('DOMContentLoaded', init);
})();
