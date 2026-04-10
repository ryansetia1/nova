/* ============================================
   NOVA — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- Helpers ----
  function getAppearanceHtml(appearance, className = "") {
      if (appearance && appearance.startsWith('SPRITE:')) {
          const charName = appearance.split(':')[1];
          return `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" class="avatar-icon ${className}" alt="${charName}" onerror="this.style.display='none'">`;
      }
      return `<span class="${className}">${appearance || '🪐'}</span>`;
  }

  // ---- State ----
  const state = {
    projects: [],
    agentToDelete: null,
    terminals: {}, 
    draggingWindow: null, // the element being dragged
    dragOffset: { x: 0, y: 0 },
    resizingWindow: null,
    resizeStart: { w: 0, h: 0, x: 0, y: 0 },
    topZIndex: 100000,
    selectedEmoji: '🪐',
    updateSelectedEmoji: '🪐',
    spawnAppearanceType: 'emoji', // 'emoji' or 'character'
    updateAppearanceType: 'emoji',
    walkingRobots: {}, // { name: { x, y, tx, ty, speed, isWalking, isHovered, isThinking, hasUpdate, frame } }
    projectForEmojiUpdate: null,
    charFrames: Array.from({ length: 31 }, (_, i) => `assets/characters/Char1/Walk/Char1Walk_${(i + 1).toString().padStart(5, '0')}.png`),
    idleFrames: Array.from({ length: 86 }, (_, i) => `assets/characters/Char1/Idle/Char1Idle_${(i + 1).toString().padStart(5, '0')}.png`),
    anchor: { x: 50, y: 85 },
    originalAnchor: { x: 50, y: 85 }
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
    orphanedGroup: $('#orphaned-selector-group'),
    orphanedSelect: $('#orphaned-select'),
    robotCards: $('#robot-cards'),
    emptyState: $('#empty-state'),
    mainContent: $('#main-content'),
    terminalTemplate: $('#terminal-template'),
    toastContainer: $('#toast-container'),
    particles: $('#particles'),
    deleteModal: $('#delete-modal'),
    deleteAgentName: $('#delete-agent-name'),
    deleteCancelBtn: $('#delete-cancel-btn'),
    deleteAgentOnlyBtn: $('#delete-agent-only-btn'),
    deleteConfirmBtn: $('#delete-confirm-btn'),
    settingsBtn: $('#settings-btn'),
    settingsMenu: $('#settings-menu'),
    toggleVisualsBtn: $('#toggle-visuals-btn'),
    toggleStyleBtn: $('#toggle-style-btn'),
    emojiPicker: $('#emoji-picker'),
    emojiPreview: $('#selected-emoji-preview'),
    emojiUpdateModal: $('#emoji-update-modal'),
    emojiUpdateCancel: $('#emoji-update-cancel-btn'),
    emojiUpdateSaveBtn: $('#emoji-update-save-btn'),
    updateEmojiPicker: $('#update-emoji-picker'),
    
    // Per-Agent Style Selectors
    spawnTypeToggle: $('#spawn-avatar-type-toggle'),
    spawnEmojiZone: $('#spawn-emoji-trigger-area'),
    spawnCharZone: $('#spawn-character-hint-area'),
    spawnCharacterArea: $('#spawn-character-area'),
    spawnCharacterSelect: $('#spawn-character-select'),

    updateTypeToggle: $('#update-avatar-type-toggle'),
    updateEmojiArea: $('#update-emoji-area'),
    updateCharacterArea: $('#update-character-area'),
    updateCharacterSelect: $('#update-character-select'),
    updateEmojiPreview: $('#update-emoji-preview'),
    updateEmojiHint: $('#update-emoji-hint-container'),

    // New Emoji Popover elements
    emojiTrigger: $('#emoji-trigger'),
    emojiPopover: $('#emoji-popover'),
    modalEmojiPicker: $('#modal-emoji-picker'),

    // Loader
    loader: $('#app-loader'),
    loaderProgress: $('#loader-progress'),
    loaderStatus: $('.loader-status'),

    // Anchor Adj
    inputAnchorX: $('#input-anchor-x'),
    inputAnchorY: $('#input-anchor-y'),
    valAnchorX: $('#val-anchor-x'),
    valAnchorY: $('#val-anchor-y'),
  };

  // ---- Initialization ----
  async function init() {
    createParticles();
    startClock();
    
    // Preload all heavy assets first
    await preloadAllAssets();
    
    await loadWalkablePath(); // Load path before starting walking loop
    await loadAnchorConfig(); // Load anchor before starting
    loadProjects();
    bindEvents();
    startWalkingLoop();
    bindHoverListeners();
    initDevTool(); 
    initEmojiPopover();
    initAnchorAdjuster();
    initThemeControl();
    
    // Hide loader after a tiny delay for smoothness
    setTimeout(() => {
        if (dom.loader) dom.loader.classList.add('hidden');
    }, 500);
  }

  async function preloadAllAssets() {
    const assets = [
        'assets/office/day/office_bg_day.png',
        'assets/office/day/office_fg_day.png',
        'assets/office/night/office_bg_night.png',
        'assets/office/night/office_fg_night.png',
        'assets/office/night/office_fx_night.png',
        ...state.charFrames,
        ...state.idleFrames
    ];

    let loaded = 0;
    const total = assets.length;

    const promises = assets.map((src, index) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loaded++;
                const percent = (loaded / total) * 100;
                if (dom.loaderProgress) dom.loaderProgress.style.width = percent + '%';
                
                if (dom.loaderStatus) {
                    if (loaded < total * 0.2) dom.loaderStatus.textContent = 'Loading HQ Environment...';
                    else if (loaded < total * 0.8) dom.loaderStatus.textContent = 'Syncing Agent Sprites...';
                    else dom.loaderStatus.textContent = 'Finalizing Neural Workspace...';
                }
                resolve();
            };
            img.onerror = () => {
                loaded++; // Skip failed
                resolve();
            };
        });
    });

    // Fail-safe: Maximum 4 seconds loading screen for slow internets
    await Promise.race([
        Promise.all(promises),
        new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  }

  // ---- Dev Tools ----
  const dev = { isActive: false, mode: 'draw', polygon: [], originalPolygon: [], svg: null, toolbar: null, draggingIndex: null };
  function initDevTool() {
      renderActivePath();

      document.addEventListener('keydown', e => {
          if (e.ctrlKey && e.key === 'd') {
              dev.isActive = !dev.isActive;
              if (dev.isActive) {
                  enterDevMode();
              } else {
                  exitDevMode();
              }
          }
      });

      function enterDevMode() {
          dev.originalPolygon = [...WALKABLE_PATH];
          dev.polygon = [...WALKABLE_PATH];
          document.body.classList.add('drawing-mode');
          showDevToolbar();
          initDevSvg();
          renderActivePath();
          showToast('info', '🛠️', 'Dev Mode: ON. Use toolbar to Draw or Tweak.');
      }

      function exitDevMode(save = true) {
          document.body.classList.remove('drawing-mode');
          if (dev.toolbar) dev.toolbar.remove();
          dev.toolbar = null;
          if (save && dev.polygon.length >= 3) {
              saveWalkablePath(dev.polygon);
          } else if (!save) {
              dev.polygon = [...dev.originalPolygon];
              showToast('info', '📂', 'Changes discarded.');
          }
          renderActivePath();
      }

      function initDevSvg() {
          if (!dev.svg) {
              dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              dev.svg.id = 'dev-svg-layer';
              dev.svg.setAttribute('viewBox', '0 0 100 100');
              dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:30000;');
              $('#floor-wrapper').appendChild(dev.svg);
          }
          dev.svg.style.pointerEvents = 'auto'; // Enable for interaction
      }

      function showDevToolbar() {
          if (dev.toolbar) dev.toolbar.remove();
          dev.toolbar = document.createElement('div');
          dev.toolbar.id = 'dev-toolbar';
          dev.toolbar.setAttribute('style', 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(13,17,28,0.95); padding:8px; border-radius:12px; z-index:40000; border:1px solid #3b82f6; display:flex; gap:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px);');
          
          const btnStyle = 'padding:6px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; cursor:pointer; font-size:12px; transition:all 0.2s;';
          
          dev.toolbar.innerHTML = `
              <button id="dev-btn-draw" style="${btnStyle} ${dev.mode === 'draw' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🖋️ Draw</button>
              <button id="dev-btn-tweak" style="${btnStyle} ${dev.mode === 'tweak' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🎯 Tweak</button>
              <div style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
              <button id="dev-btn-clear" style="${btnStyle}">🗑️ Clear</button>
              <button id="dev-btn-cancel" style="${btnStyle}">❌ Cancel</button>
              <button id="dev-btn-save" style="${btnStyle} background:#10b981; border-color:#10b981;">✅ Save & Exit</button>
          `;
          
          document.body.appendChild(dev.toolbar);
          
          dev.toolbar.querySelector('#dev-btn-draw').onclick = () => setDevMode('draw');
          dev.toolbar.querySelector('#dev-btn-tweak').onclick = () => setDevMode('tweak');
          dev.toolbar.querySelector('#dev-btn-clear').onclick = () => { dev.polygon = []; renderActivePath(); };
          dev.toolbar.querySelector('#dev-btn-cancel').onclick = () => { dev.isActive = false; exitDevMode(false); };
          dev.toolbar.querySelector('#dev-btn-save').onclick = () => { dev.isActive = false; exitDevMode(true); };
      }

      function setDevMode(mode) {
          dev.mode = mode;
          if (mode === 'draw') {
              dev.polygon = []; // Fresh start for Draw Mode as requested
          } else if (mode === 'tweak' && dev.polygon.length === 0) {
              dev.polygon = [...WALKABLE_PATH]; // Restore if empty when switching to Tweak
          }
          showDevToolbar();
          renderActivePath();
          showToast('info', '⚙️', `Switched to ${mode.toUpperCase()} mode`);
      }

      $('#floor-wrapper').addEventListener('mousedown', e => {
          if (!dev.isActive) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
          const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));

          if (dev.mode === 'draw') {
              dev.polygon.push({x, y});
              renderActivePath();
          } else if (dev.mode === 'tweak') {
              // Check if clicking a point
              const hitIndex = dev.polygon.findIndex(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < 2);
              if (hitIndex !== -1) {
                  dev.draggingIndex = hitIndex;
                  document.addEventListener('mousemove', onTweakMove);
                  document.addEventListener('mouseup', onTweakUp);
              }
          }
      });

      function onTweakMove(e) {
          if (dev.draggingIndex === null) return;
          const rect = $('#floor-wrapper').getBoundingClientRect();
          let x = ((e.clientX - rect.left) / rect.width) * 100;
          let y = ((e.clientY - rect.top) / rect.height) * 100;
          x = parseFloat(Math.max(0, Math.min(100, x)).toFixed(2));
          y = parseFloat(Math.max(0, Math.min(100, y)).toFixed(2));
          
          dev.polygon[dev.draggingIndex] = {x, y};
          renderActivePath();
      }

      function onTweakUp() {
          dev.draggingIndex = null;
          document.removeEventListener('mousemove', onTweakMove);
          document.removeEventListener('mouseup', onTweakUp);
      }
  }

  function renderActivePath() {
      const targetPolygon = dev.isActive ? dev.polygon : WALKABLE_PATH;
      if (targetPolygon.length < 1) { if (dev.svg) dev.svg.innerHTML = ''; return; }
      
      if (!dev.svg) {
          dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          dev.svg.id = 'dev-svg-layer';
          dev.svg.setAttribute('viewBox', '0 0 100 100');
          dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:30000;');
          $('#floor-wrapper').appendChild(dev.svg);
      }
      dev.svg.innerHTML = '';
      
      // Draw Polygon
      if (targetPolygon.length >= 3) {
          const points = targetPolygon.map(p => `${p.x},${p.y}`).join(' ');
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', points);
          poly.setAttribute('fill', 'rgba(59, 130, 246, 0.2)');
          poly.setAttribute('stroke', '#3b82f6');
          poly.setAttribute('stroke-width', '0.4');
          poly.setAttribute('stroke-dasharray', '1,1');
          dev.svg.appendChild(poly);
      } else if (targetPolygon.length >= 2) {
          // Draw lines for incomplete polygon
          for (let i = 0; i < targetPolygon.length - 1; i++) {
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', targetPolygon[i].x); line.setAttribute('y1', targetPolygon[i].y);
              line.setAttribute('x2', targetPolygon[i+1].x); line.setAttribute('y2', targetPolygon[i+1].y);
              line.setAttribute('stroke', '#3b82f6'); line.setAttribute('stroke-width', '0.4');
              dev.svg.appendChild(line);
          }
      }

      // Draw Interaction Handles
      if (dev.isActive) {
          targetPolygon.forEach((p, i) => {
              const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
              circle.setAttribute('r', dev.mode === 'tweak' ? '1.2' : '0.8');
              circle.setAttribute('fill', dev.mode === 'tweak' ? '#fbbf24' : '#f43f5e');
              circle.setAttribute('stroke', '#fff');
              circle.setAttribute('stroke-width', '0.2');
              if (dev.mode === 'tweak') circle.setAttribute('style', 'cursor:move; pointer-events:auto;');
              dev.svg.appendChild(circle);
          });
      }
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
    const colors = ['#3b82f6', '#2563eb', '#06b6d4', '#10b981'];
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
    dom.deleteCancelBtn.addEventListener('click', closeDeleteAgentModal);
    
    dom.spawnCharacterSelect.onchange = () => {
        if (state.spawnAppearanceType === 'character') {
            const preview = document.getElementById('selected-emoji-preview');
            if (preview) preview.innerHTML = getAppearanceHtml('SPRITE:' + dom.spawnCharacterSelect.value);
        }
    };

    dom.orphanedSelect.addEventListener('change', (e) => {
        const pName = e.target.value;
        if (!pName) {
            dom.modalInput.disabled = false;
            dom.modalInput.value = '';
            dom.nicknameInput.value = '';
            dom.customPathInput.value = '';
        } else {
            const p = state.projects.find(x => x.name === pName);
            if (p) {
                dom.modalInput.value = p.name;
                dom.modalInput.disabled = true; // folder exists, can't change
                dom.nicknameInput.value = p.nickname || p.name;
                dom.customPathInput.value = p.customPath || '';
                if (p.emoji) {
                    state.selectedEmoji = p.emoji;
                    dom.emojiPreview.textContent = p.emoji;
                }
            }
        }
    });

    dom.deleteAgentOnlyBtn.addEventListener('click', () => handleDeleteAgent(false));
    dom.deleteConfirmBtn.addEventListener('click', () => handleDeleteAgent(true));

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

    function setupAppearanceToggles(toggleContainer, typeVarName, onTypeChange) {
        if (!toggleContainer) return;
        const btns = toggleContainer.querySelectorAll('.type-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                state[typeVarName] = type;
                btns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                if (onTypeChange) onTypeChange(type);
                
                // Update preview immediately when switching tabs
                const preview = document.getElementById(typeVarName === 'spawnAppearanceType' ? 'selected-emoji-preview' : 'update-emoji-preview');
                if (preview) {
                    let appearance = (typeVarName === 'spawnAppearanceType' ? state.selectedEmoji : state.updateSelectedEmoji) || '🪐';
                    if (state[typeVarName] === 'character') {
                        appearance = 'SPRITE:' + (typeVarName === 'spawnAppearanceType' ? dom.spawnCharacterSelect.value : dom.updateCharacterSelect.value);
                    }
                    preview.innerHTML = getAppearanceHtml(appearance);
                }
            });
        });
    }

    setupAppearanceToggles(dom.spawnTypeToggle, 'spawnAppearanceType', (type) => {
        if (type === 'emoji') {
            if (dom.spawnEmojiZone) dom.spawnEmojiZone.classList.remove('hidden');
            if (dom.spawnCharacterArea) dom.spawnCharacterArea.classList.add('hidden');
        } else {
            if (dom.spawnEmojiZone) dom.spawnEmojiZone.classList.add('hidden');
            if (dom.spawnCharacterArea) dom.spawnCharacterArea.classList.remove('hidden');
        }
    });

    setupAppearanceToggles(dom.updateTypeToggle, 'updateAppearanceType', (type) => {
        if (type === 'emoji') {
            dom.updateEmojiArea.classList.remove('hidden');
            dom.updateCharacterArea.classList.add('hidden');
            if (dom.updateEmojiHint) dom.updateEmojiHint.classList.remove('hidden');
        } else {
            dom.updateEmojiArea.classList.add('hidden');
            dom.updateCharacterArea.classList.remove('hidden');
            if (dom.updateEmojiHint) dom.updateEmojiHint.classList.add('hidden');
        }
    });

    if (dom.emojiUpdateSaveBtn) {
        dom.emojiUpdateSaveBtn.addEventListener('click', () => {
             let finalAppearance = state.updateSelectedEmoji || '🪐';
             if (state.updateAppearanceType === 'character') {
                 finalAppearance = 'SPRITE:' + dom.updateCharacterSelect.value;
             }
             handleEmojiUpdate(finalAppearance);
        });
    }

    if (dom.emojiUpdateCancel) {
        dom.emojiUpdateCancel.addEventListener('click', closeEmojiUpdateModal);
    }

    document.addEventListener('click', () => {
        if (dom.settingsMenu) dom.settingsMenu.classList.add('hidden');
    });
    
    // Emoji Picker Logic (Robust delegation)
    document.addEventListener('emoji-click', (e) => {
        if (e.target.id === 'modal-emoji-picker') {
            const emojiChar = e.detail.unicode || (e.detail.emoji && e.detail.emoji.unicode);
            if (emojiChar) {
                state.selectedEmoji = emojiChar;
                if (dom.emojiPreview) dom.emojiPreview.innerHTML = getAppearanceHtml(emojiChar);
            }
        }
        if (e.target.id === 'update-emoji-picker') {
            const emojiChar = e.detail.unicode || (e.detail.emoji && e.detail.emoji.unicode);
            if (emojiChar) {
                state.updateSelectedEmoji = emojiChar;
                if (dom.updateEmojiPreview) dom.updateEmojiPreview.innerHTML = getAppearanceHtml(emojiChar);
            }
        }
    });

    dom.modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSpawn();
        if (e.key === 'Escape') closeModal();
    });

    [dom.modal, dom.deleteModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) { closeModal(); closeDeleteAgentModal(); } });
    });

    // Global Keydown
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(); closeDeleteAgentModal();
            dom.emojiPopover.classList.add('hidden');
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
        
        // If we click the floor (not a panel, not a robot, not a button) -> hide all
        const isClickingSafeUI = e.target.closest('.terminal-panel') || 
                                e.target.closest('.robot-avatar') || 
                                e.target.closest('.modal-overlay') || 
                                e.target.closest('.settings-container') ||
                                e.target.closest('.spawn-btn');
                                
        if (!isClickingSafeUI) {
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

    // Emoji Update Listeners
    if (dom.emojiUpdateCancel) {
        dom.emojiUpdateCancel.addEventListener('click', closeEmojiUpdateModal);
    }
    if (dom.emojiUpdateModal) {
        dom.emojiUpdateModal.addEventListener('click', (e) => { 
            if (e.target === dom.emojiUpdateModal) closeEmojiUpdateModal(); 
        });
    }

    document.addEventListener('emoji-click', (e) => {
        if (e.target.id === 'update-emoji-picker') {
            const emojiChar = e.detail.unicode || (e.detail.emoji && e.detail.emoji.unicode);
            if (emojiChar) handleEmojiUpdate(emojiChar);
        }
    });
  }

  function bindHoverListeners() {
    dom.robotCards.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.robot-avatar');
        if (card) {
            const name = card.dataset.project;
            if (state.walkingRobots[name]) {
                if (!state.walkingRobots[name].isHovered) {
                    state.walkingRobots[name].isHovered = true;
                    state.walkingRobots[name].frame = 0;
                }
            }
        }
    });

    dom.robotCards.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.robot-avatar');
        if (card) {
            const name = card.dataset.project;
            // Only set to false if the mouse is actually leaving the card, not just moving to a child
            const nextElement = e.relatedTarget;
            if (!nextElement || !card.contains(nextElement)) {
                if (state.walkingRobots[name]) {
                    if (state.walkingRobots[name].isHovered) {
                        state.walkingRobots[name].isHovered = false;
                        state.walkingRobots[name].frame = 0;
                    }
                }
            }
        }
    });
  }

  // ---- Pathing & Walking Animation Logic ----
  let WALKABLE_PATH = [{"x":17.75,"y":73.69},{"x":53.13,"y":55.56},{"x":59.62,"y":58.94},{"x":67.63,"y":60.31},{"x":71.13,"y":58.31},{"x":88.13,"y":66.94},{"x":84,"y":67.94},{"x":85.88,"y":71.31},{"x":74,"y":77.69},{"x":70.63,"y":75.19},{"x":62.88,"y":80.06},{"x":59.62,"y":83.94},{"x":44,"y":74.94},{"x":33.13,"y":81.06},{"x":18.13,"y":73.81}];

  // ---- Theme Control (Day/Night) ----
  function initThemeControl() {
      const updateTheme = () => {
          const now = new Date();
          const hour = now.getHours();
          
          // Night is 6 PM (18:00) to 6 AM (06:00)
          const isNight = hour >= 18 || hour < 6;
          
          if (isNight) {
              if (!document.body.classList.contains('theme-night')) {
                  document.body.classList.add('theme-night');
              }
          } else {
              if (document.body.classList.contains('theme-night')) {
                  document.body.classList.remove('theme-night');
              }
          }
      };

      updateTheme();
      // Check every 30 seconds
      setInterval(updateTheme, 30000);
  }

  async function loadWalkablePath() {
      try {
          const res = await fetch('/api/walkable-path');
          const data = await res.json();
          if (Array.isArray(data) && data.length >= 3) {
              WALKABLE_PATH = data;
              renderActivePath();
          }
      } catch (err) { console.error('Failed to load path', err); }
  }

  async function saveWalkablePath(newPath) {
      try {
          const res = await fetch('/api/walkable-path', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: newPath })
          });
          if (res.ok) {
              WALKABLE_PATH = newPath;
              showToast('success', '💾', 'Walkable path saved & synced!');
              renderActivePath();
          }
      } catch (err) { showToast('error', '❌', 'Failed to save path'); }
  }

  async function loadAnchorConfig() {
      try {
          const res = await fetch('/api/anchor');
          const data = await res.json();
          if (typeof data.x === 'number' && typeof data.y === 'number') {
              state.anchor = { x: data.x, y: data.y };
              state.originalAnchor = { ...state.anchor };
              updateAnchorStyles(data.x, data.y);
          }
      } catch (err) { console.error('Failed to load anchor', err); }
  }

  async function saveAnchorConfig(x, y) {
      try {
          const res = await fetch('/api/anchor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: Number(x), y: Number(y) })
          });
          if (res.ok) {
              state.originalAnchor = { x, y };
              showToast('success', '⚓', 'Anchor configuration saved!');
          }
      } catch (err) { showToast('error', '❌', 'Failed to save anchor'); }
  }

  function updateAnchorStyles(x, y) {
      document.documentElement.style.setProperty('--anchor-x', `${x}%`);
      document.documentElement.style.setProperty('--anchor-y', `${y}%`);
      const inputX = $('#input-anchor-x');
      const inputY = $('#input-anchor-y');
      const valX = $('#val-anchor-x');
      const valY = $('#val-anchor-y');
      if (inputX) inputX.value = x;
      if (inputY) inputY.value = y;
      if (valX) valX.textContent = x;
      if (valY) valY.textContent = y;
  }

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
                    speed: 0.07 + Math.random() * 0.13,
                    isWalking: true, isHovered: false, isThinking: false, hasUpdate: false,
                    isIllegal: false, frame: 0, naturalIdleTimer: 0
                };
            }

            // Boundary check: just flag if they drifted out so we can color the dot red
            r.isIllegal = !isPointInPolygon({x: r.x, y: r.y}, WALKABLE_PATH);

            // Stop if its terminal is open AND visible, or if hovered, or if project is orphaned
            const p = state.projects.find(x => x.name === name);
            const t = state.terminals[name];
            const isWindowVisible = t && t.panel && !t.panel.classList.contains('hidden');
            const isOrphaned = p && !p.active;
            const isManualStop = isWindowVisible || r.isHovered || isOrphaned;
            
            if (r.naturalIdleTimer > 0) {
                r.naturalIdleTimer--;
                r.isWalking = false;
            } else {
                r.isWalking = !isManualStop;
                // Small chance to stop and idle randomly while walking
                if (r.isWalking && Math.random() < 0.002) {
                    r.naturalIdleTimer = 50 + Math.random() * 100;
                    r.frame = 0;
                }
            }

            if (r.isWalking) {
                const dx = r.tx - r.x;
                const dy = r.ty - r.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 1.5) { // Arrived at target
                    // Higher chance to idle when arriving
                    if (Math.random() < 0.5) {
                        r.naturalIdleTimer = 80 + Math.random() * 150;
                        r.frame = 0;
                    }
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

        // Resolve Collisions (Disabled by user request)
        /*
        for (let i = 0; i < projectNames.length; i++) {
            for (let j = i + 1; j < projectNames.length; j++) {
                const r1 = state.walkingRobots[projectNames[i]];
                const r2 = state.walkingRobots[projectNames[j]];
                if (!r1 || !r2) continue;
                
                const dx = r1.x - r2.x;
                const dy = r1.y - r2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 12) { // Minimum distance percentage
                    const force = (12 - dist) * 0.15; // Increased repulsion force
                    const angle = Math.atan2(dy, dx);
                    
                    // Stationary (hovered or orphaned) objects should be even harder to move
                    const canMove1 = r1.isWalking && !r1.isHovered;
                    const canMove2 = r2.isWalking && !r2.isHovered;

                    if (canMove1) {
                        const nx = r1.x + Math.cos(angle) * force;
                        const ny = r1.y + Math.sin(angle) * force;
                        if (isPointInPolygon({x: nx, y: ny}, WALKABLE_PATH)) {
                            r1.x = nx; r1.y = ny;
                        }
                    }
                    if (canMove2) {
                        const nx = r2.x - Math.cos(angle) * force;
                        const ny = r2.y - Math.sin(angle) * force;
                        if (isPointInPolygon({x: nx, y: ny}, WALKABLE_PATH)) {
                            r2.x = nx; r2.y = ny;
                        }
                    }
                }
            }
        }
        */

        // Apply DOM
        projectNames.forEach(name => {
            const r = state.walkingRobots[name];
            if (!r) return;
            const el = dom.robotCards.querySelector(`[data-project="${name}"]`);
            if (el) {
                el.style.left = r.x + '%';
                el.style.top = r.y + '%';
                // Depth Sorting: Agents further down (higher Y) should be on top
                el.style.zIndex = Math.floor(r.y * 100);
                
                // Animation Frame
                const isPlayingIdle = r.isHovered || r.naturalIdleTimer > 0;
                if (r.isWalking || isPlayingIdle) {
                    const frames = isPlayingIdle ? state.idleFrames : state.charFrames;
                    r.frame = (r.frame + 1) % frames.length;
                    const sprite = el.querySelector('.robot-char-sprite');
                    if (sprite) {
                        sprite.src = frames[r.frame];
                        // Flip based on direction
                        if (r.isWalking) {
                            const isFlipped = r.tx < r.x;
                            sprite.style.transform = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
                        } else {
                            // Reset flip when idle/hovered
                            sprite.style.transform = 'scaleX(1)';
                        }
                    }
                }

                if (r.isThinking) el.classList.add('thinking');
                else el.classList.remove('thinking');
                
                if (r.hasUpdate) el.classList.add('has-update');
                else el.classList.remove('has-update');
            }
        });
    }, 42); // ~24fps (1000/24 = 41.66)
  }

  // ---- Emoji Popover Logic ----
  function initEmojiPopover() {
    // Click outside to close for the spawn modal popover
    document.addEventListener('click', (e) => {
        if (dom.emojiPopover && !dom.emojiPopover.classList.contains('hidden')) {
            if (!dom.emojiPopover.contains(e.target) && !e.target.closest('.emoji-hint')) {
                dom.emojiPopover.classList.add('hidden');
            }
        }
    });
  }

  // ---- Modal & Projects ----
  async function openModal() {
    // Refresh projects list from server to ensure orphaned folders are up to date
    try {
        const pRes = await fetch('/api/projects');
        state.projects = await pRes.json();
    } catch (e) {
        console.warn('Failed to sync projects for modal', e);
    }

    dom.modal.classList.remove('hidden'); 
    dom.modalInput.value = ''; dom.modalInput.disabled = false;
    dom.nicknameInput.value = ''; dom.customPathInput.value = '';
    state.selectedEmoji = '🪐';
    state.spawnAppearanceType = 'emoji';
    if (dom.emojiPreview) dom.emojiPreview.innerHTML = getAppearanceHtml('🪐');
    dom.emojiPopover.classList.add('hidden');
    
    // Reset toggle UI
    if (dom.spawnTypeToggle) {
        const btns = dom.spawnTypeToggle.querySelectorAll('.type-btn');
        btns.forEach(b => b.classList.toggle('active', b.dataset.type === 'emoji'));
        dom.spawnEmojiZone.classList.remove('hidden');
        dom.spawnCharacterArea.classList.add('hidden');
    }
    
    // Check for orphaned projects to show selector
    // Use a more inclusive check for 'falsey' values
    const orphaned = state.projects.filter(p => p.active === false || p.active === "false" || !p.active);
    console.log(`[NOVA] Found ${orphaned.length} orphaned folders among ${state.projects.length} total projects.`);

    if (orphaned.length > 0) {
        dom.orphanedGroup.classList.remove('hidden');
        dom.orphanedGroup.style.display = 'block'; 
        dom.orphanedSelect.innerHTML = '<option value="">-- Choose an orphaned folder --</option>' + 
            orphaned.map(p => {
                const displayName = p.nickname || p.name;
                return `<option value="${p.name}">${displayName} (${p.name})</option>`;
            }).join('');
    } else {
        dom.orphanedGroup.classList.add('hidden');
        dom.orphanedGroup.style.display = 'none';
    }

    try {
        const res = await fetch('/api/models');
        const models = await res.json();
        dom.modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
        dom.modelSelect.value = models.includes('qwen3.5:cloud') ? 'qwen3.5:cloud' : models[0];
    } catch (e) { dom.modelSelect.innerHTML = '<option value="qwen3.5:cloud">qwen3.5:cloud</option>'; }
    setTimeout(() => dom.modalInput.focus(), 100);
  }
  function closeModal() { dom.modal.classList.add('hidden'); }
  
  function openEmojiUpdateModal(pName) {
    state.projectForEmojiUpdate = pName;
    const p = state.projects.find(x => x.name === pName);
    if (p && p.emoji && p.emoji.startsWith('SPRITE:')) {
        state.updateAppearanceType = 'character';
        if (dom.updateCharacterSelect) {
            dom.updateCharacterSelect.value = p.emoji.split(':')[1];
        }
    } else {
        state.updateAppearanceType = 'emoji';
        state.updateSelectedEmoji = p ? p.emoji : '🪐';
    }
    
    // Initial preview for update modal
    if (dom.updateEmojiPreview) {
        dom.updateEmojiPreview.innerHTML = getAppearanceHtml(p ? p.emoji : '🪐');
    }
    
    if (dom.updateTypeToggle) {
        const btns = dom.updateTypeToggle.querySelectorAll('.type-btn');
        btns.forEach(b => b.classList.toggle('active', b.dataset.type === state.updateAppearanceType));
        if (state.updateAppearanceType === 'emoji') {
            dom.updateEmojiArea.classList.remove('hidden');
            dom.updateCharacterArea.classList.add('hidden');
        } else {
            dom.updateEmojiArea.classList.add('hidden');
            dom.updateCharacterArea.classList.remove('hidden');
        }
    }
    dom.emojiUpdateModal.classList.remove('hidden');
  }
  function closeEmojiUpdateModal() {
    dom.emojiUpdateModal.classList.add('hidden');
    state.projectForEmojiUpdate = null;
  }
  async function handleEmojiUpdate(emoji) {
    const pName = state.projectForEmojiUpdate;
    if (!pName) return;
    try {
        const res = await fetch('/api/update-emoji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: pName, emoji })
        });
        if (!res.ok) {
            let errorMsg = 'Failed to update';
            try {
                const data = await res.json();
                errorMsg = data.error || errorMsg;
            } catch (jsonErr) {
                errorMsg = `Error ${res.status}: ${res.statusText}`;
            }
            return showToast('error', '❌', errorMsg);
        }
        
        // Update local state
        const project = state.projects.find(p => p.name === pName);
        if (project) project.emoji = emoji;
        
        // Update Terminal Header
        const t = state.terminals[pName];
        if (t && t.panel) {
        const emojiEl = t.panel.querySelector('.terminal-header-emoji');
        if (emojiEl) emojiEl.innerHTML = getAppearanceHtml(emoji);
        }
        
        closeEmojiUpdateModal();
        renderRobots(); // Refresh floor avatars
        showToast('success', '✨', 'Emoji updated!');
    } catch (err) {
        showToast('error', '❌', 'Failed to update emoji');
    }
  }

  function openDeleteAgentModal(project) {
    if (project.customPath) {
        // If it was created via custom path, it is likely a symlink
        // But we check for sure in the backend. 
        // User said: If symlink -> remove symlink only, no prompt.
        // I'll perform a quick check and if it's a symlink, just trigger it.
        handleDeleteAgent(false); 
        return;
    }

    state.agentToDelete = project;
    dom.deleteAgentName.textContent = project.nickname || project.name;
    dom.deleteModal.classList.remove('hidden');
    // Hide dropdown in terminal
    const t = state.terminals[project.name];
    if (t && t.panel) {
        const d = t.panel.querySelector('.terminal-dropdown');
        if (d) d.classList.add('hidden');
    }
  }
  function closeDeleteAgentModal() { dom.deleteModal.classList.add('hidden'); }

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
    let emoji = state.selectedEmoji || '🪐';
    if (state.spawnAppearanceType === 'character') {
         emoji = 'SPRITE:' + dom.spawnCharacterSelect.value;
    }
    if (!name) return showToast('error', '❌', 'Name required');
    dom.modalConfirm.disabled = true;
    try {
        const res = await fetch('/api/projects', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, nickname, model, customPath, emoji }) 
        });
        const data = await res.json();
        if (!res.ok) return showToast('error', '❌', data.error);
        state.projects.push(data);
        closeModal(); renderRobots();
        setupTerminal(data.name, true);
    } catch (err) {} finally { dom.modalConfirm.disabled = false; }
  }

  async function handleDeleteAgent(deleteFiles = false) {
    const project = state.agentToDelete; if (!project) return;
    const pName = project.name;
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(project.name)}?deleteFiles=${deleteFiles}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.type === 'symlink' || deleteFiles) {
            state.projects = state.projects.filter(p => p.name !== project.name);
        } else if (data.type === 'orphaned') {
            const p = state.projects.find(x => x.name === project.name);
            if (p) p.active = false;
        }

        if (state.terminals[pName]) { 
            state.terminals[pName].ws.close(); 
            if (state.terminals[pName].panel) state.terminals[pName].panel.remove(); 
            delete state.terminals[pName]; 
        }
        
        // Ensure UI refreshes immediately
        closeDeleteAgentModal();
        renderRobots();
        
        showToast('success', '🗑️', data.message || 'Agent removed');
    } catch (err) {
        showToast('error', '❌', 'Failed to remove agent');
    }
  }

  // ---- Render ----
  function renderRobots() {
    if (state.projects.length === 0) { dom.emptyState.classList.remove('hidden'); dom.robotCards.innerHTML = ''; return; }
    dom.emptyState.classList.add('hidden');
    const fallbackEmojis = ['🪐', '🦾', '🧠', '⚙️', '🔧', '🛠️', '💡', '🎯'];
    dom.robotCards.innerHTML = state.projects.map((p, i) => {
        // Explicitly prioritize the saved emoji character
        const rawAppearance = p.emoji || fallbackEmojis[i % fallbackEmojis.length];
        const isSprite = rawAppearance.startsWith('SPRITE:');
        const entityLabel = isSprite ? '' : rawAppearance;

        const t = state.terminals[p.name];
        const isReady = t && t.ready;
        const isVisible = t && t.panel && !t.panel.classList.contains('hidden');
        const r = state.walkingRobots[p.name];
        const posStyle = r ? `left: ${r.x}%; top: ${r.y}%; z-index: ${Math.floor(r.y * 100)};` : '';
        const isIllegal = r?.isIllegal;
        
        const topLabel = p.nickname || p.name;

        if (!p.active) {
            // Hide orphaned slots from UI workspace/floor as per user request
            return '';
        }

        const spriteHtml = isSprite ? `
                <div class="robot-sprite-container">
                    <img class="robot-char-sprite" src="${(r?.isHovered || r?.naturalIdleTimer > 0 ? state.idleFrames : state.charFrames)[r?.frame || 0]}" alt="Agent">
                </div>
        ` : `
                <div class="robot-card-emoji-container">
                    ${getAppearanceHtml(rawAppearance, 'robot-card-emoji')}
                </div>
        `;

        return `
            <div class="robot-avatar ${isVisible ? 'active' : ''} ${!isReady ? 'initializing' : ''} ${r?.isThinking ? 'thinking' : ''} ${r?.hasUpdate ? 'has-update' : ''}" 
                 data-project="${p.name}" style="${posStyle}"
                 onclick="window.nova.openTerminal('${p.name}')">
                <div class="robot-label top">${topLabel}</div>
                <div class="robot-thought-bubble">💭</div>
                <div class="robot-check-badge"></div>
                ${spriteHtml}
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
            const r = tState.prevRect || {width: 500, height: 500, left: window.innerWidth/2 - 250, top: 100};
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
        if (p) {
            state.agentToDelete = p; // Ensure state is set before calling modal logic
            openDeleteAgentModal(p);
        }
    });

    const headerEmoji = panel.querySelector('.terminal-header-emoji');
    if (headerEmoji) {
        headerEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            openEmojiUpdateModal(pName);
        });
    }

    // Draggable
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.terminal-dot') || e.target.closest('.terminal-menu-container') || e.target.closest('.terminal-header-emoji')) return;
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

    // Resizable
    const resizer = panel.querySelector('.terminal-resizer');
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        bringToFront(panel);
        state.resizingWindow = panel;
        panel.classList.add('resizing');
        
        const rect = panel.getBoundingClientRect();
        state.resizeStart = { 
            w: rect.width, 
            h: rect.height, 
            x: e.clientX, 
            y: e.clientY 
        };
        
        document.addEventListener('mousemove', onResizing);
        document.addEventListener('mouseup', stopResizing);
    });

    function onResizing(e) {
        if (!state.resizingWindow) return;
        const panel = state.resizingWindow;
        const dx = e.clientX - state.resizeStart.x;
        const dy = e.clientY - state.resizeStart.y;
        
        const newW = Math.max(300, state.resizeStart.w + dx);
        const newH = Math.max(200, state.resizeStart.h + dy);
        
        panel.style.width = newW + 'px';
        panel.style.height = newH + 'px';
        
        const t = state.terminals[panel.dataset.project];
        if (t && t.fitAddon) try { t.fitAddon.fit(); } catch(e){}
    }

    function stopResizing() {
        if (!state.resizingWindow) return;
        const panel = state.resizingWindow;
        panel.classList.remove('resizing');
        state.resizingWindow = null;
        document.removeEventListener('mousemove', onResizing);
        document.removeEventListener('mouseup', stopResizing);
        
        const t = state.terminals[panel.dataset.project];
        if (t && t.fitAddon) {
            try { 
                t.fitAddon.fit();
                t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
            } catch(e){}
        }
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
        if (meta) {
            panel.querySelector('.terminal-title').textContent = meta.nickname || pName;
            panel.querySelector('.terminal-folder').textContent = meta.nickname ? `projects/${pName}` : '';
            panel.querySelector('.terminal-project-badge').textContent = meta.model || '';
            const emojiEl = panel.querySelector('.terminal-header-emoji');
            if (emojiEl) emojiEl.innerHTML = getAppearanceHtml(meta.emoji);
        } else {
            panel.querySelector('.terminal-title').textContent = pName;
            const emojiEl = panel.querySelector('.terminal-header-emoji');
            if (emojiEl) emojiEl.innerHTML = getAppearanceHtml('🪐');
        }
        
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

  window.nova = { 
      openTerminal,
      setHover: (name, isActive) => {
          if (state.walkingRobots[name]) {
              if (state.walkingRobots[name].isHovered !== isActive) {
                  state.walkingRobots[name].isHovered = isActive;
                  state.walkingRobots[name].frame = 0;
              }
          }
      },
      spawnAtOrphaned(pName) {
          const p = state.projects.find(x => x.active === false && x.name === pName);
          if (p) {
              openModal();
              dom.modalInput.value = p.name;
              dom.nicknameInput.value = p.nickname || p.name;
          }
      }
  };
  document.addEventListener('DOMContentLoaded', init);
  function initAnchorAdjuster() {
    if (!dom.inputAnchorX || !dom.inputAnchorY) return;

    const syncUI = () => {
        const x = dom.inputAnchorX.value;
        const y = dom.inputAnchorY.value;
        state.anchor.x = x;
        state.anchor.y = y;
        
        dom.valAnchorX.textContent = x;
        dom.valAnchorY.textContent = y;
        
        document.documentElement.style.setProperty('--anchor-x', `${x}%`);
        document.documentElement.style.setProperty('--anchor-y', `${y}%`);
    };

    dom.inputAnchorX.addEventListener('input', syncUI);
    dom.inputAnchorY.addEventListener('input', syncUI);
    
    const btnReset = $('#btn-anchor-reset');
    const btnCancel = $('#btn-anchor-cancel');
    const btnSave = $('#btn-anchor-save');

    if (btnReset) {
        btnReset.onclick = () => {
            dom.inputAnchorX.value = 50;
            dom.inputAnchorY.value = 85;
            syncUI();
            showToast('info', '🔄', 'Anchor reset to default');
        };
    }

    if (btnCancel) {
        btnCancel.onclick = () => {
            dom.inputAnchorX.value = state.originalAnchor.x;
            dom.inputAnchorY.value = state.originalAnchor.y;
            syncUI();
            showToast('info', '📂', 'Changes discarded');
        };
    }

    if (btnSave) {
        btnSave.onclick = async () => {
            await saveAnchorConfig(state.anchor.x, state.anchor.y);
        };
    }

    // Initial sync
    syncUI();
  }
})();
