/* ============================================
   NOVA — UI Helpers & Rendering
   ============================================ */

import { state, dom } from './state.js';

export function getAppearanceHtml(appearance, className = "") {
    if (appearance && appearance.startsWith('SPRITE:')) {
        const charName = appearance.split(':')[1];
        return `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" class="avatar-icon ${className}" alt="${charName}" onerror="this.style.display='none'">`;
    }
    return `<span class="${className}">${appearance || '🪐'}</span>`;
}

export function createParticles() {
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

export function startClock() {
    function update() { dom.clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false }); }
    update(); setInterval(update, 1000);
}

export function showToast(type, icon, msg) {
    const t = document.createElement('div'); t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    dom.toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 4000);
}

export function bringToFront(panel) {
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

export function initSidebar() {
    if (!dom.sidebarToggle) return;
    dom.sidebarToggle.addEventListener('click', () => {
      dom.sidebar.classList.toggle('collapsed');
    });
}

export function renderSidebar() {
    const activeAgents = state.projects.filter(p => p.active === true || p.active === "true");
    const orphanedFolders = state.projects.filter(p => p.active === false || p.active === "false" || !p.active);

    // Update Counts
    if (dom.activeCount) dom.activeCount.innerText = activeAgents.length;
    if (dom.orphanedCount) dom.orphanedCount.innerText = orphanedFolders.length;

    // Render Active Agents
    if (dom.activeAgentList) {
      dom.activeAgentList.innerHTML = activeAgents.map(p => `
        <div class="sidebar-item" data-name="${p.name}" onclick="window.focusAgentTerminal('${p.name}')">
          <div class="sidebar-item-icon">${getAppearanceHtml(p.emoji)}</div>
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${p.nickname || p.name}</div>
            <div class="sidebar-item-sub">${p.name}</div>
          </div>
        </div>
      `).join('');
    }

    // Render Orphaned Folders
    if (dom.orphanedFolderList) {
      dom.orphanedFolderList.innerHTML = orphanedFolders.map(p => `
        <div class="sidebar-item orphaned-item" data-name="${p.name}" onclick="window.resumeOrphanedFolder('${p.name}')">
          <div class="sidebar-item-icon">📂</div>
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${p.nickname || p.name}</div>
            <div class="sidebar-item-sub">Orphaned Project</div>
          </div>
        </div>
      `).join('');
    }
}

export function renderRobots() {
    if (state.projects.length === 0) { dom.emptyState.classList.remove('hidden'); dom.robotCards.innerHTML = ''; return; }
    dom.emptyState.classList.add('hidden');
    const fallbackEmojis = ['🪐', '🦾', '🧠', '⚙️', '🔧', '🛠️', '💡', '🎯'];
    dom.robotCards.innerHTML = state.projects.map((p, i) => {
        const rawAppearance = p.emoji || fallbackEmojis[i % fallbackEmojis.length];
        const isSprite = rawAppearance.startsWith('SPRITE:');
        
        const t = state.terminals[p.name];
        const isReady = t && t.ready;
        const isVisible = t && t.panel && !t.panel.classList.contains('hidden');
        const r = state.walkingRobots[p.name];
        const posStyle = r ? `left: ${r.x}%; top: ${r.y}%; z-index: ${Math.floor(r.y * 100)};` : '';
        const isIllegal = r?.isIllegal;
        
        const topLabel = p.nickname || p.name;

        if (!p.active) {
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
            <div class="robot-avatar ${isVisible ? 'active' : ''} ${!isReady ? 'initializing' : ''} ${r?.isThinking ? 'thinking' : ''} ${r?.hasUpdate ? 'has-update' : ''} ${r?.hasError ? 'has-error' : ''}" 
                 data-project="${p.name}" style="${posStyle}"
                 onclick="window.nova.openTerminal('${p.name}')">
                <div class="robot-label top">${topLabel}</div>
                <div class="robot-thought-bubble">${r?.hasError ? '⚠️' : '💭'}</div>
                <div class="robot-check-badge"></div>
                ${spriteHtml}
                <div class="robot-card-status">${isReady ? '<span class="dot ready"></span>Ready' : 'Warming up...'}</div>
                <div class="robot-anchor-dot ${isIllegal ? 'illegal' : ''}"></div>
            </div>`;
    }).join('');
    
    renderSidebar();
}

export function initThemeControl() {
    const updateTheme = () => {
        const now = new Date();
        const hour = now.getHours();
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
    setInterval(updateTheme, 30000);
}

export async function preloadAllAssets() {
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

    const promises = assets.map((src) => {
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

    await Promise.race([
        Promise.all(promises),
        new Promise(resolve => setTimeout(resolve, 4000))
    ]);
}

let isYouTubePlaying = false;
export function initYouTubePlayer() {
    if (!dom.youtubeLoadBtn || !dom.youtubeUrlInput || !dom.youtubePlayer) return;

    function sendCommand(func, args = '') {
        if (dom.youtubePlayer && dom.youtubePlayer.contentWindow) {
            dom.youtubePlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: func,
                args: args
            }), '*');
        }
    }

    const togglePlay = () => {
        isYouTubePlaying = !isYouTubePlaying;
        sendCommand(isYouTubePlaying ? 'playVideo' : 'pauseVideo');

        if (dom.headerPlayBtn) {
            dom.headerPlayBtn.textContent = isYouTubePlaying ? '⏸️' : '🎵';
            dom.headerPlayBtn.classList.toggle('playing', isYouTubePlaying);
        }
    };

    if (dom.headerPlayBtn) {
        dom.headerPlayBtn.addEventListener('click', togglePlay);
    }

    dom.youtubeLoadBtn.addEventListener('click', () => {
        let input = dom.youtubeUrlInput.value.trim();
        if (!input) return;

        let videoId = '';
        if (input.includes('youtube.com/watch?v=')) {
            videoId = input.split('v=')[1].split('&')[0];
        } else if (input.includes('youtu.be/')) {
            videoId = input.split('youtu.be/')[1].split('?')[0];
        } else if (input.includes('youtube.com/embed/')) {
            videoId = input.split('embed/')[1].split('?')[0];
        } else {
            videoId = input;
        }

        if (videoId) {
            dom.youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1`;
            isYouTubePlaying = true;
            if (dom.headerPlayBtn) {
                dom.headerPlayBtn.textContent = '⏸️';
                dom.headerPlayBtn.classList.add('playing');
            }
            showToast('info', '🎵', 'Loading YouTube video...');
        } else {
            showToast('error', '⚠️', 'Invalid YouTube URL or ID');
        }
    });

    dom.youtubeUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') dom.youtubeLoadBtn.click();
    });
}
