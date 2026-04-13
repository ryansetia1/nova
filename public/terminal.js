/* ============================================
   NOVA — Terminal Management
   ============================================ */

import { state, dom } from './state.js';
import { showToast, bringToFront, getAppearanceHtml, renderRobots, fireAgentNotification } from './ui.js';
import { openDeleteAgentModal, openEmojiUpdateModal, openClaudeMdModal, openSwitchServiceModal } from './modals.js';

export function openTerminal(pName) {
    if (!state.terminals[pName] || !state.terminals[pName].ready) return showToast('info', '⏳', 'Warming up...');
    
    if (state.walkingRobots[pName]) {
        state.walkingRobots[pName].hasUpdate = false;
        state.walkingRobots[pName].isHovered = false; 
    }

    setupTerminal(pName, true);
}

export function hideTerminal(pName) { 
    const t = state.terminals[pName];
    if (t && t.panel) {
        t.panel.classList.add('hidden');
        if (t.panel.classList.contains('docked-right')) {
            t.panel.classList.remove('docked-right');
            updateDockedLayout();
        }
        saveTerminalState(pName, false, false);
    }
    
    if (state.walkingRobots[pName]) {
        state.walkingRobots[pName].isWalking = true;
        state.walkingRobots[pName].isHovered = false;
    }
    renderRobots(); 
}

export function disposeTerminal(pName) {
    const t = state.terminals[pName];
    if (!t) return;
    try { t.ws.close(); } catch(e) {}
    try { t.term.dispose(); } catch(e) {}

    // Clear uploads panel if exists
    if (t.panel) {
        const uploadsPanel = t.panel.querySelector('.uploads-panel');
        if (uploadsPanel) uploadsPanel.remove();
    }

    try { t.panel.remove(); } catch(e) {}
    delete state.terminals[pName];
    updateDockedLayout();
}

// Load saved docked width from storage
const savedDockWidth = localStorage.getItem('nova-docked-width') || '400';
document.documentElement.style.setProperty('--docked-width', savedDockWidth + 'px');

export function updateDockedLayout() {
    const dockedPanels = Array.from(document.querySelectorAll('.terminal-panel.docked-right:not(.hidden)'));
    const dockCount = dockedPanels.length;
    
    // Update all yellow dots visibility
    document.querySelectorAll('.terminal-panel').forEach(panel => {
        const dDot = panel.querySelector('.terminal-dock-dot');
        if (dDot) {
            if (!panel.classList.contains('docked-right') && dockCount >= 3) {
                dDot.style.pointerEvents = 'none';
                dDot.style.opacity = '0.2';
            } else {
                dDot.style.pointerEvents = 'auto';
                dDot.style.opacity = '1';
            }
        }
    });

    if (dockCount > 0) {
        dockedPanels.forEach((panel, index) => {
            const headerHeight = document.body.classList.contains('is-fullscreen') ? 73 : 95;
            panel.style.setProperty('top', `calc(${headerHeight}px + ((100vh - ${headerHeight}px) / ${dockCount}) * ${index})`, 'important');
            panel.style.setProperty('height', `calc((100vh - ${headerHeight}px) / ${dockCount})`, 'important');
            
            const pName = panel.dataset.project;
            if (pName && state.terminals[pName]) {
                setTimeout(() => refit(state.terminals[pName]), 50);
            }
        });
    }
}

function refit(t) {
    if (!t || !t.fitAddon || !t.term || t.activeMode !== 'terminal') return;
    
    // Use a small delay to ensure DOM layout is complete
    setTimeout(() => {
        try {
            if (!t.panel || t.panel.classList.contains('hidden') || t.activeMode !== 'terminal') return;
            
            t.fitAddon.fit();
            
            // Pass to Backend
            const sendResize = () => {
                if (t.termWs && t.termWs.readyState === WebSocket.OPEN) {
                    t.termWs.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
                }
            };
            sendResize();

            // Triple-pass for ultimate stability (transitions can be tricky)
            setTimeout(() => {
                try {
                    t.fitAddon.fit();
                    sendResize();
                    t.term.refresh(0, t.term.rows - 1);
                } catch(e) {}
            }, 150);
        } catch (e) {}
    }, 50);
}

export function setupTerminal(pName, showUI = false) {
    const existing = state.terminals[pName];
    const projectMeta = state.projects.find(x => x.name === pName);
    const targetMode = projectMeta ? projectMeta.uiMode || 'chat' : 'chat';

    if (existing && existing.term) {
        existing.activeMode = targetMode; // Update to new intent

        // Lazy-init the other mode if we switched
        if (targetMode === 'chat' && !existing.chatWs) {
            existing.panel.classList.remove('hidden');
            updateModeUI(pName);
            existing.setupModeWs('chat');
        } else if (targetMode === 'terminal' && !existing.termWs) {
            existing.panel.classList.remove('hidden');
            updateModeUI(pName);
            existing.setupModeWs('terminal');
        }
        
        if (showUI) {
            existing.panel.classList.remove('hidden');
            bringToFront(existing.panel);
            updateModeUI(pName);
            refit(existing);
            setTimeout(() => {
                refit(existing);
                if (existing.activeMode === 'chat') {
                    const msgContainer = existing.panel.querySelector('.chat-messages');
                    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
                    const chatInput = existing.panel.querySelector('.chat-input');
                    if (chatInput) chatInput.focus();
                } else {
                    existing.term.scrollToBottom();
                    existing.term.focus();
                }
            }, 300);
        }
        return;
    }
    
    // -- NEW CREATION PATH --
    const clone = dom.terminalTemplate.content.cloneNode(true);
    const panel = clone.querySelector('.terminal-panel');
    panel.dataset.project = pName;
    const offset = Math.floor(Math.random() * 40) - 20; 
    panel.style.top = `${100 + offset}px`;
    panel.style.left = `calc(50% - 300px + ${offset}px)`;

    const container = panel.querySelector('.terminal-container');
    
    const meta = state.projects.find(x => x.name === pName);
    if (meta) {
        if (meta.isDocked) panel.classList.add('docked-right');
        panel.querySelector('.terminal-title').textContent = meta.nickname || pName;
        panel.querySelector('.terminal-folder').textContent = meta.customPath || `projects/${pName}`;
        const badge = panel.querySelector('.terminal-project-badge');
        badge.textContent = meta.model || '';
        badge.dataset.service = `Service: ${meta.service ? meta.service.toUpperCase() : 'OLLAMA'}`;
        badge.removeAttribute('title');
        const emojiEl = panel.querySelector('.terminal-header-emoji');
        if (emojiEl) emojiEl.innerHTML = getAppearanceHtml(meta.emoji);
    }

    renderActivityBar(pName, panel);
    dom.mainContent.appendChild(panel);

    const term = new Terminal({ 
        fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.2, scrollback: 5000, cursorBlink: true,
        theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#6366f1' } 
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit); 
    term.open(container);

    const t = { 
        term, fitAddon: fit, chatWs: null, termWs: null,
        panel, container, ready: false, 
        uploads: [], activeMode: targetMode, chatMessages: [], jsonBuffer: '',
        lastCost: null
    };
    state.terminals[pName] = t;
    
    // Load History
    try {
        const hist = localStorage.getItem('nova-chat-' + pName);
        if (hist) {
            let msgs = JSON.parse(hist);
            t.chatMessages = msgs.filter(m => m.role !== 'system' || (m.content !== 'Thinking...' && m.content !== 'Processing...'));
        }
    } catch(e) {}

    const setupModeWs = (mode) => {
        const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(pName)}&uiMode=${mode}`;
        const ws = new WebSocket(wsUrl);
        if (mode === 'chat') {
            t.chatWs = ws;
            setupFileUploads(pName, container, t, ws);
        } else {
            t.termWs = ws;
        }

        ws.onopen = () => { 
            t.ready = true; renderRobots(); renderActivityBar(pName);
            if (t.activeMode === mode) refit(t);
        };

        ws.onmessage = (e) => { 
            try { 
                const msg = JSON.parse(e.data); 
                if (msg.type === 'output') {
                    if (mode === 'chat') {
                        t.jsonBuffer += msg.data;
                        let lines = t.jsonBuffer.split(/\n|\r\n/);
                        t.jsonBuffer = lines.pop();
                        lines.forEach(line => {
                            if (!line.trim()) return;
                            try { handleChatJsonEvent(t, pName, JSON.parse(line)); } catch(err) {}
                        });
                    } else {
                        term.write(msg.data); 
                        const robot = state.walkingRobots[pName];
                        if (robot) {
                            const raw = msg.data;
                            if (/Thinking|✽|✢|✥/i.test(raw)) { robot.isThinking = true; renderRobots(); } 
                            else if (/✓|Done|fixed|success|@/i.test(raw)) {
                                if (robot.isThinking) {
                                    robot.isThinking = false; robot.hasUpdate = true; renderRobots();
                                    fireAgentNotification(pName, null, '✓ Task Progressed');
                                }
                            }
                        }
                    }
                }
            } catch (err) {} 
        };
    };

    t.setupModeWs = setupModeWs;
    setupModeWs(targetMode);

    // Auto-fit Logic
    const ro = new ResizeObserver(() => { if (!panel.classList.contains('hidden')) refit(t); });
    ro.observe(container);

    // Events
    bindWindowEvents(pName, panel, t);
    bindChatEvents(pName, panel, t);
    updateModeUI(pName);

    // Terminal Input
    term.onData(d => { 
        if (t.termWs && t.termWs.readyState === WebSocket.OPEN) {
            t.termWs.send(JSON.stringify({ type: 'input', data: d })); 
            const r = state.walkingRobots[pName];
            if (r) { r.isThinking = false; r.hasError = false; renderRobots(); }
        }
    });

    if (showUI) {
        panel.classList.remove('hidden');
        bringToFront(panel);
        renderRobots(); 
        refit(t);
        setTimeout(() => { 
            refit(t);
            setTimeout(() => {
                if (t.activeMode === 'chat') {
                    const msgContainer = panel.querySelector('.chat-messages');
                    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
                } else {
                    term.scrollToBottom(); term.focus(); 
                }
            }, 50);
        }, 350);
    }
}

// Helper for file uploads
function setupFileUploads(pName, container, t, ws) {
    container.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); container.classList.remove('drag-over'); });
    container.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation(); container.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        showToast('info', '⏳', `Uploading ${files.length} file(s)...`);

        const results = await Promise.all(files.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                const isText = (fn) => /txt|md|json|js|ts|py|rb|go|rs|c|h|css|html|yaml|yml|sh|sql/.test(fn.split('.').pop().toLowerCase());
                reader.onload = async (ev) => {
                    const data = ev.target.result;
                    try {
                        const res = await fetch(`/api/projects/${encodeURIComponent(pName)}/upload`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: file.name, filedata: isText(file.name) ? '' : data, isText: isText(file.name), textContent: isText(file.name) ? data : '' })
                        });
                        const j = await res.json();
                        resolve({ success: j.success, type: isText(file.name) ? 'text' : 'binary', filename: file.name, textContent: isText(file.name) ? data : '', absolutePath: j.absolutePath });
                    } catch { resolve({ success: false }); }
                };
                if (isText(file.name)) reader.readAsText(file); else reader.readAsDataURL(file);
            });
        }));

        const succeeded = results.filter(r => r.success);
        if (!succeeded.length) return;
        let input = '';
        succeeded.forEach(f => {
            if (f.type === 'text') input += `\n[File: ${f.filename}]\n${f.textContent}\n[End of ${f.filename}]`;
            else { input += ` "${f.absolutePath}" `; t.uploads.push({ filename: f.filename, absolutePath: f.absolutePath }); }
        });
        if (ws.readyState === WebSocket.OPEN && input) ws.send(JSON.stringify({ type: 'input', data: input }));
        showToast('success', '✅', 'Upload complete');
    });
}

async function saveTerminalState(pName, isDocked, isOpen) {
    const proj = state.projects.find(x => x.name === pName);
    if (proj) {
        proj.isDocked = isDocked;
        proj.isOpen = isOpen;
    }
    try {
        await fetch('/api/update-emoji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: pName, isDocked, isOpen })
        });
    } catch(e) {}
}

function bindWindowEvents(pName, panel, tState) {
    const closeDot = panel.querySelector('.terminal-close-dot');
    const dockDot = panel.querySelector('.terminal-dock-dot');
    const maxDot = panel.querySelector('.terminal-maximize-dot');
    const menuBtn = panel.querySelector('.terminal-menu-btn');
    const dropdown = panel.querySelector('.terminal-dropdown');
    const deleteBtn = panel.querySelector('.terminal-delete-btn');
    const header = panel.querySelector('.terminal-header');

    panel.addEventListener('mousedown', () => bringToFront(panel));

    closeDot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (panel.classList.contains('docked-right')) return; // Disabled when docked
        hideTerminal(pName);
    });

    if (dockDot) {
        dockDot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!panel.classList.contains('docked-right')) {
                const currentDocked = document.querySelectorAll('.terminal-panel.docked-right:not(.hidden)').length;
                if (currentDocked >= 3) return; // Enforce max 3
            } else {
                // Return to floating state - clear important overrides
                panel.style.removeProperty('top');
                panel.style.removeProperty('height');
                panel.style.removeProperty('width');
                panel.style.removeProperty('left');
                
                // Set default floating size
                panel.style.width = '600px';
                panel.style.height = '500px';
                panel.style.top = '100px';
                panel.style.left = 'calc(50% - 300px)';
                tState.isMaximized = false;
            }
            panel.classList.toggle('docked-right');
            bringToFront(panel);
            updateDockedLayout();
            saveTerminalState(pName, panel.classList.contains('docked-right'), true);
            setTimeout(() => refit(tState), 300);
        });
    }

    maxDot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (panel.classList.contains('docked-right')) return; // Disabled when docked
        bringToFront(panel);
        if (tState.isMaximized) {
            const r = tState.prevRect || {width: 500, height: 500, left: window.innerWidth/2 - 250, top: 100};
            panel.style.width = r.width + 'px'; panel.style.height = r.height + 'px';
            panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
            tState.isMaximized = false;
            panel.classList.remove('maximized');
        } else {
            tState.prevRect = panel.getBoundingClientRect();
            panel.style.left = '20px'; panel.style.top = '20px';
            panel.style.width = (window.innerWidth - 40) + 'px';
            panel.style.height = (window.innerHeight - 40) + 'px';
            panel.style.transform = 'none';
            tState.isMaximized = true;
            panel.classList.add('maximized');
        }
        setTimeout(() => refit(tState), 300);
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
            state.agentToDelete = p; 
            openDeleteAgentModal(p);
        }
    });
    
    // Bind CLAUDE.md button
    const claudeMdBtn = panel.querySelector('.terminal-claude-md-btn');
    if (claudeMdBtn) {
        claudeMdBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = panel.querySelector('.terminal-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
            openClaudeMdModal(pName);
        });
    }

    const headerEmoji = panel.querySelector('.terminal-header-emoji');
    if (headerEmoji) {
        headerEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            openEmojiUpdateModal(pName);
        });
    }

    const modelBadge = panel.querySelector('.terminal-project-badge');
    if (modelBadge) {
        modelBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            openSwitchServiceModal(pName);
        });
    }

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.terminal-dot') || e.target.closest('.terminal-menu-container') || e.target.closest('.terminal-header-emoji')) return;
        if (tState.isMaximized || panel.classList.contains('docked-right')) return;
        
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
        if (panel.classList.contains('docked-right')) return;
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
        const t = state.terminals[panel.dataset.project];
        if (t) refit(t);
    }

    const resizer = panel.querySelector('.terminal-resizer');
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panel.classList.contains('docked-right')) return; // Disabled when docked
        
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

    const leftResizer = panel.querySelector('.terminal-left-resizer');
    if (leftResizer) {
        leftResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!panel.classList.contains('docked-right')) return;

            state.resizingDock = true;
            document.addEventListener('mousemove', onDockResizing);
            document.addEventListener('mouseup', stopDockResizing);
        });
    }

    function onDockResizing(e) {
        if (!state.resizingDock) return;
        let newWidth = window.innerWidth - e.clientX;
        const maxWidth = window.innerWidth * 0.4;
        newWidth = Math.max(400, Math.min(newWidth, maxWidth));
        document.documentElement.style.setProperty('--docked-width', newWidth + 'px');
        localStorage.setItem('nova-docked-width', newWidth);
        
        // Refit all docked terminals to match new width
        document.querySelectorAll('.terminal-panel.docked-right:not(.hidden)').forEach(p => {
             const t = state.terminals[p.dataset.project];
             if (t) refit(t);
        });
    }

    function stopDockResizing() {
        state.resizingDock = false;
        document.removeEventListener('mousemove', onDockResizing);
        document.removeEventListener('mouseup', stopDockResizing);
    }

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
        if (t) refit(t);
    }

    function stopResizing() {
        if (!state.resizingWindow) return;
        const panel = state.resizingWindow;
        panel.classList.remove('resizing');
        state.resizingWindow = null;
        document.removeEventListener('mousemove', onResizing);
        document.removeEventListener('mouseup', stopResizing);
        
        const t = state.terminals[panel.dataset.project];
        if (t) refit(t);
    }
}

function updateUploadsPanel(pName) {
  const t = state.terminals[pName];
  if (!t || !t.panel) return;

  let panel = t.panel.querySelector('.uploads-panel');
  
  // If no uploads, hide/remove panel and return
  if (!t.uploads || t.uploads.length === 0) {
    if (panel) panel.remove();
    return;
  }

  // Create panel if it doesn't exist
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'uploads-panel';
    // Insert between header and terminal container
    const header = t.panel.querySelector('.terminal-header');
    header.insertAdjacentElement('afterend', panel);
  }

  panel.innerHTML = t.uploads.map((u, index) => `
    <div class="upload-item" data-index="${index}">
      <span class="upload-icon">📎</span>
      <span class="upload-name" title="${u.absolutePath}">${u.filename}</span>
      <button class="upload-delete-btn" data-filename="${u.filename}" title="Delete file">✕</button>
    </div>
  `).join('');

  // Bind delete buttons
  panel.querySelectorAll('.upload-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filename = btn.dataset.filename;
      
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(pName)}/uploads/${encodeURIComponent(filename)}`,
          { method: 'DELETE' }
        );
        const data = await res.json();
        
        if (data.success) {
          // Remove from local uploads array
          t.uploads = t.uploads.filter(u => u.filename !== filename);
          updateUploadsPanel(pName);
          showToast('success', '🗑️', `Deleted: ${filename}`);
        } else {
          showToast('error', '❌', `Failed to delete: ${filename}`);
        }
      } catch (err) {
        showToast('error', '❌', `Failed to delete: ${filename}`);
      }
    });
  });
}

export function renderAllActivityBars() {
    Object.keys(state.terminals).forEach(pName => {
        renderActivityBar(pName);
    });
}

export function renderActivityBar(pName, panel = null) {
    const t = state.terminals[pName];
    const targetPanel = panel || (t ? t.panel : null);
    if (!targetPanel) return;

    const bar = targetPanel.querySelector('.terminal-activity-bar');
    if (!bar) return;

    const robot = state.walkingRobots[pName];
    
    bar.innerHTML = state.breakPositions
        .filter(pos => !pos.assignee || pos.assignee === 'All Agents' || pos.assignee === pName)
        .map(pos => {
            const isActive = robot?.forcedTarget?.id === pos.id;
            return `<button class="activity-btn ${isActive ? 'active' : ''}" data-id="${pos.id}" title="Go to ${pos.animation}">${pos.emoji || '📍'}</button>`;
        }).join('');

    bar.querySelectorAll('.activity-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const posId = btn.dataset.id;
            const pos = state.breakPositions.find(x => x.id === posId);
            if (!pos || !robot) return;

            if (robot.forcedTarget?.id === pos.id) {
                // Cancel break
                robot.forcedTarget = null;
                robot.activity = null;
                robot.isWalking = true;
                showToast('info', '🏃', 'Break cancelled. Returning to work.');
            } else {
                // Start break
                robot.forcedTarget = pos;
                robot.activity = null; // Reset activity until arrival
                robot.isWalking = true;
                showToast('success', pos.emoji || '☕', `Heading to ${pos.animation} spot...`);
                
                // Send command if any
                if (pos.command && t && t.ws && t.ws.readyState === WebSocket.OPEN) {
                    t.ws.send(JSON.stringify({ type: 'input', data: pos.command + '\r' }));
                }
            }
            renderActivityBar(pName);
            renderRobots();
        };
    });
}

window.switchUiMode = function(pName, newMode) {
    const t = state.terminals[pName];
    if (!t) return;
    if (t.activeMode === newMode) return;
    
    // Update local state immediately so setupTerminal finds it
    const projectMeta = state.projects.find(x => x.name === pName);
    if (projectMeta) projectMeta.uiMode = newMode;
    
    // Preserve UI states
    const panel = t.panel;
    const isDocked = panel.classList.contains('docked-right');
    
    // update server-side meta persistency
    fetch('/api/update-emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pName, uiMode: newMode })
    });

    // Instead of disposing, we just re-run setup to ensure the mode is correct
    // but setupTerminal needs to be smarter about not destroying everything
    setupTerminal(pName, true);
};

export function updateModeUI(pName) {
    const t = state.terminals[pName];
    if (!t || !t.panel) return;
    
    const chatContainer = t.panel.querySelector('.chat-container');
    const termContainer = t.panel.querySelector('.terminal-container');
    const modeChatBtn = t.panel.querySelector('.mode-chat');
    const modeTermBtn = t.panel.querySelector('.mode-term');
    const footer = t.panel.querySelector('.terminal-footer');
    
    if (t.activeMode === 'chat') {
        if(chatContainer) chatContainer.classList.remove('hidden');
        if(termContainer) termContainer.classList.add('hidden');
        if(modeChatBtn) modeChatBtn.classList.add('active');
        if(modeTermBtn) modeTermBtn.classList.remove('active');
        if(footer) footer.classList.add('hidden'); // Hide activity bar in chat mode
    } else {
        if(chatContainer) chatContainer.classList.add('hidden');
        if(termContainer) termContainer.classList.remove('hidden');
        if(modeTermBtn) modeTermBtn.classList.add('active');
        if(modeChatBtn) modeChatBtn.classList.remove('active');
        if(footer) footer.classList.remove('hidden');
    }
}

const SLASH_COMMANDS = [
    { cmd: '/effort', desc: 'Set effort (low, medium, high, max)' },
    { cmd: '/model', desc: 'Switch AI model' },
    { cmd: '/agents', desc: 'List configured agents' },
    { cmd: '/clear', desc: 'Clear chat screen' },
    { cmd: '/help', desc: 'Show aid' },
    { cmd: '/exit', desc: 'Exit session' },
    { cmd: '/continue', desc: 'Continue last session' },
    { cmd: '/resume', desc: 'Resume session by ID' },
    { cmd: '/cost', desc: 'Show session cost' },
    { cmd: '/compact', desc: 'Compress context' },
    { cmd: '/doctor', desc: 'Run diagnostics' }
];

function renderSlashMenu(pName, filter = '') {
    const t = state.terminals[pName];
    if (!t || !t.panel) return;
    
    const chatInputRow = t.panel.querySelector('.chat-input-row');
    if (!chatInputRow) return;

    let menu = t.panel.querySelector('.slash-command-menu');
    const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(filter));

    if (filtered.length === 0) {
        if (menu) menu.remove();
        return;
    }

    if (!menu) {
        menu = document.createElement('div');
        menu.className = 'slash-command-menu';
        chatInputRow.appendChild(menu);
    }

    t.slashSelectedIndex = 0;
    menu.innerHTML = filtered.map((c, i) => `
        <div class="slash-item ${i === 0 ? 'active' : ''}" data-cmd="${c.cmd}">
            <span class="slash-item-cmd">${c.cmd}</span>
            <span class="slash-item-desc">${c.desc}</span>
        </div>
    `).join('');

    menu.querySelectorAll('.slash-item').forEach((item, idx) => {
        item.onclick = () => {
             const chatInput = t.panel.querySelector('.chat-input');
             chatInput.value = item.dataset.cmd + ' ';
             chatInput.focus();
             menu.remove();
        };
    });
}


export function bindChatEvents(pName, panel, t) {
    const modeChatBtn = panel.querySelector('.mode-chat');
    const modeTermBtn = panel.querySelector('.mode-term');
    const chatInput = panel.querySelector('.chat-input');
    const chatSendBtn = panel.querySelector('.chat-send-btn');
    
    if (modeChatBtn && modeTermBtn) {
        modeChatBtn.addEventListener('click', (e) => { e.stopPropagation(); window.switchUiMode(pName, 'chat'); });
        modeTermBtn.addEventListener('click', (e) => { e.stopPropagation(); window.switchUiMode(pName, 'terminal'); });
    }
    
    if (chatSendBtn && chatInput) {
        const sendChat = () => {
            const val = chatInput.value.trim();
            if (!val) return;

            const menu = panel.querySelector('.slash-command-menu');
            if (menu) menu.remove();

            // Handle ALL slash commands client-side
            if (val === '/clear') {
                t.chatMessages = [];
                saveChatHistory(pName, t.chatMessages);
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/cost') {
                const cost = t.lastCost != null ? `$${t.lastCost.toFixed(4)}` : 'No cost data yet';
                t.chatMessages.push({ role: 'system', content: `Session cost: ${cost}` });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/help') {
                const helpText = SLASH_COMMANDS.map(c => `${c.cmd} — ${c.desc}`).join('\n');
                t.chatMessages.push({ role: 'system', content: helpText });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/exit') {
                if (t.chatWs) t.chatWs.close();
                t.chatMessages.push({ role: 'system', content: 'Session ended.' });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val.startsWith('/effort')) {
                const level = val.split(' ')[1] || '';
                const valid = ['low', 'medium', 'high', 'max'];
                if (!valid.includes(level)) {
                    t.chatMessages.push({ role: 'system', content: `Usage: /effort [${valid.join('|')}]` });
                    renderChatMessages(pName);
                    chatInput.value = '';
                    return;
                }
                // Send as a proper user message to Claude Code
                // effort is communicated via a system-level instruction
                const effortMsg = `[System: Set effort level to ${level}]`;
                if (t.chatWs && t.chatWs.readyState === WebSocket.OPEN) {
                    t.chatWs.send(JSON.stringify({ type: 'input', data: effortMsg + '\n' }));
                }
                t.chatMessages.push({ role: 'system', content: `Effort set to: ${level}` });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/compact') {
                const compactMsg = 'Please compact and summarize our conversation context to save tokens, then confirm when done.';
                if (t.chatWs && t.chatWs.readyState === WebSocket.OPEN) {
                    t.chatMessages.push({ role: 'user', content: val });
                    t.chatMessages.push({ role: 'system', content: 'Thinking...' });
                    renderChatMessages(pName);
                    t.chatWs.send(JSON.stringify({ type: 'input', data: compactMsg + '\n' }));
                }
                chatInput.value = '';
                return;
            }

            if (val === '/model') {
                const project = state.projects.find(x => x.name === pName);
                const model = project ? project.model : 'Unknown';
                const service = project ? (project.service || 'ollama') : 'Unknown';
                t.chatMessages.push({ role: 'system', content: `Current model: ${model} (${service})` });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/agents') {
                const agentList = state.projects
                    .filter(p => p.active)
                    .map(p => `${p.emoji || '🪐'} ${p.nickname || p.name}`)
                    .join('\n');
                t.chatMessages.push({ role: 'system', content: `Active agents:\n${agentList}` });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            if (val === '/doctor') {
                const wsStatus = t.chatWs ? 
                    ['CONNECTING','OPEN','CLOSING','CLOSED'][t.chatWs.readyState] : 'NO_WS';
                const project = state.projects.find(x => x.name === pName);
                const info = [
                    `Agent: ${pName}`,
                    `Model: ${project?.model || 'unknown'}`,
                    `Service: ${project?.service || 'ollama'}`,
                    `WebSocket: ${wsStatus}`,
                    `Messages: ${t.chatMessages.length}`,
                    `Mode: ${t.activeMode}`
                ].join('\n');
                t.chatMessages.push({ role: 'system', content: info });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            // /continue and /resume require process restart — show info
            if (val === '/continue' || val.startsWith('/resume')) {
                t.chatMessages.push({ role: 'system', content: 'To resume a session, close and reopen this agent terminal.' });
                renderChatMessages(pName);
                chatInput.value = '';
                return;
            }

            // Normal message — send to Claude Code
            if (t.chatWs && t.chatWs.readyState === WebSocket.OPEN) {
                if (t.activeMode === 'chat') {
                    t.chatMessages.push({ role: 'user', content: val });
                    t.chatMessages.push({ role: 'system', content: 'Thinking...' });
                    saveChatHistory(pName, t.chatMessages);
                    renderChatMessages(pName);
                    const robot = state.walkingRobots[pName];
                    if (robot) { robot.isThinking = true; renderRobots(); }
                    t.chatWs.send(JSON.stringify({ type: 'input', data: val + '\n' }));
                }
            }

            chatInput.value = '';
            chatInput.focus();
        };

        
        chatSendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendChat();
        });

        chatInput.addEventListener('input', (e) => {
            const val = chatInput.value;
            if (val.startsWith('/')) {
                renderSlashMenu(pName, val);
            } else {
                const menu = panel.querySelector('.slash-command-menu');
                if (menu) menu.remove();
            }
        });

        chatInput.addEventListener('keydown', (e) => {
            const menu = panel.querySelector('.slash-command-menu');
            if (menu && !menu.classList.contains('hidden')) {
                const items = menu.querySelectorAll('.slash-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    t.slashSelectedIndex = (t.slashSelectedIndex + 1) % items.length;
                    items.forEach((it, idx) => it.classList.toggle('active', idx === t.slashSelectedIndex));
                    items[t.slashSelectedIndex].scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    t.slashSelectedIndex = (t.slashSelectedIndex - 1 + items.length) % items.length;
                    items.forEach((it, idx) => it.classList.toggle('active', idx === t.slashSelectedIndex));
                    items[t.slashSelectedIndex].scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const activeItem = items[t.slashSelectedIndex];
                    if (activeItem) {
                        chatInput.value = activeItem.dataset.cmd + ' ';
                        menu.remove();
                    }
                } else if (e.key === 'Escape') {
                    menu.remove();
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });
    }
    
    // Initial render
    renderChatMessages(pName);
}

export function renderChatMessages(pName) {
    const t = state.terminals[pName];
    if (!t || !t.panel) return;
    const msgContainer = t.panel.querySelector('.chat-messages');
    if (!msgContainer) return;
    
    if (t.chatMessages.length === 0) {
        msgContainer.innerHTML = '<div class="chat-empty-state">No messages yet. Start chatting!</div>';
        return;
    }
    
    msgContainer.innerHTML = t.chatMessages.map((m, msgIdx) => {
        let text = (m.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        
        // Basic Markdown-ish formatting for Bubbles: Bold, Italic, Code
        text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
        text = text.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Render Options (Buttons) if present
        let optionsHtml = '';
        if (m.options && m.options.length > 0) {
            optionsHtml = `<div class="chat-options">
                ${m.options.map(opt => `
                    <button class="chat-option-btn" onclick="sendChatOption('${pName}', '${opt.value || opt}', ${msgIdx})">
                        ${opt.label || opt}
                    </button>
                `).join('')}
            </div>`;
        }

        const isDone = m.isDone ? '<span class="bubble-check-mark">✓</span>' : '';
        return `<div class="chat-bubble ${m.role}">${text}${optionsHtml}${isDone}</div>`;
    }).join('');
    
    setTimeout(() => {
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }, 10);
}

const saveChatHistory = (pName, messages) => {
    // Never persist temporary system states
    const filtered = messages.filter(m => m.role !== 'system' || (m.content !== 'Thinking...' && m.content !== 'Processing...'));
    localStorage.setItem('nova-chat-' + pName, JSON.stringify(filtered));
};

export function handleChatJsonEvent(t, pName, parsed) {
    if (!parsed) return;
    
    // DEBUG: Log all events to help diagnose 'no reply' issues
    console.log(`[Agent:${pName}] Event:`, parsed);

    // helper to remove temporary status pills
    const clearStatusPills = () => {
        const countBefore = t.chatMessages.length;
        t.chatMessages = t.chatMessages.filter(m => m.role !== 'system' || (m.content !== 'Thinking...' && m.content !== 'Processing...'));
        return t.chatMessages.length !== countBefore;
    };

    let lastMsg = t.chatMessages[t.chatMessages.length - 1];
    
    // 1. Handle Assistant Messages (Text & Thinking Fragments)
    if (parsed.type === "assistant" && parsed.message && parsed.message.content) {
        const content = parsed.message.content;
        const textBlock = content.find(c => c.type === "text");
        const thinkingBlock = content.find(c => c.type === "thinking");

        // Sync Robot Thinking Animation
        const robot = state.walkingRobots[pName];
        if (robot) {
            if (thinkingBlock) robot.isThinking = true;
            else if (textBlock) robot.isThinking = false;
            renderRobots();
        }

        if (textBlock && textBlock.text) {
            if (clearStatusPills()) {
                lastMsg = t.chatMessages[t.chatMessages.length - 1]; // Re-evaluate pointer
            }
            
            const textFragment = textBlock.text;
            if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isDone) {
                t.chatMessages.push({ role: 'assistant', content: textFragment });
            } else {
                lastMsg.content += textFragment;
            }
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);
        }
        return;
    }

    // 2. Handle System/Result Events (Status & Feedback)
    if (parsed.type === "system" || parsed.type === "result" || parsed.type === "call" || parsed.type === "thinking") {
        let text = "";
        
        if (parsed.subtype === "success") {
            if (parsed.total_cost_usd != null) {
                t.lastCost = parsed.total_cost_usd;
            }
            clearStatusPills();
            lastMsg = t.chatMessages[t.chatMessages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') lastMsg.isDone = true;
            
            // Sync with Workspace visuals
            const robot = state.walkingRobots[pName];
            if (robot) { 
                robot.isThinking = false; // FORCE RESET
                robot.hasUpdate = true; 
                renderRobots(); 
                fireAgentNotification(pName, null, '✓ Task Done');
                showToast('success', '✓', `Agent ${pName} finished task`);
            }
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);
            return;
        }
        else if (parsed.subtype === "error") {
            clearStatusPills();
            const errMsg = parsed.error?.message || parsed.message || "Unknown error";
            text = `Error: ${errMsg}`;
            
            const robot = state.walkingRobots[pName];
            if (robot) { 
                robot.isThinking = false; 
                robot.hasError = true; 
                renderRobots(); 
                fireAgentNotification(`❌ Error: ${errMsg}`, pName);
            }
        }
        else if (parsed.type === "thinking") {
            text = "Thinking...";
            const robot = state.walkingRobots[pName];
            if (robot) { robot.isThinking = true; robot.hasError = false; renderRobots(); }
        }
        else if (parsed.type === "call") {
            text = "Processing...";
            const robot = state.walkingRobots[pName];
            if (robot) { robot.isThinking = true; renderRobots(); }
        }
        else if (parsed.type === "result") text = "Task completed";
        else if (parsed.message) text = parsed.message;

        if (text) {
            lastMsg = t.chatMessages[t.chatMessages.length - 1];
            if (lastMsg && lastMsg.role === 'system' && (lastMsg.content === "Thinking..." || lastMsg.content === "Processing...")) {
                lastMsg.content = text;
            } else {
                t.chatMessages.push({ role: 'system', content: text });
            }
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);
        }
        return;
    }

    // 3. Fallback for flat schema
    const flatText = parsed.text || parsed.content || parsed.message;
    if (flatText && typeof flatText === 'string' && !parsed.type?.includes('thinking')) {
        lastMsg = t.chatMessages[t.chatMessages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') {
            t.chatMessages.push({ role: 'assistant', content: flatText });
        } else {
            lastMsg.content += flatText;
        }
        renderChatMessages(pName);
    }
    // 4. Handle Programmatic Input Requests (Interactive Choices)
    if (parsed.type === "userInput" || (parsed.type === "input" && parsed.choices)) {
        clearStatusPills();
        const question = parsed.question || "Please select an option:";
        const choices = parsed.choices || parsed.options || [];
        
        t.chatMessages.push({
            role: 'assistant',
            content: question,
            options: choices
        });
        
        saveChatHistory(pName, t.chatMessages);
        renderChatMessages(pName);
        return;
    }

    // 5. Catch-all Fallback for other schemas or raw prompts
    const catchAll = parsed.text || parsed.content || parsed.message || parsed.output || (typeof parsed === 'string' ? parsed : null);
    if (catchAll && !parsed.type?.includes('thinking')) {
        const textToDisplay = typeof catchAll === 'string' ? catchAll : JSON.stringify(catchAll);
        t.chatMessages.push({ role: 'assistant', content: textToDisplay });
        saveChatHistory(pName, t.chatMessages);
        renderChatMessages(pName);
    }
}



window.sendChatOption = function(pName, value, msgIdx) {
    const t = state.terminals[pName];
    if (!t || !t.chatWs || t.chatWs.readyState !== WebSocket.OPEN) return;

    // 1. Remove options from UI to prevent re-click
    if (t.chatMessages[msgIdx]) {
        delete t.chatMessages[msgIdx].options;
    }

    // 2. Add user response bubble
    t.chatMessages.push({ role: 'user', content: value });
    t.chatMessages.push({ role: 'system', content: 'Thinking...' });
    
    renderChatMessages(pName);
    saveChatHistory(pName, t.chatMessages);

    // 3. Send to Agent as raw string
    t.chatWs.send(JSON.stringify({ type: 'input', data: value.toString() + '\n' }));
};
