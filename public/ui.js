/* ============================================
   NOVA — UI Helpers & Rendering
   ============================================ */

import { state, dom, CHARACTERS } from './state.js';
import { openTerminal } from './terminal.js';

export function getAppearanceHtml(appearance, className = "") {
    if (appearance && appearance.startsWith('SPRITE:')) {
        const charName = appearance.split(':')[1];
        return `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" class="avatar-icon ${className} char-icon-${charName}" alt="${charName}" onerror="this.style.display='none'">`;
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
      // Ensure office rescale after sidebar animation finishes
      setTimeout(() => {
          if (window.rescaleOffice) window.rescaleOffice();
      }, 350);
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
      // Reorder agents so children follow parents
      const roots = activeAgents.filter(p => !p.parentAgent);
      const sortedAgents = [];
      roots.forEach(root => {
        sortedAgents.push(root);
        const children = activeAgents.filter(p => p.parentAgent === root.name);
        sortedAgents.push(...children);
      });
      
      // If there are agents with parents that weren't found in roots (shouldn't happen, but for safety)
      activeAgents.forEach(p => {
          if (!sortedAgents.includes(p)) sortedAgents.push(p);
      });

      dom.activeAgentList.innerHTML = sortedAgents.map(p => {
        const isNested = !!p.parentAgent;
        const prefix = isNested ? '<span class="nested-indicator">↳ </span>' : '';
        
        const r = state.walkingRobots[p.name];
        let statusChip = '';
        if (r) {
          if (r.hasError) statusChip = '<span class="sidebar-status-chip error">Error</span>';
          else if (r.isThinking) statusChip = '<span class="sidebar-status-chip thinking">Thinking</span>';
          else if (r.hasUpdate) statusChip = '<span class="sidebar-status-chip done">Done</span>';
        }

        const dismissBtn = (p.type === 'pet' || !p.active) ? 
          `<span class="sidebar-item-dismiss" title="Dismiss" onclick="event.stopPropagation(); window.nova.handleDeleteAgentByName('${p.name}', false)">✕</span>` : '';

        return `
        <div class="sidebar-item ${isNested ? 'nested' : ''}" data-name="${p.name}" onclick="window.focusAgentTerminal('${p.name}')">
          <div class="sidebar-item-icon">${getAppearanceHtml(p.emoji)}</div>
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${prefix}${p.nickname || p.name}${statusChip}</div>
            <div class="sidebar-item-sub">${p.name}</div>
          </div>
          ${dismissBtn}
        </div>
      `;}).join('');
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
        
        if (!p.active) {
            return '';
        }

        let spriteHtml = '';
        if (isSprite) {
            const charId = rawAppearance.split(':')[1];
            const charFrames = (state.characterFrames[charId] || state.characterFrames['Char1']);
            const frames = (r?.isHovered || r?.naturalIdleTimer > 0 || isVisible ? charFrames.idle : charFrames.walk);
            const frameIndex = r?.frame || 0;
            const safeFrameIdx = frameIndex % frames.length;
            
            spriteHtml = `
                <div class="robot-sprite-container char-${charId}">
                    <img class="robot-char-sprite" src="${frames[safeFrameIdx]}" alt="Agent">
                </div>
            `;
        } else {
            spriteHtml = `
                <div class="robot-card-emoji-container">
                    ${getAppearanceHtml(rawAppearance, 'robot-card-emoji')}
                </div>
            `;
        }

        const isNested = !!p.parentAgent;
        const topLabel = (isNested ? '↳ ' : '') + (p.nickname || p.name);

        const charId = isSprite ? rawAppearance.split(':')[1] : 'emoji';

        const isPet = p.type === 'pet';
        const clickHandler = isPet ? '' : `onclick="window.nova.openTerminal('${p.name}')"`;

        return `
            <div class="robot-avatar ${isVisible ? 'active' : ''} ${!isReady && !isPet ? 'initializing' : ''} ${r?.isThinking ? 'thinking' : ''} ${r?.hasUpdate ? 'has-update' : ''} ${r?.hasError ? 'has-error' : ''} ${isPet ? 'is-pet' : ''} char-parent-${charId}" 
                 data-project="${p.name}" style="${posStyle}"
                 ${clickHandler}>
                <div class="robot-label top">${topLabel}</div>
                <div class="robot-thought-bubble">${r?.hasError ? '⚠️' : '💭'}</div>
                <div class="robot-check-badge"></div>
                ${spriteHtml}
                <div class="robot-card-status">${isPet ? '' : (isReady ? '<span class="dot ready"></span>Ready' : 'Warming up...')}</div>
                <div class="robot-anchor-dot ${isIllegal ? 'illegal' : ''}"></div>
            </div>`;
    }).join('');
    
    renderSidebar();
}

export function renderForegroundObjects() {
    const container = document.getElementById('foreground-objects');
    if (!container) return;

    // Check current theme
    const isNight = document.body.classList.contains('theme-night');
    const suffix = isNight ? '_night' : '_day';
    
    container.innerHTML = state.foregroundObjects.map((obj, i) => {
        const isLinked = state.breakPositions.some(p => p.objectId === obj.id);
        const transform = `translate(-50%, -50%) rotate(${obj.rotation || 0}deg) scale(${obj.scale || 1})`;
        const zIndex = obj.layer === 'front' ? '20005' : '50';
        
        return `
            <div class="workspace-object ${isLinked ? 'linked' : ''}" 
                 data-index="${i}" 
                 data-id="${obj.id}"
                 style="left: ${obj.x}%; top: ${obj.y}%; transform: ${transform}; z-index: ${zIndex};"
                 onclick="window.handleObjectClick('${obj.id}', event)">
                <div class="layout-delete-btn" onclick="window.removeObject('${obj.id}', event)">❌</div>
                <img src="assets/office/${isNight ? 'night' : 'day'}/objects/${obj.asset}${suffix}.png" alt="${obj.asset}" draggable="false">
            </div>
        `;
    }).join('');
}

window.removeObject = (objectId, event) => {
    event.stopPropagation();
    const index = state.foregroundObjects.findIndex(obj => obj.id === objectId);
    if (index !== -1) {
        state.foregroundObjects.splice(index, 1);
        const panel = document.querySelector('#dev-layout-config');
        if (panel) panel.classList.add('hidden');
        renderForegroundObjects();
    }
};

window.handleObjectClick = async (objectId, event) => {
    // If in dev mode, don't trigger actions
    const devModule = await import('./devtool.js');
    if (devModule?.dev?.isActive) return;

    const pos = state.breakPositions.find(p => p.objectId === objectId);
    if (!pos) return;

    // Trigger position action
    let targetAgent = pos.assignee === 'All Agents' ? state.projects.find(p => p.active)?.name : pos.assignee;
    
    if (targetAgent && window.nova && window.nova.moveToPosition) {
        window.nova.moveToPosition(targetAgent, pos.id);
    }
};

export function initThemeControl() {
    const themeBtn = document.getElementById('toggle-theme-btn');
    if (!themeBtn) return;

    // Extendable modes: 'auto' follows time, others are fixed classes
    const modes = ['auto', 'day', 'night']; 
    let currentMode = localStorage.getItem('nova_theme_mode') || 'auto';

    const applyTheme = () => {
        const now = new Date();
        const hour = now.getHours();
        const isNightTime = hour >= 18 || hour < 6;
        
        // Remove all possible theme classes first to be scalable
        document.body.classList.remove('theme-night');
        // If you add theme-sunset, theme-matrix, etc., remove them here too
        
        let targetTheme = '';
        if (currentMode === 'auto') {
            targetTheme = isNightTime ? 'theme-night' : '';
        } else if (currentMode === 'night') {
            targetTheme = 'theme-night';
        } else if (currentMode === 'day') {
            targetTheme = ''; 
        }

        if (targetTheme) {
            document.body.classList.add(targetTheme);
        }

        const label = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
        themeBtn.textContent = `Theme: ${label}`;

        // Ensure objects are in sync
        updateThemeAssets();
    };

    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = modes.indexOf(currentMode);
        currentMode = modes[(idx + 1) % modes.length];
        localStorage.setItem('nova_theme_mode', currentMode);
        applyTheme();
        updateThemeAssets();
        showToast('info', '🌗', `Theme set to ${currentMode.toUpperCase()}`);
    });

    applyTheme();
    setInterval(applyTheme, 30000); // Check auto-theme every 30s
}

export function updateThemeAssets() {
    renderForegroundObjects();
    // Also update any other theme-specific assets if needed
}

export async function preloadAllAssets() {
    // 1. Fetch available animations map
    let animationMap = { 'Char1': ['Walk', 'Idle'], 'Char2': ['Walk', 'Idle'] };
    try {
        const res = await fetch('/api/character-animations');
        animationMap = await res.json();
    } catch (e) {}

    // 2. Identify characters
    const charIds = Object.keys(CHARACTERS);

    // 3. Populate state.characterFrames
    for (const id of charIds) {
        state.characterFrames[id] = {};
        const animMap = animationMap[id] || { 'Walk': 42, 'Idle': 80 };
        for (const [anim, count] of Object.entries(animMap)) {
            const pathFn = (CHARACTERS[id][anim.toLowerCase()]?.path) || 
                          ((i) => `assets/characters/${id}/${anim}/frame_${(i + 1).toString().padStart(3, '0')}.png`);
            
            state.characterFrames[id][anim.toLowerCase()] = Array.from({ length: count }, (_, i) => pathFn(i));
        }
    }

    const assets = [
        'assets/office/day/office_bg_day.png',
        'assets/office/day/office_fg_day.png',
        'assets/office/night/office_bg_night.png',
        'assets/office/night/office_fg_night.png',
        'assets/office/night/office_fx_night.png',
        ...Object.values(state.characterFrames).flatMap(charAnims => 
            Object.values(charAnims).flat()
        )
    ];

    let loaded = 0;
    const total = assets.length;

    // Use a smaller subset for "blocking" preloader to avoid waiting 1000s of frames if some are missing
    const criticalAssets = assets.slice(0, 50); 

    const promises = assets.map((src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loaded++;
                const percent = (loaded / total) * 100;
                if (dom.loaderProgress) dom.loaderProgress.style.width = percent + '%';
                resolve();
            };
            img.onerror = () => {
                loaded++; 
                resolve();
            };
        });
    });

    // Don't wait for ALL, just wait for critical or a timeout
    await Promise.race([
        Promise.all(promises.slice(0, 100)), // Wait for first 100
        new Promise(resolve => setTimeout(resolve, 3000))
    ]);
}

import { CONFIG } from './config.js';

let isYouTubePlaying = false;
let currentPlaylistIndex = 0;

export function initYouTubePlayer() {
    if (!dom.youtubeLoadBtn || !dom.youtubeUrlInput || !dom.youtubePlayer) return;

    const popover = document.getElementById('music-popover');
    const musicContainer = document.querySelector('.header-music-container');
    const volumeSlider = document.getElementById('music-volume-slider');
    const nextBtn = document.getElementById('music-next-btn');
    const prevBtn = document.getElementById('music-prev-btn');

    const playlist = JSON.parse(localStorage.getItem('nova_playlist')) || CONFIG.YOUTUBE_PLAYLIST;

    function sendCommand(func, args = '') {
        if (dom.youtubePlayer && dom.youtubePlayer.contentWindow) {
            // YouTube API expects 'args' to be an array for many commands like setVolume
            const formattedArgs = Array.isArray(args) ? args : [args];
            dom.youtubePlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: func,
                args: formattedArgs
            }), '*');
        }
    }

    const loadVideo = (videoId, autoplay = true) => {
        dom.youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1${autoplay ? '&autoplay=1' : ''}`;
        isYouTubePlaying = autoplay;
        if (dom.headerPlayBtn) {
            const icon = dom.headerPlayBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', isYouTubePlaying ? 'pause' : 'music');
                if (window.lucide) window.lucide.createIcons();
            }
            dom.headerPlayBtn.classList.toggle('playing', isYouTubePlaying);
        }
        // Initialize volume after a short delay to let iframe load
        if (autoplay) {
            setTimeout(() => sendCommand('setVolume', Number(volumeSlider.value)), 2000);
        }
    };

    // Set initial random video from playlist
    if (playlist && playlist.length > 0) {
        currentPlaylistIndex = Math.floor(Math.random() * playlist.length);
        loadVideo(playlist[currentPlaylistIndex], false);
        // Set default volume
        setTimeout(() => sendCommand('setVolume', 50), 3000);
    }

    const togglePlay = () => {
        isYouTubePlaying = !isYouTubePlaying;
        sendCommand(isYouTubePlaying ? 'playVideo' : 'pauseVideo');

        if (dom.headerPlayBtn) {
            const icon = dom.headerPlayBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', isYouTubePlaying ? 'pause' : 'music');
                if (window.lucide) window.lucide.createIcons();
            }
            dom.headerPlayBtn.classList.toggle('playing', isYouTubePlaying);
        }
    };

    if (dom.headerPlayBtn) {
        dom.headerPlayBtn.addEventListener('click', togglePlay);
    }

    if (window.lucide) window.lucide.createIcons();

    // Next/Prev logic
    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentPlaylistIndex = (currentPlaylistIndex + 1) % playlist.length;
        loadVideo(playlist[currentPlaylistIndex]);
    });

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentPlaylistIndex = (currentPlaylistIndex - 1 + playlist.length) % playlist.length;
        loadVideo(playlist[currentPlaylistIndex]);
    });

    // Volume logic
    volumeSlider.addEventListener('input', () => {
        sendCommand('setVolume', Number(volumeSlider.value));
    });

    // Hover logic
    let hoverTimeout;
    musicContainer.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        popover.classList.remove('hidden');
    });

    musicContainer.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
            popover.classList.add('hidden');
        }, 500);
    });

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
            loadVideo(videoId);
            showToast('info', '🎵', 'Loading YouTube video...');
        } else {
            showToast('error', '⚠️', 'Invalid YouTube URL or ID');
        }
    });

    dom.youtubeUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') dom.youtubeLoadBtn.click();
    });
}

export function fireAgentNotification(pName, nickname) {
    // Check feature support
    if (!('Notification' in window)) return;
    
    // Only fire if user is NOT looking at NOVA tab
    if (!document.hidden) return;
    
    // Check if notifications are enabled in settings
    if (localStorage.getItem('nova_notifications_enabled') === 'false') return;
    
    // Check permission
    if (Notification.permission !== 'granted') return;

    const displayName = nickname || pName;

    const notification = new Notification('🪐 NOVA — Agent Ready', {
        body: `${displayName} has finished working`,
        tag: `nova-agent-${pName}`,  // prevents duplicate notifs for same agent
        renotify: false               // don't re-notify if same tag already shown
    });

    notification.onclick = () => {
        // Focus the NOVA browser tab
        window.focus();
        // Open the agent's terminal
        if (window.nova && window.nova.openTerminal) {
            window.nova.openTerminal(pName);
        } else {
            openTerminal(pName);
        }
        notification.close();
    };

    // Auto-close after 8 seconds if user doesn't interact
    setTimeout(() => notification.close(), 8000);
}

export function initNotificationSettings() {
    const notifBtn = document.getElementById('toggle-notifications-btn');
    if (!notifBtn) return;

    // Set initial label from localStorage
    const isEnabled = localStorage.getItem('nova_notifications_enabled') !== 'false';
    notifBtn.textContent = `Agent Notifications: ${isEnabled ? 'ON' : 'OFF'}`;

    notifBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentlyEnabled = localStorage.getItem('nova_notifications_enabled') !== 'false';
        
        if (!currentlyEnabled) {
            // Turning ON — re-request permission if needed
            if (!('Notification' in window)) {
                showToast('error', '❌', 'Your browser does not support notifications');
                return;
            }
            
            if (Notification.permission === 'denied') {
                showToast('error', '🔔', 'Notifications blocked — enable in browser settings');
                return;
            }
            
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    showToast('info', '🔔', 'Notification permission denied');
                    return;
                }
            }
            
            localStorage.setItem('nova_notifications_enabled', 'true');
            notifBtn.textContent = 'Agent Notifications: ON';
            showToast('success', '🔔', 'Agent notifications enabled');
        } else {
            // Turning OFF
            localStorage.setItem('nova_notifications_enabled', 'false');
            notifBtn.textContent = 'Agent Notifications: OFF';
            showToast('info', '🔔', 'Agent notifications disabled');
        }
    });
}

export function initDefaultFolderSettings() {
  const setBtn = document.getElementById('set-default-folder-btn');
  const clearBtn = document.getElementById('clear-default-folder-btn');
  const display = document.getElementById('default-folder-display');

  const updateDisplay = () => {
    const saved = localStorage.getItem('nova_default_folder');
    if (display) {
      display.textContent = saved
        ? saved.split('/').pop()
        : 'Not set';
      display.title = saved || '';
    }
  };

  updateDisplay();

  if (setBtn) {
    setBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.electronAPI || !window.electronAPI.selectFolder) {
        showToast('info', '📁', 'Only available in desktop app');
        return;
      }
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        localStorage.setItem('nova_default_folder', folderPath);
        updateDisplay();
        showToast('success', '📁', 
          `Default folder: ${folderPath.split('/').pop()}`);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem('nova_default_folder');
      updateDisplay();
      showToast('info', '📁', 'Default folder cleared');
    });
  }
}

export function initMusicManager() {
    const modal = document.getElementById('music-modal');
    const openBtn = document.getElementById('manage-music-btn');
    const closeBtn = document.getElementById('music-close-btn');
    const saveBtn = document.getElementById('music-save-btn');
    const addBtn = document.getElementById('music-add-btn');
    const urlInput = document.getElementById('music-url-input');
    const listContainer = document.getElementById('music-list');
    const previewThumb = document.getElementById('music-preview-thumb');

    let tempPlaylist = [...(JSON.parse(localStorage.getItem('nova_playlist')) || CONFIG.YOUTUBE_PLAYLIST)];

    const extractVideoId = (input) => {
        let videoId = '';
        if (input.includes('youtube.com/watch?v=')) {
            videoId = input.split('v=')[1].split('&')[0];
        } else if (input.includes('youtu.be/')) {
            videoId = input.split('youtu.be/')[1].split('?')[0];
        } else if (input.includes('youtube.com/embed/')) {
            videoId = input.split('embed/')[1].split('?')[0];
        } else {
            videoId = input.trim();
        }
        return videoId.length === 11 ? videoId : null;
    };

    const renderList = () => {
        listContainer.innerHTML = tempPlaylist.map((id, index) => `
            <div class="music-item">
                <div class="music-item-thumb" style="background-image: url('https://img.youtube.com/vi/${id}/mqdefault.jpg')"></div>
                <div class="music-item-info">
                    <div class="music-item-id">${id}</div>
                </div>
                <div class="music-item-remove" onclick="window.removeMusicItem(${index})" title="Remove">
                    <i data-lucide="trash-2"></i>
                </div>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    };

    window.removeMusicItem = (index) => {
        tempPlaylist.splice(index, 1);
        renderList();
    };

    if (!openBtn) return;

    openBtn.addEventListener('click', () => {
        tempPlaylist = [...(JSON.parse(localStorage.getItem('nova_playlist')) || CONFIG.YOUTUBE_PLAYLIST)];
        renderList();
        modal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    urlInput.addEventListener('input', () => {
        const id = extractVideoId(urlInput.value);
        if (id) {
            previewThumb.style.backgroundImage = `url('https://img.youtube.com/vi/${id}/mqdefault.jpg')`;
            previewThumb.innerHTML = '';
        } else {
            previewThumb.style.backgroundImage = 'none';
            previewThumb.innerHTML = '<span>PREVIEW</span>';
        }
    });

    addBtn.addEventListener('click', () => {
        const id = extractVideoId(urlInput.value);
        if (id) {
            if (!tempPlaylist.includes(id)) {
                tempPlaylist.push(id);
                renderList();
                urlInput.value = '';
                previewThumb.style.backgroundImage = 'none';
                previewThumb.innerHTML = '<span>PREVIEW</span>';
                showToast('success', '🎵', 'Added to playlist');
            } else {
                showToast('info', '⚠️', 'Already in playlist');
            }
        } else {
            showToast('error', '⚠️', 'Invalid YouTube URL or ID');
        }
    });

    saveBtn.addEventListener('click', () => {
        localStorage.setItem('nova_playlist', JSON.stringify(tempPlaylist));
        showToast('success', '💾', 'Playlist saved! Refresh to apply.');
        modal.classList.add('hidden');
    });
}

export function initSystemStatus() {
    const container = document.querySelector('.status-indicator-container');
    const popover = document.getElementById('status-popover');
    const restartBtn = document.getElementById('restart-app-btn');

    if (!container || !popover || !restartBtn) return;

    let hoverTimeout;
    container.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        popover.classList.remove('hidden');
    });

    container.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
            popover.classList.add('hidden');
        }, 500);
    });

    restartBtn.addEventListener('click', () => {
        window.location.reload();
    });

    if (window.lucide) window.lucide.createIcons();
}
