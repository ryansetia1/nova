/* ============================================
   NOVA — Terminal Management
   ============================================ */

import { state, dom } from './state.js';
import { showToast, bringToFront, getAppearanceHtml, renderRobots } from './ui.js';
import { openDeleteAgentModal, openEmojiUpdateModal, getModelsForService } from './modals.js';

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
    try { t.panel.remove(); } catch(e) {}
    delete state.terminals[pName];
}

function refit(t) {
    if (!t || !t.fitAddon || !t.term) return;
    try {
        t.fitAddon.fit();
        if (t.ws && t.ws.readyState === WebSocket.OPEN) {
            t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
        }
        t.term.refresh(0, t.term.rows - 1);
    } catch (e) {}
}

export function setupTerminal(pName, showUI = false) {
    const existing = state.terminals[pName];
    if (existing && existing.term) {
        if (showUI) {
            existing.panel.classList.remove('hidden');
            bringToFront(existing.panel);
            // Multiple attempts to fit during/after transition
            refit(existing);
            setTimeout(() => refit(existing), 50);
            setTimeout(() => {
                refit(existing);
                existing.term.focus();
            }, 300);
        }
        return;
    }
    
    let t = state.terminals[pName];

    if (!t) {
        const clone = dom.terminalTemplate.content.cloneNode(true);
        const panel = clone.querySelector('.terminal-panel');
        panel.dataset.project = pName;
        const offset = Math.floor(Math.random() * 40) - 20; 
        panel.style.top = `${100 + offset}px`;
        panel.style.left = `calc(50% - 425px + ${offset}px)`;

        const container = panel.querySelector('.terminal-container');
        
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
        
        // Auto-fit on dynamic resize using ResizeObserver
        const ro = new ResizeObserver(() => {
            if (!panel.classList.contains('hidden')) {
                refit(t);
            }
        });
        ro.observe(container);

        bindWindowEvents(pName, panel, t);

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('drag-over');
        });
        
        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.relatedTarget && container.contains(e.relatedTarget)) return;
            container.classList.remove('drag-over');
        });
        
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            if (!files.length) return;

            // Text file extensions
            const TEXT_EXTENSIONS = new Set([
              'txt','md','json','jsonl','csv','js','jsx','ts','tsx','py','rb',
              'go','rs','java','cpp','c','h','css','html','xml','yaml','yml',
              'toml','env','sh','bash','zsh','sql','graphql','vue','svelte','log'
            ]);

            const isTextFile = (filename) => {
              const ext = filename.split('.').pop().toLowerCase();
              return TEXT_EXTENSIONS.has(ext);
            };

            showToast('info', '⏳', `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);

            // Process all files in parallel
            const results = await Promise.all(files.map(file => {
              return new Promise((resolve) => {
                const reader = new FileReader();
                
                if (isTextFile(file.name)) {
                  // Read as text for text files
                  reader.onload = async (event) => {
                    const textContent = event.target.result;
                    try {
                      const res = await fetch(
                        `/api/projects/${encodeURIComponent(pName)}/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          filename: file.name, 
                          filedata: '', // not needed for text
                          isText: true,
                          textContent: textContent
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        resolve({ 
                          type: 'text', 
                          filename: file.name, 
                          textContent: textContent,
                          success: true 
                        });
                      } else {
                        resolve({ success: false, filename: file.name });
                      }
                    } catch {
                      resolve({ success: false, filename: file.name });
                    }
                  };
                  reader.readAsText(file);
                } else {
                  // Read as base64 for binary files
                  reader.onload = async (event) => {
                    const base64Data = event.target.result;
                    try {
                      const res = await fetch(
                        `/api/projects/${encodeURIComponent(pName)}/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          filename: file.name, 
                          filedata: base64Data,
                          isText: false
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        resolve({ 
                          type: 'binary', 
                          filename: file.name, 
                          absolutePath: data.absolutePath,
                          success: true 
                        });
                      } else {
                        resolve({ success: false, filename: file.name });
                      }
                    } catch {
                      resolve({ success: false, filename: file.name });
                    }
                  };
                  reader.readAsDataURL(file);
                }
              });
            }));

            // Separate successes and failures
            const succeeded = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            if (failed.length > 0) {
              failed.forEach(f => showToast('error', '❌', `Failed: ${f.filename}`));
            }

            if (!succeeded.length) return;

            // Build terminal input string
            // Text files: inject as inline content blocks
            // Binary files: inject as space-separated quoted absolute paths
            
            const textFiles = succeeded.filter(r => r.type === 'text');
            const binaryFiles = succeeded.filter(r => r.type === 'binary');

            let terminalInput = '';

            // Text file content injected as readable blocks
            if (textFiles.length > 0) {
              terminalInput += textFiles.map(f => 
                `\n[File: ${f.filename}]\n${f.textContent}\n[End of ${f.filename}]`
              ).join('\n');
            }

            // Binary file paths as space-separated quoted strings
            if (binaryFiles.length > 0) {
              if (terminalInput) terminalInput += '\n';
              terminalInput += binaryFiles.map(f => `"${f.absolutePath}"`).join(' ') + ' ';
            }

            // Send to terminal
            if (ws.readyState === WebSocket.OPEN && terminalInput) {
              ws.send(JSON.stringify({ type: 'input', data: terminalInput }));
              term.focus();
            }

            // Success toast
            const textCount = textFiles.length;
            const binaryCount = binaryFiles.length;
            const parts = [];
            if (textCount) parts.push(`${textCount} text file${textCount > 1 ? 's' : ''} injected`);
            if (binaryCount) parts.push(`${binaryCount} binary file${binaryCount > 1 ? 's' : ''} saved`);
            showToast('success', '✅', parts.join(', '));
        });

        ws.onopen = () => { setTimeout(() => { if (ws.readyState === WebSocket.OPEN) { refit(t); t.ready = true; renderRobots(); } }, 1000); };
        ws.onmessage = (e) => { 
            try { 
                const msg = JSON.parse(e.data); 
                if (msg.type === 'output') {
                    term.write(msg.data); 
                    const robot = state.walkingRobots[pName];
                    if (robot) {
                        const raw = msg.data;
                        const cleanText = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                        const isThinkingPattern = /✽|✢|✥|thinking/i.test(raw) || /[a-z]*ing\.\.\./i.test(cleanText) || /\.\.\.\s*\(\d+/i.test(cleanText);
                        const isRateLimit = /rate_limit_error|429/i.test(cleanText);

                        if (isRateLimit) {
                            robot.hasError = true;
                            robot.isThinking = false;
                            if (t.thinkingTimer) clearTimeout(t.thinkingTimer);
                            renderRobots();
                        } else if (isThinkingPattern) {
                            robot.hasError = false; 
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
                                const m = state.projects.find(x => x.nickname === pName || x.name === pName);
                                showToast('success', '✅', `${m ? m.nickname : pName} has finished thinking.`);
                                robot.hasUpdate = true;
                                renderRobots();
                            }
                            robot.isThinking = false;
                            if (robot.hasError) {
                                robot.hasError = false;
                                renderRobots();
                            }
                        }
                    }
                }
            } catch (err) {} 
        };
        term.onData(d => { 
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data: d })); 
                const robot = state.walkingRobots[pName];
                if (robot && robot.hasError) {
                    robot.hasError = false;
                    renderRobots();
                }
            }
        });
    }

    if (showUI) {
        t.panel.classList.remove('hidden');
        bringToFront(t.panel);
        renderRobots(); 
        
        // Initial fit attempts
        refit(t);
        setTimeout(() => { 
            refit(t);
            setTimeout(() => {
                t.term.scrollToBottom(); 
                t.term.focus(); 
            }, 50);
        }, 350);
    }
}

function bindWindowEvents(pName, panel, tState) {
    const closeDot = panel.querySelector('.terminal-close-dot');
    const maxDot = panel.querySelector('.terminal-maximize-dot');
    const menuBtn = panel.querySelector('.terminal-menu-btn');
    const dropdown = panel.querySelector('.terminal-dropdown');
    const deleteBtn = panel.querySelector('.terminal-delete-btn');
    const header = panel.querySelector('.terminal-header');

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

    const headerEmoji = panel.querySelector('.terminal-header-emoji');
    if (headerEmoji) {
        headerEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            openEmojiUpdateModal(pName);
        });
    }

    const modelBadge = panel.querySelector('.terminal-project-badge');
    if (modelBadge) {
        modelBadge.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // Remove any existing dropdowns
            document.querySelectorAll('.terminal-model-dropdown').forEach(d => d.remove());
            
            const project = state.projects.find(p => p.name === pName);
            if (!project) return;
            
            const dropdown = document.createElement('div');
            dropdown.className = 'terminal-model-dropdown';
            dropdown.innerHTML = '<div style="padding: 8px; font-size: 11px; color: var(--text-muted);">Switch Model...</div>';
            
            modelBadge.appendChild(dropdown);
            
            const models = await getModelsForService(project.service || 'ollama');
            dropdown.innerHTML = '';
            
            models.forEach(m => {
                const item = document.createElement('button');
                item.className = `model-item ${m === project.model ? 'active' : ''}`;
                item.textContent = m;
                item.addEventListener('click', async (evt) => {
                    evt.stopPropagation();
                    dropdown.remove();
                    
                    if (m === project.model) return;
                    
                    showToast('info', '🔄', `Switching to ${m}...`);
                    
                    try {
                        const res = await fetch('/api/update-emoji', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: pName, model: m })
                        });
                        
                        if (res.ok) {
                            project.model = m;
                            modelBadge.childNodes[0].textContent = m; // Update text node before dropdown
                            
                            // Send command to terminal
                            if (tState.ws && tState.ws.readyState === WebSocket.OPEN) {
                                tState.ws.send(JSON.stringify({ 
                                    type: 'input', 
                                    data: `/model ${m}\r` 
                                }));
                            }
                            showToast('success', '🤖', `Model changed to ${m}`);
                        }
                    } catch (err) {
                        showToast('error', '❌', 'Failed to update model');
                    }
                });
                dropdown.appendChild(item);
            });
            
            // Prevent dropdown from closing when clicking inside
            dropdown.addEventListener('click', (evt) => evt.stopPropagation());
            
            // Close on outside click
            const closeDropdown = () => {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            };
            setTimeout(() => document.addEventListener('click', closeDropdown), 10);
        });
    }

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
        const t = state.terminals[panel.dataset.project];
        if (t) refit(t);
    }

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
