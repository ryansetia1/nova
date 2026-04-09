/* ============================================
   VAGENTS — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    projects: [],
    projectToDelete: null,
    terminals: {}, 
    draggingWindow: null, // the element being dragged
    dragOffset: { x: 0, y: 0 },
    topZIndex: 2000,
    walkingRobots: {}, // { name: { x, y, tx, ty, speed, isWalking, isHovered, isThinking, hasUpdate } }
  };

  // ---- DOM Elements ----
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    clock: $('#clock'),
    spawnBtn: $('#spawn-btn'),
    modal: $('#spawn-modal'),
    modalInput: $('#project-name-input'),
    nicknameInput: $('#nickname-input'),
    customPathInput: $('#custom-path-input'),
    modelSelect: $('#model-select'),
    modalCancel: $('#modal-cancel-btn'),
    modalConfirm: $('#modal-confirm-btn'),
    robotCards: $('#robot-cards'),
    emptyState: $('#empty-state'),
    mainContent: $('#main-content'),
    terminalTemplate: $('#terminal-template'),
    toastContainer: $('#toast-container'),
    particles: $('#particles'),
    deleteModal: $('#delete-modal'),
    deleteRobotName: $('#delete-robot-name'),
    deleteCancelBtn: $('#delete-cancel-btn'),
    deleteConfirmBtn: $('#delete-confirm-btn'),
    settingsBtn: $('#settings-btn'),
    settingsMenu: $('#settings-menu'),
    toggleVisualsBtn: $('#toggle-visuals-btn'),
  };

  // ---- Initialization ----
  function init() {
    createParticles();
    startClock();
    loadProjects();
    bindEvents();
    startWalkingLoop();
    bindHoverListeners();
    initDevTool(); 
  }

  // ---- Dev Tools ----
  const dev = { isDrawing: false, polygon: [], svg: null, overlay: null };
  function initDevTool() {
      // Show existing path on startup
      renderActivePath();

      document.addEventListener('keydown', e => {
          if (e.ctrlKey && e.key === 'd') {
              dev.isDrawing = !dev.isDrawing;
              if (dev.isDrawing) {
                  dev.polygon = [];
                  if (!dev.svg) {
                      dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                      dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:9998;');
                      $('#floor-wrapper').appendChild(dev.svg);
                  }
                  if (dev.overlay) dev.overlay.remove();
                  dev.svg.innerHTML = '';
                  showToast('info', '🖌️', 'Draw Mode: ON. Click floor! (Ctrl+D to finish)');
              } else {
                  const data = JSON.stringify(dev.polygon);
                  dev.overlay = document.createElement('div');
                  dev.overlay.setAttribute('style', 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); padding:20px; border-radius:12px; z-index:10000; border:1px solid #6366f1; width:80%; max-width:600px;');
                  dev.overlay.innerHTML = `
                      <h4 style="color:#6366f1; margin-bottom:10px;">Copy Walkable Path:</h4>
                      <textarea style="width:100%; height:120px; background:#111; color:#fff; border:1px solid #333; font-family:monospace; padding:10px; border-radius:4px;">${data}</textarea>
                      <button onclick="this.parentElement.remove()" style="margin-top:10px; padding:8px 16px; background:#6366f1; border:none; color:#fff; border-radius:4px; cursor:pointer;">Close</button>
                  `;
                  document.body.appendChild(dev.overlay);
                  showToast('success', '✅', 'Path generated below.');
                  renderActivePath(); // Refresh visualization
              }
          }
      });

      $('#floor-wrapper').addEventListener('mousedown', e => {
          if (!dev.isDrawing) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          dev.polygon.push({x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2))});
          
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', x + '%'); circle.setAttribute('cy', y + '%');
          circle.setAttribute('r', '4'); circle.setAttribute('fill', '#f43f5e');
          dev.svg.appendChild(circle);
          
          if (dev.polygon.length > 1) {
              const p1 = dev.polygon[dev.polygon.length - 2], p2 = dev.polygon[dev.polygon.length - 1];
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', p1.x + '%'); line.setAttribute('y1', p1.y + '%');
              line.setAttribute('x2', p2.x + '%'); line.setAttribute('y2', p2.y + '%');
              line.setAttribute('stroke', '#f43f5e'); line.setAttribute('stroke-width', '2');
              dev.svg.appendChild(line);
          }
      });
  }

  function renderActivePath() {
      if (WALKABLE_PATH.length < 3) return;
      if (!dev.svg) {
          dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          dev.svg.setAttribute('viewBox', '0 0 100 100');
          dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:9998;');
          $('#floor-wrapper').appendChild(dev.svg);
      }
      dev.svg.innerHTML = '';
      const points = WALKABLE_PATH.map(p => `${p.x},${p.y}`).join(' ');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', 'rgba(99, 102, 241, 0.2)');
      polygon.setAttribute('stroke', '#6366f1');
      polygon.setAttribute('stroke-width', '0.5'); // Adjusted for 100x100 coordinate space
      polygon.setAttribute('stroke-dasharray', '1,1');
      dev.svg.appendChild(polygon);
  }

  function isPointInPolygon(point, vs) {
      if (!vs || vs.length < 3) return true;
      let x = point.x, y = point.y;
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          let xi = vs[i].x, yi = vs[i].y;
          let xj = vs[j].x, yj = vs[j].y;
          let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
      }
      return inside;
  }

  // ---- Features ---- 
  function createParticles() {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 8 + 's';
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
    dom.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    dom.deleteConfirmBtn.addEventListener('click', handleDelete);

    // Settings Menu
    if (dom.settingsBtn) {
        dom.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.settingsMenu.classList.toggle('hidden');
        });
    }
    
    if (dom.toggleVisualsBtn) {
        dom.toggleVisualsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.classList.toggle('show-visuals');
            dom.settingsMenu.classList.add('hidden');
            const isActive = document.body.classList.contains('show-visuals');
            showToast('info', isActive ? '👁️' : '🕶️', `Visualization ${isActive ? 'Enabled' : 'Disabled'}`);
        });
    }

    document.addEventListener('click', () => {
        if (dom.settingsMenu) dom.settingsMenu.classList.add('hidden');
    });
    
    dom.modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSpawn();
        if (e.key === 'Escape') closeModal();
    });

    [dom.modal, dom.deleteModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) { closeModal(); closeDeleteModal(); } });
    });

    // Global Keydown
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(); closeDeleteModal();
            // Hide topmost window
            const visiblePanels = Object.values(state.terminals).map(t => t.panel).filter(p => p && !p.classList.contains('hidden'));
            if (visiblePanels.length > 0) {
                // Find highest z-index
                const topPanel = visiblePanels.reduce((prev, curr) => (parseInt(curr.style.zIndex || 0) > parseInt(prev.style.zIndex || 0) ? curr : prev));
                hideTerminal(topPanel.dataset.project);
            }
        }
    });

    // Hide all windows when clicking floor
    document.addEventListener('mousedown', (e) => {
        if (state.draggingWindow) return; // Prevent hides during drag
        if (!e.target.closest('.terminal-panel') && !e.target.closest('.robot-card') && !e.target.closest('.modal-overlay') && !e.target.closest('.spawn-btn')) {
            Object.keys(state.terminals).forEach(pName => {
                const t = state.terminals[pName];
                if (t && t.panel && !t.panel.classList.contains('hidden')) {
                    hideTerminal(pName);
                }
            });
        }
    });

    window.addEventListener('resize', () => {
        Object.values(state.terminals).forEach(t => {
            if (t.isMaximized && t.panel) {
                t.panel.style.width = (window.innerWidth - 40) + 'px';
                t.panel.style.height = (window.innerHeight - 40) + 'px';
            }
            if (t.fitAddon && t.ready && !t.panel.classList.contains('hidden')) {
                try { t.fitAddon.fit(); } catch (e) {}
            }
        });
    });
  }

  function bindHoverListeners() {
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

  // ---- Pathing & Walking Animation Logic ----
  const WALKABLE_PATH = [{"x":17.5,"y":73.75},{"x":19.25,"y":72.38},{"x":17.88,"y":63.63},{"x":50.75,"y":46.75},{"x":51.75,"y":55},{"x":54,"y":54.5},{"x":59.5,"y":58},{"x":63.38,"y":56.5},{"x":63.88,"y":59},{"x":66.13,"y":59.25},{"x":69.63,"y":57.88},{"x":84.13,"y":65.38},{"x":84.38,"y":69.5},{"x":86.63,"y":71.13},{"x":73.38,"y":78.5},{"x":73.5,"y":74},{"x":68.63,"y":71.38},{"x":67.75,"y":64.88},{"x":65.38,"y":64.88},{"x":63.88,"y":65.88},{"x":63.88,"y":70.63},{"x":60.5,"y":75.25},{"x":40.63,"y":63.75},{"x":33.75,"y":71.63},{"x":33.88,"y":82.63},{"x":17.5,"y":74.13}];

  function pickSafePoint() {
      if (WALKABLE_PATH.length < 3) return { x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 };
      // Pick a random point and check if it's safe
      for (let i = 0; i < 50; i++) {
          const p = { x: Math.random() * 100, y: Math.random() * 100 };
          if (isPointInPolygon(p, WALKABLE_PATH)) return p;
      }
      return WALKABLE_PATH[Math.floor(Math.random() * WALKABLE_PATH.length)];
  }

  function startWalkingLoop() {
    setInterval(() => {
        const projectNames = state.projects.map(p => p.name);
        
        projectNames.forEach(name => {
            let r = state.walkingRobots[name];
            if (!r) {
                const start = pickSafePoint();
                const target = pickSafePoint();
                r = state.walkingRobots[name] = {
                    x: start.x, y: start.y,
                    tx: target.x, ty: target.y,
                    speed: 0.07 + Math.random() * 0.13, // 2/3 of original speed for better pacing
                    isWalking: true, isHovered: false, isThinking: false, hasUpdate: false,
                    isIllegal: false
                };
            }

            // Boundary check: just flag if they drifted out so we can color the dot red
            r.isIllegal = !isPointInPolygon({x: r.x, y: r.y}, WALKABLE_PATH);

            // Stop if its terminal is open AND visible, or if hovered
            const t = state.terminals[name];
            const isWindowVisible = t && t.panel && !t.panel.classList.contains('hidden');
            r.isWalking = !(isWindowVisible || r.isHovered);

            if (r.isWalking) {
                const dx = r.tx - r.x;
                const dy = r.ty - r.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 1.5) { // Arrived at target
                    const next = pickSafePoint();
                    r.tx = next.x; r.ty = next.y;
                } else {
                    const nextX = r.x + (dx / dist) * r.speed;
                    const nextY = r.y + (dy / dist) * r.speed;
                    
                    if (r.isIllegal) {
                        // If they somehow slipped outside, let them smoothly glide back 
                        // towards safety instead of teleporting them violently.
                        r.x = nextX; r.y = nextY;
                    } else if (isPointInPolygon({x: nextX, y: nextY}, WALKABLE_PATH)) {
                        // Safe step inside
                        r.x = nextX; r.y = nextY;
                    } else {
                        // Hit a wall while inside. Smoothly turn to a new safe target.
                        const next = pickSafePoint();
                        r.tx = next.x; r.ty = next.y;
                    }
                }
            }
        });

        // Resolve Collisions
        for (let i = 0; i < projectNames.length; i++) {
            for (let j = i + 1; j < projectNames.length; j++) {
                const r1 = state.walkingRobots[projectNames[i]];
                const r2 = state.walkingRobots[projectNames[j]];
                if (!r1 || !r2) continue;
                
                const dx = r1.x - r2.x;
                const dy = r1.y - r2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 12) { // Minimum distance percentage
                    const force = (12 - dist) * 0.1; // Repulsion force
                    const angle = Math.atan2(dy, dx);
                    if (r1.isWalking && !r1.isHovered) { r1.x += Math.cos(angle) * force; r1.y += Math.sin(angle) * force; }
                    if (r2.isWalking && !r2.isHovered) { r2.x -= Math.cos(angle) * force; r2.y -= Math.sin(angle) * force; }
                    // Keep bounds
                    r1.x = Math.max(0, Math.min(r1.x, 90)); r1.y = Math.max(0, Math.min(r1.y, 90));
                    r2.x = Math.max(0, Math.min(r2.x, 90)); r2.y = Math.max(0, Math.min(r2.y, 90));
                }
            }
        }

        // Apply DOM
        projectNames.forEach(name => {
            const r = state.walkingRobots[name];
            if (!r) return;
            const el = dom.robotCards.querySelector(`[data-project="${name}"]`);
            if (el) {
                el.style.left = r.x + '%';
                el.style.top = r.y + '%';
                
                if (r.isThinking) el.classList.add('thinking');
                else el.classList.remove('thinking');
                
                if (r.hasUpdate) el.classList.add('has-update');
                else el.classList.remove('has-update');
            }
        });
    }, 80);
  }

  // ---- Modal & Projects ----
  async function openModal() {
    dom.modal.classList.remove('hidden'); dom.modalInput.value = ''; dom.nicknameInput.value = ''; dom.customPathInput.value = '';
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
    // Hide dropdown in terminal
    const t = state.terminals[project.name];
    if (t && t.panel) {
        const d = t.panel.querySelector('.terminal-dropdown');
        if (d) d.classList.add('hidden');
    }
  }
  function closeDeleteModal() { dom.deleteModal.classList.add('hidden'); }

  async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        state.projects = await res.json();
        renderRobots();
        // pre-init terminals invisibly
        state.projects.forEach(project => setupTerminal(project.name, false));
    } catch (err) {}
  }

  async function handleSpawn() {
    const name = dom.modalInput.value.trim();
    const nickname = dom.nicknameInput.value.trim();
    const customPath = dom.customPathInput.value.trim();
    const model = dom.modelSelect.value;
    if (!name) return showToast('error', '❌', 'Name required');
    dom.modalConfirm.disabled = true;
    try {
        const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, nickname, model, customPath }) });
        const data = await res.json();
        if (!res.ok) return showToast('error', '❌', data.error);
        state.projects.push(data);
        closeModal(); renderRobots();
        setupTerminal(data.name, true);
    } catch (err) {} finally { dom.modalConfirm.disabled = false; }
  }

  async function handleDelete() {
    const project = state.projectToDelete; if (!project) return;
    try {
        await fetch(`/api/projects/${encodeURIComponent(project.name)}`, { method: 'DELETE' });
        state.projects = state.projects.filter(p => p.name !== project.name);
        if (state.terminals[project.name]) { 
            state.terminals[project.name].ws.close(); 
            if (state.terminals[project.name].panel) state.terminals[project.name].panel.remove(); 
            delete state.terminals[project.name]; 
        }
        delete state.walkingRobots[project.name];
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
        const t = state.terminals[p.name];
        const isReady = t && t.ready;
        const isVisible = t && t.panel && !t.panel.classList.contains('hidden');
        const r = state.walkingRobots[p.name];
        const posStyle = r ? `left: ${r.x}%; top: ${r.y}%;` : '';
        const isIllegal = r?.isIllegal;
        
        const topLabel = p.nickname || p.name;
        const bottomLabel = p.nickname ? p.name : '';

        return `
            <div class="robot-avatar ${isVisible ? 'active' : ''} ${!isReady ? 'initializing' : ''} ${r?.isThinking ? 'thinking' : ''} ${r?.hasUpdate ? 'has-update' : ''}" 
                 data-project="${p.name}" style="${posStyle}"
                 onclick="window.vagents.openTerminal('${p.name}')">
                <div class="robot-label top">${topLabel}</div>
                <div class="robot-thought-bubble">💭</div>
                <div class="robot-check-badge"></div>
                <span class="robot-card-emoji">${emoji}</span>
                <div class="robot-label bottom">${bottomLabel}</div>
                <div class="robot-card-status">${isReady ? '<span class="dot ready"></span>Ready' : 'Warming up...'}</div>
                <div class="robot-anchor-dot ${isIllegal ? 'illegal' : ''}"></div>
            </div>`;
    }).join('');
  }

  // ---- Terminal Management ----
  function bringToFront(panel) {
    state.topZIndex += 1;
    panel.style.zIndex = state.topZIndex;
    
    // Auto-fit and scroll to bottom when brought to front
    const pName = panel.dataset.project;
    const t = state.terminals[pName];
    if (t && t.fitAddon && !panel.classList.contains('hidden')) {
        setTimeout(() => {
            try {
                t.fitAddon.fit();
                t.term.scrollToBottom();
            } catch(e) {}
        }, 50);
    }
  }


  function openTerminal(pName) {
    if (!state.terminals[pName] || !state.terminals[pName].ready) return showToast('info', '⏳', 'Warming up...');
    
    // Clear update badge
    if (state.walkingRobots[pName]) {
        state.walkingRobots[pName].hasUpdate = false;
        state.walkingRobots[pName].isHovered = false; // Safety
    }

    setupTerminal(pName, true);
  }

  function bindWindowEvents(pName, panel, tState) {
    const closeDot = panel.querySelector('.terminal-close-dot');
    const maxDot = panel.querySelector('.terminal-maximize-dot');
    const menuBtn = panel.querySelector('.terminal-menu-btn');
    const dropdown = panel.querySelector('.terminal-dropdown');
    const deleteBtn = panel.querySelector('.terminal-delete-btn');
    const header = panel.querySelector('.terminal-header');

    // Focus on click
    panel.addEventListener('mousedown', () => bringToFront(panel));

    closeDot.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTerminal(pName);
    });

    maxDot.addEventListener('click', (e) => {
        e.stopPropagation();
        bringToFront(panel);
        if (tState.isMaximized) {
            const r = tState.prevRect || {width: 850, height: 550, left: window.innerWidth/2 - 425, top: 100};
            panel.style.width = r.width + 'px'; panel.style.height = r.height + 'px';
            panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
            tState.isMaximized = false;
        } else {
            tState.prevRect = panel.getBoundingClientRect();
            panel.style.left = '20px'; panel.style.top = '20px';
            panel.style.width = (window.innerWidth - 40) + 'px';
            panel.style.height = (window.innerHeight - 40) + 'px';
            panel.style.transform = 'none';
            tState.isMaximized = true;
        }
        setTimeout(() => { 
            if (tState.fitAddon) { 
                tState.fitAddon.fit(); 
                tState.ws.send(JSON.stringify({ type: 'resize', cols: tState.term.cols, rows: tState.term.rows })); 
            } 
        }, 300);
    });

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    panel.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });

    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = state.projects.find(x => x.name === pName);
        if (p) openDeleteModal(p);
    });

    // Draggable
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.terminal-dot') || e.target.closest('.terminal-menu-container')) return;
        if (tState.isMaximized) return;
        
        bringToFront(panel);
        state.draggingWindow = panel;
        panel.classList.add('dragging');
        
        const rect = panel.getBoundingClientRect();
        panel.style.transform = 'none';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.margin = '0';

        state.dragOffset.x = e.clientX - rect.left;
        state.dragOffset.y = e.clientY - rect.top;
        
        document.addEventListener('mousemove', onDragging);
        document.addEventListener('mouseup', stopDragging);
    });

    function onDragging(e) {
        if (!state.draggingWindow) return;
        const panel = state.draggingWindow;
        let x = e.clientX - state.dragOffset.x;
        let y = e.clientY - state.dragOffset.y;
        x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    }

    function stopDragging() {
        if (!state.draggingWindow) return;
        const panel = state.draggingWindow;
        panel.classList.remove('dragging');
        state.draggingWindow = null;
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', stopDragging);
        // Retrigger fit on active dragged window
        const t = state.terminals[panel.dataset.project];
        if (t && t.fitAddon) try { t.fitAddon.fit(); } catch(e){}
    }
  }

  function setupTerminal(pName, showUI = false) {
    let t = state.terminals[pName];

    if (!t) {
        // Clone Template
        const clone = dom.terminalTemplate.content.cloneNode(true);
        const panel = clone.querySelector('.terminal-panel');
        panel.dataset.project = pName;
        // Apply staggering random position slightly so multi-windows don't 100% overlap
        const offset = Math.floor(Math.random() * 40) - 20; 
        panel.style.top = `${100 + offset}px`;
        panel.style.left = `calc(50% - 425px + ${offset}px)`;

        const container = panel.querySelector('.terminal-container');
        
        // Metadata
        const meta = state.projects.find(x => x.name === pName);
        panel.querySelector('.terminal-title').textContent = meta ? meta.nickname : pName;
        panel.querySelector('.terminal-project-badge').textContent = meta ? meta.model : '';
        
        dom.mainContent.appendChild(panel);

        const term = new Terminal({ 
            fontFamily: "var(--font-mono)", 
            fontSize: 13, 
            lineHeight: 1.2,
            scrollback: 5000,
            cursorBlink: true,
            theme: { 
                background: '#0d1117', 
                foreground: '#e6edf3',
                cursor: '#6366f1',
                selectionBackground: 'rgba(99, 102, 241, 0.3)'
            } 
        });
        const fit = new FitAddon.FitAddon();
        term.loadAddon(fit); 
        term.open(container);

        
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(pName)}`);
        
        t = { 
            term, fitAddon: fit, ws, panel, container, ready: false, 
            thinkingTimer: null, isMaximized: false, prevRect: null 
        };
        state.terminals[pName] = t;
        
        bindWindowEvents(pName, panel, t);

        // --- Handle File Drag & Drop ---
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('drag-over');
        });
        
        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Prevent flickering when dragging over child elements
            if (e.relatedTarget && container.contains(e.relatedTarget)) return;
            container.classList.remove('drag-over');
        });
        
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('drag-over');
            
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                // Take first matched file (currently single item drag drop support)
                const file = e.dataTransfer.files[0];
                const reader = new FileReader();
                
                reader.onload = async (event) => {
                    const base64Data = event.target.result;
                    try {
                        showToast('info', '⏳', `Uploading ${file.name}...`);
                        const res = await fetch(`/api/projects/${encodeURIComponent(pName)}/upload`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: file.name, filedata: base64Data })
                        });
                        const data = await res.json();
                        if (data.success) {
                            showToast('success', '✅', `Uploaded: ${file.name}`);
                            // Paste absolute path directly into the terminal
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'input', data: `"${data.absolutePath}" ` }));
                                term.focus();
                            }
                        } else {
                            showToast('error', '❌', data.error || 'Upload failed');
                        }
                    } catch (err) {
                        showToast('error', '❌', 'Failed to upload file');
                    }
                };
                reader.readAsDataURL(file);
            }
        });


        ws.onopen = () => { setTimeout(() => { if (ws.readyState === WebSocket.OPEN) { try { fit.fit(); } catch(e) {} ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })); t.ready = true; renderRobots(); } }, 1000); };
        ws.onmessage = (e) => { 
            try { 
                const msg = JSON.parse(e.data); 
                if (msg.type === 'output') {
                    term.write(msg.data); 
                    const robot = state.walkingRobots[pName];
                    if (robot) {
                        const raw = msg.data;
                        const cleanText = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                        
                        // Check for the specific spinner characters (✽, ✢, ✥) or the old patterns
                        const isThinkingPattern = /✽|✢|✥|thinking/i.test(raw) || /[a-z]*ing\.\.\./i.test(cleanText) || /\.\.\.\s*\(\d+/i.test(cleanText);
                        if (isThinkingPattern) {
                            robot.isThinking = true;
                            if (t.thinkingTimer) clearTimeout(t.thinkingTimer);
                            t.thinkingTimer = setTimeout(() => {
                                const isHidden = t.panel.classList.contains('hidden');
                                if (robot.isThinking && isHidden) {
                                    const m = state.projects.find(x => x.name === pName);
                                    showToast('success', '✅', `${m ? m.nickname : pName} is ready!`);
                                    robot.hasUpdate = true;
                                    renderRobots();
                                }
                                robot.isThinking = false;
                            }, 3000);
                        } else if (raw.length > 20 && !raw.includes('\u001b')) {
                            const isHidden = t.panel.classList.contains('hidden');
                            if (robot.isThinking && isHidden) {
                                const m = state.projects.find(x => x.name === pName);
                                showToast('success', '✅', `${m ? m.nickname : pName} has finished thinking.`);
                                robot.hasUpdate = true;
                                renderRobots();
                            }
                            robot.isThinking = false;
                        }
                    }
                }
            } catch (err) {} 
        };
        term.onData(d => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d })); });
    }

    if (showUI) {
        t.panel.classList.remove('hidden');
        bringToFront(t.panel);
        renderRobots(); 
        
        setTimeout(() => { 
            try { 
                t.fitAddon.fit(); 
                t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows })); 
                setTimeout(() => {
                    t.term.scrollToBottom(); 
                    t.term.focus(); 
                    t.term.refresh(0, t.term.rows - 1);
                }, 50);
            } catch(e) {} 
        }, 350);
    }
  }

  function hideTerminal(pName) { 
    const t = state.terminals[pName];
    if (t && t.panel) {
        t.panel.classList.add('hidden');
    }
    
    if (state.walkingRobots[pName]) {
        state.walkingRobots[pName].isWalking = true;
        state.walkingRobots[pName].isHovered = false;
    }
    renderRobots(); 
  }

  function showToast(type, icon, msg) {
    const t = document.createElement('div'); t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    dom.toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 4000);
  }

  window.vagents = { 
      openTerminal,
      setHover: (name, isActive) => {
          if (state.walkingRobots[name]) state.walkingRobots[name].isHovered = isActive;
      }
  };
  document.addEventListener('DOMContentLoaded', init);
})();
