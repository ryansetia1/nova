/* ============================================
   NOVA — Terminal Management
   ============================================ */

import { state, dom } from './state.js';
import { showToast, bringToFront, getAppearanceHtml, renderRobots, fireAgentNotification } from './ui.js';
import { openDeleteAgentModal, openEmojiUpdateModal, openClaudeMdModal, openSwitchServiceModal } from './modals.js';

// Loading overlay state tracked per terminal via t._termLoading flag
function showTerminalLoading(panel, pName) {
    const overlay = panel.querySelector('.terminal-loading-overlay');
    if (!overlay) return;
    
    const text = overlay.querySelector('.terminal-loading-text');
    const subtext = overlay.querySelector('.terminal-loading-subtext');
    if (text) text.textContent = 'Preparing terminal...';
    if (subtext) subtext.textContent = 'Setting up workspace';
    
    overlay.classList.remove('hidden');
    
    // Track loading state on terminal state object
    const t = state.terminals[pName];
    if (t) t._termLoading = true;
}

function hideTerminalLoading(panel, pName) {
    const overlay = panel.querySelector('.terminal-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    const t = state.terminals[pName];
    if (t) t._termLoading = false;
}

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
            showTerminalLoading(existing.panel, pName);
            existing.setupModeWs('terminal');
        }
        
        if (showUI) {
            existing.panel.classList.remove('hidden');
            bringToFront(existing.panel);
            updateModeUI(pName);

            // Terminal mode: if buffer is dirty (user hasn't seen it clean), show overlay then reset
            if (targetMode === 'terminal' && !existing._termClean && !existing._termLoading) {
                showTerminalLoading(existing.panel, pName);
                const waitMs = existing.ready ? 500 : 3500;
                setTimeout(() => {
                    existing.term.reset();
                    existing._termClean = true;
                    hideTerminalLoading(existing.panel, pName);
                    refit(existing);
                }, waitMs);
            } else if (existing.ready && !existing._termLoading) {
                hideTerminalLoading(existing.panel, pName);
            }

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
        lastCost: null, _termLoading: false, _termClean: false
    };
    state.terminals[pName] = t;

    // Show loading overlay for terminal mode only if user will see it now
    if (targetMode === 'terminal' && showUI) {
        showTerminalLoading(panel, pName);
    }
    
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
            
            // For terminal mode: wait for init commands then reveal
            if (mode === 'terminal') {
                setTimeout(() => {
                    t._termClean = true;
                    if (t._termLoading) {
                        t.term.reset();
                        hideTerminalLoading(t.panel, pName);
                    }
                }, 3500);
            }
            
            // Chat mode: never manages the overlay
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
                            try {
                                const parsed = JSON.parse(line);
                                handleChatJsonEvent(t, pName, parsed);
                            } catch(err) {
                                // Try to extract JSON from lines like "429 {json}" or "error: {json}"
                                const jsonMatch = line.match(/\{[\s\S]*\}$/);
                                if (jsonMatch) {
                                    try {
                                        const fallback = JSON.parse(jsonMatch[0]);
                                        handleChatJsonEvent(t, pName, fallback);
                                        return;
                                    } catch(e2) {}
                                }
                                // Detect raw rate-limit / error text that never parsed
                                if (/rate_limit_error|429|overloaded_error|503/i.test(line)) {
                                    const robot = state.walkingRobots[pName];
                                    if (robot) { robot.isThinking = false; robot.hasError = true; renderRobots(); }
                                    const errText = line.replace(/^\d+\s*/, '').substring(0, 200);
                                    t.chatMessages.push({ role: 'system', content: `Error: ${errText || 'Rate limit reached'}`, isError: true });
                                    saveChatHistory(pName, t.chatMessages);
                                    renderChatMessages(pName);
                                    const project = state.projects.find(p => p.name === pName);
                                    showToast('error', '⚠️', `${project?.nickname || pName}: Rate limit hit`);
                                    fireAgentNotification(pName, project?.nickname, '⚠️ Rate limit error');
                                    return;
                                }
                                console.warn(`[Chat:${pName}] Failed to parse/handle line:`, line.substring(0, 200), err.message);
                            }
                        });
                    } else {
                        term.write(msg.data); 
                        const robot = state.walkingRobots[pName];
                        if (robot) {
                            const raw = msg.data;
                            const cleanText = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                            const isRateLimit = /rate_limit_error|overloaded_error|429|503/i.test(cleanText);
                            if (isRateLimit) {
                                robot.hasError = true;
                                robot.isThinking = false;
                                renderRobots();
                                const project = state.projects.find(p => p.name === pName);
                                showToast('error', '⚠️', `${project?.nickname || pName}: Rate limit hit`);
                                fireAgentNotification(pName, project?.nickname, '⚠️ Rate limit error');
                            } else if (/Thinking|✽|✢|✥/i.test(raw)) {
                                robot.isThinking = true; renderRobots();
                            } else if (/✓|Done|fixed|success|@/i.test(raw)) {
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
            // Only clear error state on Enter (new command), not every keystroke
            const isEnter = d === '\r' || d === '\n';
            if (isEnter) {
                const r = state.walkingRobots[pName];
                if (r && r.hasError) { r.hasError = false; renderRobots(); }
            }
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

    const clearChatBtn = panel.querySelector('.terminal-clear-chat-btn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = panel.querySelector('.terminal-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
            
            if (confirm(`Clear chat history for ${pName}?`)) {
                tState.chatMessages = [];
                saveChatHistory(pName, tState.chatMessages);
                renderChatMessages(pName);
                showToast('success', '🧹', 'Chat history cleared');
            }
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

    const MIN_PANEL_W = 300;
    const MIN_PANEL_H = 200;

    function startPanelResize(edge, e) {
        e.preventDefault();
        e.stopPropagation();
        if (panel.classList.contains('docked-right')) return;

        bringToFront(panel);
        state.resizingWindow = panel;
        panel.classList.add('resizing');

        const rect = panel.getBoundingClientRect();
        state.resizeStart = {
            w: rect.width,
            h: rect.height,
            x: e.clientX,
            y: e.clientY,
            left: rect.left,
            top: rect.top,
            edge: edge || 'se'
        };

        document.addEventListener('mousemove', onResizing);
        document.addEventListener('mouseup', stopResizing);
    }

    panel.querySelectorAll('[data-resize-edge]').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
            startPanelResize(el.dataset.resizeEdge, e);
        });
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
        const st = state.resizeStart;
        const edge = st.edge || 'se';

        if (edge === 'se') {
            const dx = e.clientX - st.x;
            const dy = e.clientY - st.y;
            const newW = Math.max(MIN_PANEL_W, st.w + dx);
            const newH = Math.max(MIN_PANEL_H, st.h + dy);
            panel.style.width = newW + 'px';
            panel.style.height = newH + 'px';
        } else {
            const right = st.left + st.w;
            const bottom = st.top + st.h;

            if (edge === 'e') {
                let newW = e.clientX - st.left;
                newW = Math.max(MIN_PANEL_W, Math.min(newW, window.innerWidth - st.left));
                panel.style.left = st.left + 'px';
                panel.style.top = st.top + 'px';
                panel.style.width = newW + 'px';
                panel.style.height = st.h + 'px';
            } else if (edge === 'w') {
                let newW = right - e.clientX;
                newW = Math.max(MIN_PANEL_W, Math.min(newW, right));
                let newLeft = right - newW;
                if (newLeft < 0) {
                    newW += newLeft;
                    newLeft = 0;
                }
                panel.style.left = newLeft + 'px';
                panel.style.top = st.top + 'px';
                panel.style.width = newW + 'px';
                panel.style.height = st.h + 'px';
            } else if (edge === 's') {
                let newH = e.clientY - st.top;
                newH = Math.max(MIN_PANEL_H, Math.min(newH, window.innerHeight - st.top));
                panel.style.left = st.left + 'px';
                panel.style.top = st.top + 'px';
                panel.style.width = st.w + 'px';
                panel.style.height = newH + 'px';
            } else if (edge === 'n') {
                let newH = bottom - e.clientY;
                newH = Math.max(MIN_PANEL_H, Math.min(newH, bottom));
                let newTop = bottom - newH;
                if (newTop < 0) {
                    newH += newTop;
                    newTop = 0;
                }
                panel.style.left = st.left + 'px';
                panel.style.top = newTop + 'px';
                panel.style.width = st.w + 'px';
                panel.style.height = newH + 'px';
            }
        }

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
    
    // Show loading overlay when switching to terminal mode
    if (newMode === 'terminal') {
        if (!t.termWs) {
            showTerminalLoading(t.panel, pName);
            t._termClean = false;
        } else if (!t._termClean) {
            showTerminalLoading(t.panel, pName);
            setTimeout(() => {
                t.term.reset();
                t._termClean = true;
                hideTerminalLoading(t.panel, pName);
                refit(t);
            }, 500);
        }
    }
    
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
    
    const clearChatBtn = t.panel.querySelector('.terminal-clear-chat-btn');
    if (t.activeMode === 'chat') {
        if(chatContainer) chatContainer.classList.remove('hidden');
        if(termContainer) termContainer.classList.add('hidden');
        if(modeChatBtn) modeChatBtn.classList.add('active');
        if(modeTermBtn) modeTermBtn.classList.remove('active');
        if(footer) footer.classList.add('hidden'); // Hide activity bar in chat mode
        if(clearChatBtn) clearChatBtn.classList.remove('hidden');
    } else {
        if(chatContainer) chatContainer.classList.add('hidden');
        if(termContainer) termContainer.classList.remove('hidden');
        if(modeTermBtn) modeTermBtn.classList.add('active');
        if(modeChatBtn) modeChatBtn.classList.remove('active');
        if(footer) footer.classList.remove('hidden');
        if(clearChatBtn) clearChatBtn.classList.add('hidden');
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
    
    // Function to check if agent is currently processing
    const isAgentBusy = () => {
        const robot = state.walkingRobots[pName];
        return (robot && robot.isThinking) || 
               (t.activityStream && t.activityStream.isActive) ||
               (t.chatMessages && t.chatMessages.some(m => 
                   (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) ||
                   m.isProcessingGap
               ));
    };

    // Function to update send button and input row based on agent state
    const updateSendButton = () => {
        if (!chatSendBtn) return; // Safety check
        
        const chatInputRow = panel.querySelector('.chat-input-row');
        const isBusy = isAgentBusy();
        
        if (isBusy) {
            chatSendBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            `;
            chatSendBtn.title = "Stop (Esc)";
            chatSendBtn.classList.add('is-stop-button');
            if (chatInputRow) chatInputRow.classList.add('agent-busy');
            
            // Update input placeholder to show cancel hint
            if (chatInput) {
                chatInput.placeholder = "Agent is working... Press Esc or click Stop to cancel";
            }
        } else {
            chatSendBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            `;
            chatSendBtn.title = "Send (Enter)";
            chatSendBtn.classList.remove('is-stop-button');
            if (chatInputRow) chatInputRow.classList.remove('agent-busy');
            
            // Restore normal placeholder
            if (chatInput) {
                chatInput.placeholder = "Type a message... (Shift+Enter for newline)";
            }
        }
    };

    // Function to cancel/stop current operation
    const cancelOperation = () => {
        console.log(`🛑 Canceling operation for ${pName}`);
        
        // Close WebSocket connection to stop current process
        if (t.chatWs && t.chatWs.readyState === WebSocket.OPEN) {
            t.chatWs.close();
            // Reconnect after short delay
            setTimeout(() => {
                t.setupModeWs('chat');
            }, 500);
        }
        
        // Clear thinking/processing states
        const robot = state.walkingRobots[pName];
        if (robot) {
            robot.isThinking = false;
            robot.hasUpdate = false;
            robot.hasError = false;
            renderRobots();
        }
        
        // Clear processing indicators and activity stream
        window.hideProcessingIndicator(pName);
        window.clearActivityStream(pName);
        
        // Remove thinking/processing pills
        t.chatMessages = t.chatMessages.filter(m => {
            if (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) return false;
            if (m.isProcessingGap) return false;
            if (m.role === 'activity') return false;
            return true;
        });
        
        // Add cancellation message
        t.chatMessages.push({ 
            role: 'system', 
            content: '⏹️ Operation cancelled by user' 
        });
        
        saveChatHistory(pName, t.chatMessages);
        renderChatMessages(pName);
        updateSendButton();
        
        showToast('info', '⏹️', 'Operation cancelled');
    };

    // Auto-resize function
    const autoResize = () => {
        if (!chatInput) return;
        
        // Reset height to get accurate scrollHeight
        chatInput.style.height = 'auto';
        
        // Calculate required height
        const scrollHeight = chatInput.scrollHeight;
        const minHeight = 40; // 2.5rem * 16px
        const maxHeight = 200; // ~8 lines at 14px line-height
        
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        
        // Apply new height
        chatInput.style.height = `${newHeight}px`;
        
        // Handle scrolling for content that exceeds max height
        if (scrollHeight > maxHeight) {
            chatInput.style.overflowY = 'auto';
        } else {
            chatInput.style.overflowY = 'hidden';
        }
    };

    // Debounced version
    let resizeTimer;
    const debouncedAutoResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(autoResize, 10);
    };
    
    if (chatSendBtn && chatInput) {

        const sendChat = () => {
            // If agent is busy, cancel operation instead of sending
            if (isAgentBusy()) {
                cancelOperation();
                return;
            }

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
                    
                    // Update button to show stop state
                    updateSendButton();
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
            } else if (e.key === 'Escape') {
                // ESC key cancels operation if agent is busy
                if (isAgentBusy()) {
                    e.preventDefault();
                    cancelOperation();
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });

        // Setup auto-resize event listeners
        chatInput.addEventListener('input', debouncedAutoResize);
        chatInput.addEventListener('paste', () => setTimeout(debouncedAutoResize, 0));
        chatInput.addEventListener('keydown', (e) => {
            // Handle special keys that might change content
            if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(debouncedAutoResize, 0);
            }
        });
        
        // Initial resize
        setTimeout(autoResize, 100);
        
        // Resize on window resize to maintain proportions
        const handleWindowResize = () => debouncedAutoResize();
        window.addEventListener('resize', handleWindowResize);
        
        // Store cleanup function
        t.cleanupInputResize = () => {
            window.removeEventListener('resize', handleWindowResize);
            clearTimeout(resizeTimer); // Use the correct timer variable
        };

        // Periodically update send button state
        const updateButtonInterval = setInterval(() => {
            if (document.contains(chatSendBtn)) {
                updateSendButton();
            } else {
                clearInterval(updateButtonInterval);
            }
        }, 500);

    }
    
    // Store references for cleanup and external access (always available now)
    t.updateSendButton = updateSendButton;
    t.cancelOperation = cancelOperation;
    t.autoResize = autoResize;
    t.isAgentBusy = isAgentBusy;
    
    // Initial render and button state
    renderChatMessages(pName);
    if (chatSendBtn && typeof updateSendButton === 'function') {
        setTimeout(() => {
            try {
                updateSendButton();
            } catch (err) {
                console.warn(`Failed to update send button for ${pName}:`, err);
            }
        }, 100);
    }
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
        // Render activity stream messages
        if (m.role === 'activity') {
            const typeIcons = {
                'tool_start': '🔧',
                'tool_complete': '✅',
                'error': '❌',
                'info': 'ℹ️'
            };
            const icon = typeIcons[m.type] || 'ℹ️';
            const timeStr = m.timestamp || '';
            
            return `<div class="chat-bubble activity-stream ${m.type}" data-time="${timeStr}">
                <div class="activity-stream-content">
                    <span class="activity-icon">${icon}</span>
                    <span class="activity-message">${m.content}</span>
                    <span class="activity-timestamp">${timeStr}</span>
                </div>
            </div>`;
        }

        // Render thinking pill
        if (m.role === 'thinking') {
            const escapedContent = (m.content || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/\n/g, '<br>');
            const isCollapsed = m.collapsed === true;
            const contentHtml = !isCollapsed
                ? `<div class="thinking-pill-content">${escapedContent}</div>`
                : '';
            const copyBtn = `<button class="bubble-copy-btn" onclick="window.copyBubbleText(event, '${pName}', ${msgIdx})" title="Copy thought process">
                <svg class="icon-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <svg class="icon-success" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>`;
            return `<div class="chat-bubble assistant thinking-bubble ${isCollapsed ? 'collapsed' : 'expanded'}" onclick="window.toggleThinkingPill('${pName}', ${msgIdx})">
                ${copyBtn}
                <div class="thinking-pill-header">
                    <span class="thinking-pill-icon">💭</span>
                    <span class="thinking-pill-label">Thought process</span>
                    <span class="thinking-pill-toggle">${isCollapsed ? '▶' : '▼'}</span>
                </div>
                ${contentHtml}
            </div>`;
        }

        // Render system messages with WhatsApp-style thinking bubble
        if (m.role === 'system') {
            const isAnimated = m.content === 'Thinking...' || m.content === 'Processing...';
            
            // WhatsApp-style thinking bubble for animated states
            if (isAnimated) {
                const robot = state.walkingRobots && state.walkingRobots[pName];
                const agentClass = robot ? `thinking-bubble-agent-${pName}` : '';
                const thinkingType = m.content === 'Thinking...' ? 'thinking' : 'processing';
                const isAgentThinking = robot && robot.isThinking;
                const syncClass = isAgentThinking ? 'synced-with-agent' : '';
                
                // Check if this is a processing gap indicator
                const isProcessingGap = m.isProcessingGap;
                const processingGapClass = isProcessingGap ? 'processing-gap' : '';
                const gapType = m.processingGapType || thinkingType;
                
                return `
                    <div class="chat-bubble assistant thinking-bubble-whatsapp ${agentClass} ${syncClass} ${processingGapClass}" 
                         data-agent="${pName}" 
                         data-type="${gapType}"
                         data-agent-thinking="${isAgentThinking}"
                         data-processing-gap="${isProcessingGap}"
                         title="${isProcessingGap ? 'Processing continues...' : `${pName} is ${thinkingType}`}">
                        <div class="whatsapp-typing-indicator">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                        <div class="thinking-bubble-tail"></div>
                        <div class="agent-sync-indicator" title="Synced with ${pName}">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
                            </svg>
                        </div>
                    </div>
                `;
            }
            
            // Error system messages
            if (m.isError) {
                return `<div class="chat-bubble system system-error">⚠️ ${m.content}</div>`;
            }

            // Regular system messages (non-animated)
            return `<div class="chat-bubble system">${m.content}</div>`;
        }

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
        const copyBtn = `<button class="bubble-copy-btn" onclick="window.copyBubbleText(event, '${pName}', ${msgIdx})" title="Copy message">
            <svg class="icon-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <svg class="icon-success" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>`;
        return `<div class="chat-bubble ${m.role}">${copyBtn}${text}${optionsHtml}${isDone}</div>`;
    }).join('');
    
    setTimeout(() => {
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }, 10);
}

function saveChatHistory(pName, messages) {
    // Never persist temporary system states
    const filtered = messages.filter(m => 
        (m.role !== 'system' || (m.content !== 'Thinking...' && m.content !== 'Processing...'))
    );
    localStorage.setItem('nova-chat-' + pName, JSON.stringify(filtered));
}

window.toggleThinkingPill = function(pName, msgIdx) {
    const t = state.terminals[pName];
    if (!t || !t.chatMessages[msgIdx]) return;
    const msg = t.chatMessages[msgIdx];
    // Treat undefined as collapsed (true), then toggle
    msg.collapsed = msg.collapsed !== false ? false : true;
    
    renderChatMessages(pName);
    
    // Auto-scroll after expansion to keep the content in view
    if (!msg.collapsed) {
        setTimeout(() => {
            const msgContainer = t.panel.querySelector('.chat-messages');
            if (msgContainer) {
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }
        }, 50);
    }
};

window.copyBubbleText = function(event, pName, msgIdx) {
    if (event) event.stopPropagation();
    const t = state.terminals[pName];
    if (!t || !t.chatMessages[msgIdx]) return;
    
    const content = t.chatMessages[msgIdx].content || '';
    if (!content) return;
    
    const btn = event.currentTarget;
    console.log('Copy button clicked:', btn); // Debug log
    
    // Function to show success animation
    const showSuccessAnimation = () => {
        if (btn) {
            console.log('Adding is-copied class to button'); // Debug log
            
            // Force reflow to ensure CSS transitions work properly
            btn.offsetHeight;
            
            btn.classList.add('is-copied');
            
            // Add a small delay to ensure the animation is visible
            setTimeout(() => { 
                console.log('Removing is-copied class from button'); // Debug log
                btn.classList.remove('is-copied');
            }, 2000);
        }
    };
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(content).then(() => {
            console.log('Clipboard write successful'); // Debug log
            showToast('success', '📋', 'Copied to clipboard');
            showSuccessAnimation();
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            // Fallback to execCommand
            fallbackCopy(content, showSuccessAnimation);
        });
    } else {
        console.log('Using fallback copy method'); // Debug log
        // Fallback for non-secure contexts or older browsers
        fallbackCopy(content, showSuccessAnimation);
    }
};

// Fallback copy method using execCommand
function fallbackCopy(text, onSuccess) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    
    try {
        textArea.select();
        textArea.setSelectionRange(0, 99999); // For mobile devices
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            console.log('Fallback copy successful'); // Debug log
            showToast('success', '📋', 'Copied to clipboard');
            onSuccess();
        } else {
            throw new Error('execCommand copy failed');
        }
    } catch (err) {
        document.body.removeChild(textArea);
        console.error('All copy methods failed:', err);
        showToast('error', '❌', 'Failed to copy');
    }
}

// Sync WhatsApp thinking bubbles with agent state
window.syncThinkingBubblesWithAgents = function() {
    if (!state.walkingRobots) return;
    
    // Update all thinking bubbles based on current agent states
    document.querySelectorAll('.thinking-bubble-whatsapp[data-agent]').forEach(bubble => {
        const agentName = bubble.getAttribute('data-agent');
        const robot = state.walkingRobots[agentName];
        const t = state.terminals[agentName];
        
        if (robot) {
            // Update sync status
            const isThinking = robot.isThinking;
            const hasActivity = t && t.activityStream && t.activityStream.isActive;
            const wasThinking = bubble.getAttribute('data-agent-thinking') === 'true';
            
            bubble.setAttribute('data-agent-thinking', isThinking);
            bubble.setAttribute('data-has-activity', hasActivity);
            
            // Debug logging
            if (isThinking !== wasThinking) {
                console.log(`Agent ${agentName} thinking state changed: ${wasThinking} → ${isThinking} (activity: ${hasActivity})`);
            }
            
            if (isThinking || hasActivity) {
                bubble.classList.add('synced-with-agent');
                if (hasActivity) {
                    bubble.classList.add('has-activity');
                }
            } else {
                bubble.classList.remove('synced-with-agent', 'enhanced-sync', 'has-activity');
            }
            
            // Add enhanced coordination effects
            if ((isThinking || hasActivity) && !bubble.classList.contains('enhanced-sync')) {
                bubble.classList.add('enhanced-sync');
                
                // Add subtle vibration effect for better user feedback
                setTimeout(() => {
                    const animation = hasActivity 
                        ? 'bubble-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), subtle-pulse 2s infinite ease-in-out 0.3s, sync-vibrate 0.5s ease-in-out'
                        : 'bubble-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), subtle-pulse 3s infinite ease-in-out 0.3s, sync-vibrate 0.5s ease-in-out';
                    bubble.style.animation = animation;
                }, 100);
            }
        }
    });
};

// Test function for cancel functionality
window.testCancelFeature = function(agentName = 'Ask-Me-Anything') {
    console.log(`🧪 Testing cancel functionality for ${agentName}`);
    
    const t = state.terminals[agentName];
    if (!t) {
        console.warn(`Terminal ${agentName} not found`);
        return;
    }
    
    console.log('Current state:', {
        isAgentBusy: t.updateSendButton ? (() => {
            const robot = state.walkingRobots[agentName];
            return (robot && robot.isThinking) || 
                   (t.activityStream && t.activityStream.isActive) ||
                   (t.chatMessages && t.chatMessages.some(m => 
                       (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) ||
                       m.isProcessingGap
                   ));
        })() : 'unknown',
        hasUpdateFunction: !!t.updateSendButton,
        hasCancelFunction: !!t.cancelOperation
    });
    
    if (t.updateSendButton) {
        t.updateSendButton();
        console.log('✅ Send button state updated');
    }
    
    console.log('💡 To test:');
    console.log('1. Send a message that takes time (e.g., web search)');
    console.log('2. Notice send button changes to stop button (🔴)');
    console.log('3. Press ESC or click stop button to cancel');
    console.log('4. Input placeholder changes during busy state');
};

// Test function for auto-resize
window.testAutoResize = function(agentName = 'Ask-Me-Anything') {
    console.log(`🧪 Testing auto-resize for ${agentName}`);
    
    const t = state.terminals[agentName];
    if (!t || !t.panel) {
        console.warn(`Terminal ${agentName} not found`);
        return;
    }
    
    const chatInput = t.panel.querySelector('.chat-input');
    if (!chatInput) {
        console.warn('Chat input not found');
        return;
    }
    
    console.log('Current textarea state:', {
        height: chatInput.style.height,
        scrollHeight: chatInput.scrollHeight,
        hasAutoResize: !!t.autoResize,
        resizeProperty: getComputedStyle(chatInput).resize
    });
    
    // Test with long text
    const testText = 'This is line 1\nThis is line 2\nThis is line 3\nThis is line 4\nThis is line 5\nThis is line 6\nThis is line 7\nThis is line 8\nThis should trigger scrolling';
    chatInput.value = testText;
    
    if (t.autoResize) {
        t.autoResize();
        console.log('✅ Auto-resize triggered');
    }
    
    setTimeout(() => {
        console.log('After resize:', {
            height: chatInput.style.height,
            overflowY: chatInput.style.overflowY,
            scrollHeight: chatInput.scrollHeight
        });
        
        // Clear test text
        chatInput.value = '';
        if (t.autoResize) t.autoResize();
    }, 100);
    
    console.log('💡 Manual testing:');
    console.log('1. Type multiple lines using Shift+Enter');
    console.log('2. Notice textarea auto-expands up to 8 lines');
    console.log('3. After 8 lines, scroll appears inside textarea');
    console.log('4. Drag resize handle (bottom-right corner) manually');
};

// Test function for debugging WhatsApp bubble integration
window.testWhatsAppBubble = function(agentName = 'AMA') {
    console.log('🧪 Testing WhatsApp thinking bubble integration...');
    
    // Check if agent exists
    if (!state.walkingRobots || !state.walkingRobots[agentName]) {
        console.warn(`Agent ${agentName} not found in walkingRobots`);
        return;
    }
    
    const robot = state.walkingRobots[agentName];
    console.log(`Current agent state:`, { isThinking: robot.isThinking, hasUpdate: robot.hasUpdate });
    
    // Find thinking bubbles for this agent
    const bubbles = document.querySelectorAll(`.thinking-bubble-whatsapp[data-agent="${agentName}"]`);
    console.log(`Found ${bubbles.length} thinking bubbles for agent ${agentName}`);
    
    bubbles.forEach((bubble, index) => {
        console.log(`Bubble ${index + 1}:`, {
            agentThinking: bubble.getAttribute('data-agent-thinking'),
            syncClass: bubble.classList.contains('synced-with-agent'),
            enhancedSync: bubble.classList.contains('enhanced-sync'),
            type: bubble.getAttribute('data-type')
        });
    });
    
    // Test sync function
    window.syncThinkingBubblesWithAgents();
    console.log('✅ Sync function called');
};

// Debug function to simulate processing gaps for testing
window.simulateProcessingGap = function(agentName = 'SUMO', duration = 3000) {
    console.log(`🧪 Simulating processing gap for ${agentName} (${duration}ms)`);
    
    window.showProcessingIndicator(agentName, 'processing');
    
    setTimeout(() => {
        console.log(`✅ Simulated gap complete for ${agentName}`);
        window.hideProcessingIndicator(agentName);
    }, duration);
};

// Agent Activity Streaming System
window.handleToolActivityStream = function(pName, parsed) {
    console.log(`🔧 Tool activity for ${pName}:`, parsed);
    
    const t = state.terminals[pName];
    if (!t) return;
    
    // Initialize activity stream if not exists
    if (!t.activityStream) {
        t.activityStream = {
            messages: [],
            isActive: false,
            startTime: null
        };
    }
    
    let activityMessage = '';
    let activityType = '';
    
    if (parsed.type === 'tool_use' || parsed.type === 'tool_call') {
        // Agent is using a tool
        const toolName = parsed.name || parsed.tool_name || 'Unknown';
        const toolInput = parsed.input || parsed.arguments || {};
        
        activityType = 'tool_start';
        
        // Get enhanced tool display info
        const toolDisplay = window.getToolDisplayInfo(toolName, toolInput);
        activityMessage = `${toolDisplay.icon} ${toolDisplay.message}`;
        
        // Show immediate activity
        window.addActivityStreamMessage(pName, activityMessage, activityType);
        
        // Show processing indicator dengan activity context
        window.showProcessingIndicator(pName, 'processing');
        
        // Update agent thinking state to show activity
        const robot = state.walkingRobots && state.walkingRobots[pName];
        if (robot) {
            robot.isThinking = true;
            robot.hasUpdate = true; // Add update indicator for activity
            renderRobots();
        }
        
    } else if (parsed.type === 'tool_result') {
        // Tool completed
        activityType = 'tool_complete';
        
        if (parsed.error) {
            activityMessage = `❌ Tool error: ${typeof parsed.error === 'string' ? parsed.error.substring(0, 80) : 'Failed'}`;
        } else {
            // Summarize result size
            const content = parsed.content || '';
            const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
            const contentLength = contentStr.length;
            
            if (contentLength > 500) {
                activityMessage = `✅ Received ${Math.round(contentLength / 1024)}KB of data`;
            } else if (contentLength > 0) {
                activityMessage = `✅ Result received (${contentLength} chars)`;
            } else {
                activityMessage = `✅ Completed`;
            }
        }
        
        window.addActivityStreamMessage(pName, activityMessage, activityType);
        
        // Hide processing indicator after a short delay
        setTimeout(() => {
            window.hideProcessingIndicator(pName);
        }, 500);
    }
};

// Add activity stream message to terminal
window.addActivityStreamMessage = function(pName, message, type = 'info') {
    const t = state.terminals[pName];
    if (!t) return;
    
    // Initialize activity stream if not exists
    if (!t.activityStream) {
        t.activityStream = {
            messages: [],
            isActive: false,
            startTime: null
        };
    }
    
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    const activityMsg = {
        role: 'activity',
        content: message,
        type: type,
        timestamp: timestamp,
        time: Date.now()
    };
    
    // Add to activity stream
    t.activityStream.messages.push(activityMsg);
    t.activityStream.isActive = true;
    t.activityStream.startTime = t.activityStream.startTime || Date.now();
    
    // Add to chat messages for display
    t.chatMessages.push(activityMsg);
    
    // Limit activity messages to prevent overflow
    const maxActivityMessages = 10;
    const activityMessages = t.chatMessages.filter(m => m.role === 'activity');
    if (activityMessages.length > maxActivityMessages) {
        // Remove oldest activity message
        const oldestIdx = t.chatMessages.findIndex(m => m.role === 'activity');
        if (oldestIdx !== -1) {
            t.chatMessages.splice(oldestIdx, 1);
        }
    }
    
    renderChatMessages(pName);
    
    // Sync thinking bubbles when activity changes
    window.syncThinkingBubblesWithAgents();
    
    console.log(`📡 Activity stream [${pName}]: ${message}`);
};

// Clear activity stream when response is complete
window.clearActivityStream = function(pName) {
    const t = state.terminals[pName];
    if (!t || !t.activityStream) return;
    
    // Add completion summary if there were activities
    if (t.activityStream.messages.length > 0 && t.activityStream.startTime) {
        const duration = Math.round((Date.now() - t.activityStream.startTime) / 1000);
        const toolCount = t.activityStream.messages.filter(m => m.type === 'tool_start').length;
        
        if (toolCount > 0) {
            const summaryMsg = {
                role: 'activity',
                content: `📊 Task completed - Used ${toolCount} tool${toolCount > 1 ? 's' : ''} in ${duration}s`,
                type: 'summary',
                timestamp: new Date().toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                }),
                time: Date.now()
            };
            
            t.chatMessages.push(summaryMsg);
            renderChatMessages(pName);
        }
    }
    
    // Fade out activity messages after showing summary
    setTimeout(() => {
        // Remove activity messages from chat
        t.chatMessages = t.chatMessages.filter(m => m.role !== 'activity');
        
        // Reset activity stream
        t.activityStream = {
            messages: [],
            isActive: false,
            startTime: null
        };
        
        renderChatMessages(pName);
        console.log(`🧹 Cleared activity stream for ${pName}`);
    }, 1500);
};

// Enhanced activity streaming with better tool detection
window.getToolDisplayInfo = function(toolName, toolInput) {
    const toolDisplayMap = {
        'WebSearch': {
            icon: '🔍',
            action: 'Searching',
            getDetails: (input) => `"${input.search_term || input.query || 'web search'}"`
        },
        'web_search': {
            icon: '🔍',
            action: 'Searching',
            getDetails: (input) => `"${input.search_term || input.query || 'web search'}"`
        },
        'WebFetch': {
            icon: '📥',
            action: 'Fetching',
            getDetails: (input) => {
                const url = input.url || '';
                return url.length > 50 ? `${url.substring(0, 50)}...` : url;
            }
        },
        'web_fetch': {
            icon: '📥',
            action: 'Fetching',
            getDetails: (input) => {
                const url = input.url || '';
                return url.length > 50 ? `${url.substring(0, 50)}...` : url;
            }
        },
        'Read': {
            icon: '📄',
            action: 'Reading',
            getDetails: (input) => input.path || input.file_path || 'file'
        },
        'Write': {
            icon: '✏️',
            action: 'Writing',
            getDetails: (input) => input.path || input.file_path || 'file'
        },
        'Shell': {
            icon: '⚡',
            action: 'Running',
            getDetails: (input) => input.command || 'command'
        },
        'Grep': {
            icon: '🔎',
            action: 'Searching',
            getDetails: (input) => `for "${input.pattern || 'pattern'}"`
        },
        'SemanticSearch': {
            icon: '🧠',
            action: 'Searching',
            getDetails: (input) => `"${input.query || 'semantic search'}"`
        }
    };
    
    const toolInfo = toolDisplayMap[toolName];
    if (toolInfo) {
        return {
            icon: toolInfo.icon,
            message: `${toolInfo.action} ${toolInfo.getDetails(toolInput)}`
        };
    }
    
    // Default fallback
    return {
        icon: '🔧',
        message: `Using ${toolName}`
    };
};

// Test function for activity streaming
window.testActivityStream = function(agentName = 'SUMO') {
    console.log(`🧪 Testing activity stream for ${agentName}`);
    
    // Simulate web search activity
    setTimeout(() => {
        window.handleToolActivityStream(agentName, {
            type: 'tool_use',
            name: 'WebSearch',
            input: { search_term: 'latest gaming news non-esports' }
        });
    }, 100);
    
    setTimeout(() => {
        window.handleToolActivityStream(agentName, {
            type: 'tool_result',
            content: 'Search completed successfully'
        });
    }, 2000);
    
    setTimeout(() => {
        window.handleToolActivityStream(agentName, {
            type: 'tool_use',
            name: 'WebFetch',
            input: { url: 'https://example.com/gaming-news' }
        });
    }, 2500);
    
    setTimeout(() => {
        window.handleToolActivityStream(agentName, {
            type: 'tool_result',
            content: 'Content fetched successfully'
        });
    }, 4000);
    
    // Complete the test
    setTimeout(() => {
        window.clearActivityStream(agentName);
        console.log('✅ Activity stream test completed');
    }, 6000);
};

// Show current activity stream status
window.getActivityStreamStatus = function(agentName) {
    const t = state.terminals[agentName];
    if (!t) return null;
    
    if (!t.activityStream) return { active: false };
    
    return {
        active: t.activityStream.isActive,
        messageCount: t.activityStream.messages.length,
        startTime: t.activityStream.startTime,
        duration: t.activityStream.startTime ? Date.now() - t.activityStream.startTime : 0,
        messages: t.activityStream.messages.map(m => ({
            type: m.type,
            content: m.content,
            timestamp: m.timestamp
        }))
    };
};

// Enhanced processing gap detection and thinking bubble management
window.showProcessingIndicator = function(pName, type = 'processing') {
    const t = state.terminals[pName];
    if (!t) return;
    
    // Check if there's already a processing indicator
    const hasProcessingIndicator = t.chatMessages.some(m => m.isProcessingGap);
    if (hasProcessingIndicator) return;
    
    console.log(`🔄 Showing processing indicator for ${pName} (type: ${type})`);
    
    // Add a temporary processing message
    const processingMsg = {
        role: 'system',
        content: type === 'thinking' ? 'Thinking...' : 'Processing...',
        isProcessingGap: true,
        processingGapType: type,
        timestamp: Date.now()
    };
    
    t.chatMessages.push(processingMsg);
    renderChatMessages(pName);
    
    // Sync with agent state
    const robot = state.walkingRobots && state.walkingRobots[pName];
    if (robot && !robot.isThinking) {
        robot.isThinking = true;
        renderRobots();
    }
    
    // Set timeout to auto-remove if no new content arrives
    setTimeout(() => {
        const lastMsg = t.chatMessages[t.chatMessages.length - 1];
        if (lastMsg && lastMsg.isProcessingGap && lastMsg.timestamp === processingMsg.timestamp) {
            t.chatMessages.pop();
            renderChatMessages(pName);
            console.log(`⏰ Auto-removed processing indicator for ${pName}`);
            
            // Reset robot state if this was our indicator
            if (robot) {
                robot.isThinking = false;
                renderRobots();
            }
        }
    }, 10000); // Remove after 10 seconds if still there
};

window.hideProcessingIndicator = function(pName) {
    const t = state.terminals[pName];
    if (!t) return;
    
    // Check if there were processing gap indicators
    const hasProcessingGaps = t.chatMessages.some(m => m.isProcessingGap);
    
    // Remove any processing gap indicators
    const initialLength = t.chatMessages.length;
    t.chatMessages = t.chatMessages.filter(m => !m.isProcessingGap);
    
    if (t.chatMessages.length !== initialLength) {
        renderChatMessages(pName);
        console.log(`🚫 Removed processing indicator for ${pName}`);
        
        // Reset robot thinking state if we removed processing gaps
        if (hasProcessingGaps) {
            const robot = state.walkingRobots && state.walkingRobots[pName];
            if (robot && robot.isThinking) {
                // Only reset if there are no real thinking blocks currently active
                const hasActiveThinking = t.chatMessages.some(m => 
                    m.role === 'system' && 
                    (m.content === 'Thinking...' || m.content === 'Processing...') &&
                    !m.isProcessingGap
                );
                
                if (!hasActiveThinking) {
                    robot.isThinking = false;
                    renderRobots();
                }
            }
        }
    }
};

// Monitor response gaps and show processing indicators
window.monitorResponseGaps = function(pName) {
    const t = state.terminals[pName];
    if (!t) return;
    
    // Clear existing gap timer
    if (t.gapTimer) {
        clearTimeout(t.gapTimer);
    }
    
    // Set new timer to detect processing gaps
    t.gapTimer = setTimeout(() => {
        const robot = state.walkingRobots && state.walkingRobots[pName];
        
        // Check if agent is still active/thinking or if there's ongoing processing
        const shouldShowIndicator = robot && (
            robot.isThinking || 
            robot.hasUpdate ||
            // Check if the last message was incomplete (no isDone flag)
            (t.chatMessages.length > 0 && 
             t.chatMessages[t.chatMessages.length - 1].role === 'assistant' && 
             !t.chatMessages[t.chatMessages.length - 1].isDone)
        );
        
        if (shouldShowIndicator) {
            console.log(`⏳ Detected processing gap for ${pName}, showing indicator`);
            window.showProcessingIndicator(pName, 'processing');
        }
    }, 1500); // Show indicator after 1.5 second gap
};

export function handleChatJsonEvent(t, pName, parsed) {
    if (!parsed) return;
    
    // Silently ignore events that should never render as chat bubbles
    const IGNORED_TYPES = ['permission'];
    if (IGNORED_TYPES.includes(parsed.type)) return;

    // Handle top-level error events (e.g. {"type":"error","error":{"type":"rate_limit_error","message":"..."}})
    if (parsed.type === 'error') {
        const errObj = parsed.error || {};
        const errMsg = errObj.message || parsed.message || 'Unknown error';
        const errType = errObj.type || '';
        const isRetrying = /Retrying|attempt/i.test(errMsg);

        // Clear thinking pills
        t.chatMessages = t.chatMessages.filter(m =>
            !(m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) &&
            !m.isProcessingGap
        );

        // Avoid duplicate error bubbles for the same ongoing retry cycle
        const lastErr = t.chatMessages[t.chatMessages.length - 1];
        const isSameError = lastErr && lastErr.isError && lastErr._errType === errType;
        if (isSameError) {
            lastErr.content = `Error: ${errMsg}`;
        } else {
            t.chatMessages.push({ role: 'system', content: `Error: ${errMsg}`, isError: true, _errType: errType });
        }

        const robot = state.walkingRobots[pName];
        if (robot) {
            robot.isThinking = false;
            robot.hasError = true;
            renderRobots();
        }

        saveChatHistory(pName, t.chatMessages);
        renderChatMessages(pName);

        if (!isRetrying) {
            const project = state.projects.find(p => p.name === pName);
            showToast('error', '⚠️', `${project?.nickname || pName}: ${errMsg.substring(0, 80)}`);
            fireAgentNotification(pName, project?.nickname, `⚠️ ${errMsg.substring(0, 60)}`);
        }

        // Update send button
        if (t && typeof t.updateSendButton === 'function') {
            try { t.updateSendButton(); } catch(e) {}
        }
        return;
    }

    // Handle user events - they carry tool_result after tool_use
    if (parsed.type === 'user' && parsed.message?.content) {
        const toolResults = Array.isArray(parsed.message.content)
            ? parsed.message.content.filter(c => c.type === 'tool_result')
            : [];
        
        if (toolResults.length > 0) {
            toolResults.forEach(result => {
                window.handleToolActivityStream(pName, {
                    type: 'tool_result',
                    content: typeof result.content === 'string' 
                        ? result.content 
                        : JSON.stringify(result.content || ''),
                    error: result.is_error ? result.content : null
                });
            });
        }
        // Don't render user messages as chat bubbles
        return;
    }
    
    // Handle tool use and results for activity streaming
    if (['tool_use', 'tool_call', 'tool_result'].includes(parsed.type)) {
        window.handleToolActivityStream(pName, parsed);
        return;
    }
    
    // Handle stream_event for real-time streaming (from --include-partial-messages)
    if (parsed.type === 'stream_event') {
        const event = parsed.event || parsed;
        const subtype = event.subtype || event.type || '';
        
        // content_block_start with tool_use → agent is starting a tool
        if (subtype === 'content_block_start' && event.content_block?.type === 'tool_use') {
            window.handleToolActivityStream(pName, {
                type: 'tool_use',
                name: event.content_block.name,
                input: event.content_block.input || {}
            });
            return;
        }
        
        // content_block_start with thinking → thinking started
        if (subtype === 'content_block_start' && event.content_block?.type === 'thinking') {
            const robot = state.walkingRobots[pName];
            if (robot) { robot.isThinking = true; renderRobots(); }
            // Show thinking bubble
            if (!t.chatMessages.some(m => m.role === 'system' && m.content === 'Thinking...')) {
                t.chatMessages.push({ role: 'system', content: 'Thinking...' });
                renderChatMessages(pName);
            }
            return;
        }
        
        // content_block_delta with text_delta → STREAM TEXT in real time
        if (subtype === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const textFragment = event.delta.text || '';
            if (!textFragment) return;
            
            // Clear thinking/processing pills when text starts arriving
            const hadPills = t.chatMessages.some(m => 
                (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) ||
                m.isProcessingGap
            );
            if (hadPills) {
                t.chatMessages = t.chatMessages.filter(m => {
                    if (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) return false;
                    if (m.isProcessingGap) return false;
                    return true;
                });
            }
            
            // Append to current assistant message or create a new one
            let lastMsg = t.chatMessages[t.chatMessages.length - 1];
            if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isDone) {
                t.chatMessages.push({ role: 'assistant', content: textFragment });
            } else {
                lastMsg.content += textFragment;
            }
            
            // Update robot state
            const robot = state.walkingRobots[pName];
            if (robot && robot.isThinking) {
                robot.isThinking = false;
                renderRobots();
            }
            
            // Hide processing indicators
            window.hideProcessingIndicator(pName);
            
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);
            return;
        }
        
        // content_block_delta with thinking_delta → accumulate thinking
        if (subtype === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
            const thinkingFragment = event.delta.thinking || '';
            if (!thinkingFragment) return;
            
            let lastMsg = t.chatMessages[t.chatMessages.length - 1];
            if (lastMsg && lastMsg.role === 'thinking') {
                lastMsg.content += thinkingFragment;
            } else {
                // Clear thinking pills first
                t.chatMessages = t.chatMessages.filter(m => 
                    !(m.role === 'system' && m.content === 'Thinking...')
                );
                t.chatMessages.push({ 
                    role: 'thinking', 
                    content: thinkingFragment,
                    collapsed: true
                });
            }
            renderChatMessages(pName);
            return;
        }
        
        // input_json_delta → tool input is being streamed
        if (subtype === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
            return;
        }
        
        // content_block_stop → block finished
        if (subtype === 'content_block_stop') {
            return;
        }
        
        // message_start → new message beginning
        if (subtype === 'message_start') {
            return;
        }
        
        // message_delta / message_stop → message lifecycle
        if (subtype === 'message_delta' || subtype === 'message_stop') {
            return;
        }
        
        // Unknown stream_event - log for debugging, don't swallow
        console.log(`[Agent:${pName}] Unhandled stream_event subtype="${subtype}"`, event);
        return;
    }

    // Extract tool usage info from assistant messages before filtering
    if (parsed.type === 'assistant' && parsed.message?.content) {
        const hasOnlyToolUse = parsed.message.content.every(
            c => c.type === 'tool_use' || c.type === 'tool_result'
        );
        
        // Stream tool_use blocks as activity BEFORE filtering
        parsed.message.content.forEach(block => {
            if (block.type === 'tool_use') {
                window.handleToolActivityStream(pName, {
                    type: 'tool_use',
                    name: block.name,
                    input: block.input || {}
                });
            }
        });
        
        if (hasOnlyToolUse) return;
    }

    // DEBUG: Log all events to help diagnose issues
    console.log(`[Agent:${pName}] Event type="${parsed.type}" subtype="${parsed.subtype || ''}"`, parsed);

    // helper to remove temporary status pills and processing indicators
    const clearStatusPills = () => {
        const countBefore = t.chatMessages.length;
        t.chatMessages = t.chatMessages.filter(m => {
            // Remove system pills and processing gap indicators
            if (m.role === 'system' && (m.content === 'Thinking...' || m.content === 'Processing...')) return false;
            if (m.isProcessingGap) return false;
            return true;
        });
        
        // Clear gap timer when clearing pills
        if (t.gapTimer) {
            clearTimeout(t.gapTimer);
            delete t.gapTimer;
        }
        
        return t.chatMessages.length !== countBefore;
    };

    let lastMsg = t.chatMessages[t.chatMessages.length - 1];
    
    // 1. Handle Assistant Messages (Text & Thinking Fragments)
    if (parsed.type === "assistant" && parsed.message && parsed.message.content) {
        // Clear "Thinking..." status pills before processing real assistant content
        // to ensure message indices stay consistent for interactive elements.
        clearStatusPills();
        
        const content = parsed.message.content;
        const textBlock = content.find(c => c.type === "text");
        const thinkingBlock = content.find(c => c.type === "thinking");

        // Sync Robot Thinking Animation
        const robot = state.walkingRobots[pName];
        if (robot) {
            if (thinkingBlock) {
                robot.isThinking = true;
                robot.hasUpdate = false; // Clear any stale done state
            }
            else if (textBlock) {
                robot.isThinking = false;
            }
            renderRobots();
            
            // Update send button state (with safety check)
            if (t && typeof t.updateSendButton === 'function') {
                try {
                    t.updateSendButton();
                } catch (err) {
                    console.warn(`Failed to update send button for ${pName}:`, err);
                }
            }
        }

        // Store thinking content as a collapsible pill
        if (thinkingBlock && thinkingBlock.thinking) {
            // Hide processing indicators since we got thinking content
            window.hideProcessingIndicator(pName);
            
            // Accumulate thinking into the last thinking pill or create a new one
            const lastThinking = t.chatMessages[t.chatMessages.length - 1];
            if (lastThinking && lastThinking.role === 'thinking') {
                lastThinking.content += thinkingBlock.thinking;
            } else {
                t.chatMessages.push({ 
                    role: 'thinking', 
                    content: thinkingBlock.thinking,
                    collapsed: true  // collapsed by default
                });
            }
            renderChatMessages(pName);
        }

        if (textBlock && textBlock.text) {
            lastMsg = t.chatMessages[t.chatMessages.length - 1]; // Re-evaluate pointer
            
            const textFragment = textBlock.text;
            if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isDone) {
                t.chatMessages.push({ role: 'assistant', content: textFragment });
            } else {
                lastMsg.content += textFragment;
            }
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);
            
            // Hide any existing processing indicators since we got new content
            window.hideProcessingIndicator(pName);
            
            // Start monitoring for potential gaps after this response
            window.monitorResponseGaps(pName);
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
            
            // Clear any remaining processing indicators
            window.hideProcessingIndicator(pName);
            
            // Clear activity stream when response is complete
            setTimeout(() => {
                window.clearActivityStream(pName);
            }, 2000); // Keep activity visible for 2 seconds before clearing
            
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
                
                // Update send button state
                if (t && typeof t.updateSendButton === 'function') {
                    try {
                        t.updateSendButton();
                    } catch (err) {
                        console.warn(`Failed to update send button for ${pName}:`, err);
                    }
                }
            }
            saveChatHistory(pName, t.chatMessages);
            
            // Allow a small delay before rendering to ensure DOM updates properly
            setTimeout(() => renderChatMessages(pName), 50);
            return;
        }
        else if (parsed.subtype === "error") {
            clearStatusPills();
            const errMsg = parsed.error?.message || parsed.message || "Unknown error";
            t.chatMessages.push({ role: 'system', content: `Error: ${errMsg}`, isError: true });
            saveChatHistory(pName, t.chatMessages);
            renderChatMessages(pName);

            const project = state.projects.find(p => p.name === pName);
            showToast('error', '⚠️', `${project?.nickname || pName}: ${errMsg.substring(0, 80)}`);

            const robot = state.walkingRobots[pName];
            if (robot) { 
                robot.isThinking = false; 
                robot.hasError = true; 
                renderRobots(); 
                fireAgentNotification(pName, project?.nickname, `❌ ${errMsg.substring(0, 60)}`);
                
                // Update send button state
                if (t && typeof t.updateSendButton === 'function') {
                    try {
                        t.updateSendButton();
                    } catch (err) {
                        console.warn(`Failed to update send button for ${pName}:`, err);
                    }
                }
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
            
            // Extract tool details from call events
            const toolName = parsed.tool_name || parsed.name || parsed.tool || '';
            const toolInput = parsed.input || parsed.arguments || parsed.tool_input || {};
            
            if (toolName) {
                window.handleToolActivityStream(pName, {
                    type: 'tool_use',
                    name: toolName,
                    input: toolInput
                });
            } else if (parsed.message) {
                // Fallback: use message as activity description
                window.addActivityStreamMessage(pName, `🔧 ${parsed.message}`, 'tool_start');
            }
        }
        else if (parsed.type === "result") {
            text = "Task completed";
            
            // Stream tool result as activity
            if (parsed.subtype !== 'success' && parsed.subtype !== 'error') {
                window.handleToolActivityStream(pName, {
                    type: 'tool_result',
                    content: parsed.content || parsed.message || '',
                    error: parsed.error
                });
            }
        }
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
    if (flatText && typeof flatText === 'string' && 
        !parsed.type?.includes('thinking') &&
        !flatText.trim().startsWith('{') &&  // ignore raw JSON strings
        !flatText.trim().startsWith('[')) {   // ignore raw JSON arrays
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
    if (catchAll && typeof catchAll === 'string' && 
        !parsed.type?.includes('thinking') &&
        !catchAll.trim().startsWith('{') && 
        !catchAll.trim().startsWith('[')) {
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
