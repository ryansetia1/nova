/* ============================================
   NOVA — Entry Point (main.js)
   ============================================ */

import { state, dom } from './state.js';
import { 
    createParticles, 
    startClock, 
    initSidebar, 
    initYouTubePlayer, 
    initThemeControl, 
    preloadAllAssets, 
    renderRobots,
    renderForegroundObjects,
    renderAmbientObjects,
    showToast,
    bringToFront,
    getAppearanceHtml,
    initNotificationSettings,
    initDefaultFolderSettings,
    initMusicManager,
    initSystemStatus,
    showTooltip,
    hideTooltip,
    initWeatherControl,
    toggleAgentVisibility,
    toggleSidebarSection
} from './ui.js';
import { 
    loadWalkablePath, 
    loadAnchorConfig, 
    loadCharacterConfig,
    startWalkingLoop, 
    bindHoverListeners, 
    loadActions,
    loadForegroundObjects,
    loadAmbientObjects,
    moveToPosition,
    WALKABLE_PATH
} from './walking.js';
import { 
    initDevTool 
} from './devtool.js';
import { 
    initEmojiPopover, 
    openModal, 
    closeModal, 
    handleSpawn, 
    closeDeleteAgentModal, 
    handleDeleteAgent,
    handleDeleteAgentByName,
    openDeleteAgentModal,
    openDeleteAgentModalByName,
    openEmojiUpdateModal,
    closeEmojiUpdateModal,
    handleEmojiUpdate,
    setupAppearanceToggles,
    initServiceSelector,
    initClaudeMdModal,
    initSwitchServiceModal,
    initFolderPicker
} from './modals.js';
import { 
    setupTerminal, 
    openTerminal, 
    hideTerminal,
    updateDockedLayout
} from './terminal.js';
import { 
    initScheduler,
    shutdownScheduler
} from './scheduler.js';
import { 
    initScheduleUI
} from './schedule-ui.js';

// ---- Workspace System ----

async function loadWorkspaces() {
    try {
        const res = await fetch('/api/workspaces');
        state.workspaces = await res.json();
    } catch (err) { state.workspaces = []; }
}

function applyWorkspaceBackground(wsMeta) {
    const wrapper = document.getElementById('floor-wrapper');
    if (!wrapper || !wsMeta) return;
    const bg = wsMeta.background || {};
    const fg = wsMeta.foreground || {};
    const fx = wsMeta.fx || {};
    wrapper.style.setProperty('--ws-bg-day', bg.day ? `url('${bg.day}')` : '');
    wrapper.style.setProperty('--ws-bg-night', bg.night ? `url('${bg.night}')` : '');
    wrapper.style.setProperty('--ws-fg-day', fg.day ? `url('${fg.day}')` : '');
    wrapper.style.setProperty('--ws-fg-night', fg.night ? `url('${fg.night}')` : '');
    wrapper.style.setProperty('--ws-fx-night', fx.night ? `url('${fx.night}')` : '');
}

function updateWorkspaceUI(wsMeta) {
    const title = document.getElementById('room-title');
    const subtitle = document.getElementById('room-subtitle');
    if (title) title.textContent = `${wsMeta.icon || ''} ${wsMeta.name || ''}`;
    if (subtitle) subtitle.textContent = wsMeta.subtitle || '';

    const idx = state.workspaces.findIndex(w => w.id === state.activeWorkspace);
    const prevBtn = document.getElementById('workspace-prev');
    const nextBtn = document.getElementById('workspace-next');
    if (prevBtn) prevBtn.classList.toggle('disabled', idx <= 0);
    if (nextBtn) nextBtn.classList.toggle('disabled', idx >= state.workspaces.length - 1);
}

function showWorkspaceTransition(wsMeta) {
    const overlay = document.getElementById('workspace-transition');
    if (!overlay) return;
    overlay.querySelector('.workspace-transition-icon').textContent = wsMeta.icon || '🪐';
    overlay.querySelector('.workspace-transition-name').textContent = wsMeta.name || '';
    overlay.querySelector('.workspace-transition-subtitle').textContent = wsMeta.subtitle || '';
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('active'));
}

function hideWorkspaceTransition() {
    const overlay = document.getElementById('workspace-transition');
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 400);
}

function clearCurrentScene() {
    Object.keys(state.walkingRobots).forEach(name => {
        const el = document.querySelector(`.walking-robot[data-name="${name}"]`);
        if (el) el.remove();
    });
    state.walkingRobots = {};

    Object.keys(state.terminals).forEach(pName => {
        const t = state.terminals[pName];
        if (t && t.panel) {
            t.panel.classList.add('hidden');
            if (t.panel.classList.contains('docked-right')) {
                t.panel.classList.remove('docked-right');
            }
        }
        if (t.chatWs) try { t.chatWs.close(); } catch(e) {}
        if (t.termWs) try { t.termWs.close(); } catch(e) {}
    });
    state.terminals = {};
    import('./terminal.js').then(m => m.updateDockedLayout());

    const fgContainer = document.getElementById('foreground-objects');
    if (fgContainer) fgContainer.innerHTML = '';
    const ambContainer = document.getElementById('ambient-objects');
    if (ambContainer) ambContainer.innerHTML = '';

    const robotCards = document.getElementById('robot-cards');
    if (robotCards) robotCards.innerHTML = '';

    state.projects = [];
    state.actions = [];
    state.foregroundObjects = [];
    state.ambientObjects = [];
    state.characterConfig = {};
    state.characterAnchors = { Char1: { x: 50, y: 85 }, Char2: { x: 50, y: 85 } };
    state.originalCharacterAnchors = { Char1: { x: 50, y: 85 }, Char2: { x: 50, y: 85 } };
    WALKABLE_PATH.length = 0;

    shutdownScheduler();
    state.schedules = [];
}

async function loadWorkspaceData(workspaceId) {
    const wsParam = `workspace=${encodeURIComponent(workspaceId)}`;

    const [wpRes, anchorRes, ccRes, actRes, fgRes, ambRes, schedRes, agentsRes, wsMetaRes] = await Promise.all([
        fetch(`/api/walkable-path?${wsParam}`).then(r => r.json()).catch(() => []),
        fetch(`/api/anchor?${wsParam}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/character-config?${wsParam}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/actions?${wsParam}`).then(r => r.json()).catch(() => []),
        fetch(`/api/foreground-objects?${wsParam}`).then(r => r.json()).catch(() => []),
        fetch(`/api/ambient-objects?${wsParam}`).then(r => r.json()).catch(() => []),
        fetch(`/api/schedules?${wsParam}`).then(r => r.json()).catch(() => []),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents`).then(r => r.json()).catch(() => []),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`).then(r => r.json()).catch(() => ({}))
    ]);

    if (Array.isArray(wpRes) && wpRes.length >= 3) {
        WALKABLE_PATH.length = 0;
        WALKABLE_PATH.push(...wpRes);
    }

    Object.keys(anchorRes).forEach(charId => {
        state.characterAnchors[charId] = anchorRes[charId];
        state.originalCharacterAnchors[charId] = { ...anchorRes[charId] };
    });

    Object.keys(ccRes).forEach(charId => {
        state.characterConfig[charId] = ccRes[charId];
    });

    state.actions = Array.isArray(actRes) ? actRes : [];
    state.foregroundObjects = Array.isArray(fgRes) ? fgRes : [];
    state.ambientObjects = Array.isArray(ambRes) ? ambRes : [];
    state.schedules = Array.isArray(schedRes) ? schedRes : [];
    state.projects = agentsRes;
    state.workspaceMeta = wsMetaRes;

    return wsMetaRes;
}

function applyWorkspaceScene() {
    renderForegroundObjects();
    renderAmbientObjects();
    renderRobots();

    state.projects.forEach(project => {
        if (project.active !== false) setupTerminal(project.name, false);
    });
    import('./terminal.js').then(m => m.updateDockedLayout());

    try { import('./devtool.js').then(m => { if (m.renderActivePath) m.renderActivePath(); }); } catch(e) {}

    initScheduler();
}

async function switchWorkspace(direction) {
    if (state.switchingWorkspace) return;
    const idx = state.workspaces.findIndex(w => w.id === state.activeWorkspace);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.workspaces.length) return;

    state.switchingWorkspace = true;
    const targetWs = state.workspaces[newIdx];

    showWorkspaceTransition(targetWs);
    await new Promise(r => setTimeout(r, 450));

    clearCurrentScene();

    state.activeWorkspace = targetWs.id;
    localStorage.setItem('nova_active_workspace', targetWs.id);

    const wsMeta = await loadWorkspaceData(targetWs.id);
    applyWorkspaceBackground(wsMeta);
    updateWorkspaceUI(wsMeta);
    applyWorkspaceScene();

    await new Promise(r => setTimeout(r, 300));
    hideWorkspaceTransition();

    state.switchingWorkspace = false;
}

window.switchWorkspace = switchWorkspace;

function bindWorkspaceNav() {
    const prevBtn = document.getElementById('workspace-prev');
    const nextBtn = document.getElementById('workspace-next');
    if (prevBtn) prevBtn.addEventListener('click', () => switchWorkspace(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => switchWorkspace(1));
}

// ---- Deploy Existing Agent ----

let deploySelected = new Set();

async function openDeployModal() {
    const modal = document.getElementById('deploy-agent-modal');
    const listEl = document.getElementById('deploy-agent-list');
    if (!modal || !listEl) return;

    deploySelected.clear();

    let allProjects = [];
    try {
        const res = await fetch('/api/projects');
        allProjects = await res.json();
    } catch (e) { return; }

    const currentNames = new Set(state.projects.map(p => p.name));
    const available = allProjects.filter(p => p.active !== false && !currentNames.has(p.name));

    if (available.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: 32px 16px; color: var(--text-secondary);">All agents are already in this workspace.</div>';
        document.getElementById('deploy-confirm-btn').disabled = true;
    } else {
        document.getElementById('deploy-confirm-btn').disabled = false;
        listEl.innerHTML = available.map(p => {
            const appearance = p.emoji || '🪐';
            let avatarHtml;
            if (appearance.startsWith('SPRITE:')) {
                const charName = appearance.split(':')[1];
                avatarHtml = `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" alt="${charName}">`;
            } else {
                avatarHtml = appearance;
            }
            const typeLabel = p.type === 'captain' ? 'Captain' : p.type === 'pet' ? 'Pet' : 'Agent';
            return `<div class="deploy-agent-item" data-name="${p.name}">
                <div class="deploy-agent-avatar">${avatarHtml}</div>
                <div class="deploy-agent-info">
                    <div class="deploy-agent-name">${p.nickname || p.name}</div>
                    <div class="deploy-agent-sub">${typeLabel} · ${p.name}</div>
                </div>
                <div class="deploy-agent-check"></div>
            </div>`;
        }).join('');

        listEl.querySelectorAll('.deploy-agent-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                if (deploySelected.has(name)) {
                    deploySelected.delete(name);
                    item.classList.remove('selected');
                } else {
                    deploySelected.add(name);
                    item.classList.add('selected');
                }
            });
        });
    }

    modal.classList.remove('hidden');
}

async function confirmDeploy() {
    if (deploySelected.size === 0) return;

    const newNames = [...deploySelected];
    const currentNames = state.projects.map(p => p.name);
    const allNames = [...currentNames, ...newNames];

    await fetch(`/api/workspaces/${encodeURIComponent(state.activeWorkspace)}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: allNames })
    });

    const res = await fetch(`/api/workspaces/${encodeURIComponent(state.activeWorkspace)}/agents`);
    state.projects = await res.json();

    renderRobots();
    state.projects.forEach(p => {
        if (newNames.includes(p.name) && p.active !== false) {
            setupTerminal(p.name, false);
        }
    });
    import('./terminal.js').then(m => m.updateDockedLayout());

    document.getElementById('deploy-agent-modal').classList.add('hidden');
    showToast('success', '📦', `Deployed ${newNames.length} agent(s) to this workspace`);
    deploySelected.clear();
}

function closeDeployModal() {
    document.getElementById('deploy-agent-modal')?.classList.add('hidden');
    deploySelected.clear();
}

function bindDeployAgent() {
    const deployBtn = document.getElementById('spawn-menu-deploy');
    if (deployBtn) {
        deployBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('spawn-menu')?.classList.add('hidden');
            openDeployModal();
        });
    }
    document.getElementById('deploy-cancel-btn')?.addEventListener('click', closeDeployModal);
    document.getElementById('deploy-confirm-btn')?.addEventListener('click', confirmDeploy);
}

window.openDeployModal = openDeployModal;

// ---- Initialization ----
async function init() {
    startClock();
    
    await preloadAllAssets();
    
    await loadWorkspaces();
    const wsMeta = await loadWorkspaceData(state.activeWorkspace);
    applyWorkspaceBackground(wsMeta);
    updateWorkspaceUI(wsMeta);

    initSidebar();
    initYouTubePlayer(); 
    applyWorkspaceScene();
    bindEvents();
    bindWorkspaceNav();
    bindDeployAgent();
    
    initScheduleUI();
    
    window.addEventListener('beforeunload', () => {
        shutdownScheduler();
    });
    
    startWalkingLoop();
    bindHoverListeners();
    initDevTool(); 
    initEmojiPopover();
    initThemeControl();
    initServiceSelector();
    initClaudeMdModal();
    initSwitchServiceModal();
    initNotificationSettings();
    initDefaultFolderSettings();
    initMusicManager();
    initSystemStatus();
    initWeatherControl();
    initFolderPicker();
    
    setTimeout(() => {
        if (dom.loader) dom.loader.classList.add('hidden');
    }, 500);

    // Request notification permission on first load
    if ('Notification' in window && Notification.permission === 'default') {
        // Delay slightly to not interrupt initial page load
        setTimeout(() => {
            Notification.requestPermission();
        }, 3000);
    }

    // After 3.5 second delay, update button label if permission was denied
    setTimeout(() => {
        const notifBtn = document.getElementById('toggle-notifications-btn');
        if (!notifBtn) return;
        
        if (!('Notification' in window)) {
            notifBtn.textContent = 'Notifications: Not Supported';
            notifBtn.disabled = true;
            notifBtn.style.opacity = '0.4';
        } else if (Notification.permission === 'denied') {
            notifBtn.textContent = 'Notifications: Blocked';
            notifBtn.disabled = true;
            notifBtn.style.opacity = '0.4';
            notifBtn.title = 'Enable notifications in your browser settings';
        }
    }, 3500);

    // Electron Fullscreen Padding Fix (macOS)
    const updateHeaderPadding = () => {
        // Now handled by CSS classes (is-fullscreen)
    };

    // Fullscreen Hover Detection (For macOS Menu Bar Reveal)
    window.addEventListener('mousemove', (e) => {
        if (!document.body.classList.contains('is-fullscreen')) return;
        const header = document.getElementById('header');
        if (header) {
            // If mouse is in top 80px, reveal padding to clear traffic lights
            if (e.clientY < 80) {
                header.classList.add('reveal-padding');
            } else {
                header.classList.remove('reveal-padding');
            }
        }
    });

    window.addEventListener('resize', updateHeaderPadding);
    updateHeaderPadding();

    // Responsive Office Scaling
    const rescaleOffice = () => {
        const wrapper = document.getElementById('floor-wrapper');
        if (!wrapper) return;

        const sidebar = document.querySelector('.sidebar');
        const sidebarWidth = (sidebar && !sidebar.classList.contains('collapsed')) ? 300 : 80;
        
        const availableWidth = window.innerWidth - sidebarWidth - 60;
        const availableHeight = window.innerHeight - 200; // Account for header and padding
        
        const targetSize = Math.min(availableWidth, availableHeight);
        let scale = (targetSize / 800) * 0.95; // Shrink by 5% as requested
        
        // Boundaries: 0.25x (~200px) to 1.5x (~1200px)
        scale = Math.max(0.25, Math.min(scale, 1.5));
        
        // Using zoom instead of transform because it recalculates layout space,
        wrapper.style.zoom = scale;
    };
    
    window.addEventListener('resize', rescaleOffice);
    rescaleOffice();
    
    // Store it globally if needed for sidebar toggle updates
    window.rescaleOffice = rescaleOffice;
}

async function loadProjects() {
    try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(state.activeWorkspace)}/agents`);
        state.projects = await res.json();
        renderRobots();
        
        state.projects.forEach(project => {
            setupTerminal(project.name, !!project.isOpen);
        });
        
        import('./terminal.js').then(m => m.updateDockedLayout());
    } catch (err) {}
}

window.loadProjects = loadProjects;

function bindEvents() {
    dom.spawnBtn.addEventListener('click', () => openModal('agent'));
    
    if (dom.spawnDropdownToggle) {
        dom.spawnDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.spawnMenu.classList.toggle('hidden');
            
            // Hide Captain only while an active captain exists (inactive/orphaned still allows Spawn Captain)
            const captainActive = state.projects.some(p =>
                (p.active === true || p.active === 'true') &&
                (p.type === 'captain' || p.name === 'Captain')
            );
            if (dom.spawnMenuCaptain) {
                dom.spawnMenuCaptain.classList.toggle('hidden', captainActive);
            }
        });
    }

    if (dom.spawnMenuItems) {
        dom.spawnMenuItems.forEach(item => {
            if (item.dataset.type === 'deploy') return;
            item.addEventListener('click', (e) => {
                const type = item.dataset.type;
                openModal(type);
                dom.spawnMenu.classList.add('hidden');
            });
        });
    }

    // Close menu when clicking elsewhere
    document.addEventListener('click', () => {
        if (dom.spawnMenu) dom.spawnMenu.classList.add('hidden');
        if (dom.settingsMenu) dom.settingsMenu.classList.add('hidden');
    });

    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', handleSpawn);
    dom.deleteCancelBtn.addEventListener('click', closeDeleteAgentModal);
    


    if (dom.orphanedSelect) {
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
                    dom.modalInput.disabled = true; 
                    dom.nicknameInput.value = p.nickname || p.name;
                    dom.customPathInput.value = p.customPath || '';
                    if (p.emoji) {
                        state.selectedEmoji = p.emoji;
                        dom.emojiPreview.innerHTML = getAppearanceHtml(p.emoji);
                    }
                }
            }
            updateFolderHint();
        });
    }

    const updateFolderHint = () => {
        if (!dom.folderHint) return;
        const name = dom.modalInput.value || '[Name]';
        const parent = dom.nestParentSelect ? dom.nestParentSelect.value : '';
        if (parent) {
            dom.folderHint.innerHTML = `Folder: <code>./projects/${parent}/${name}</code>`;
        } else {
            dom.folderHint.innerHTML = `Folder: <code>./projects/${name}</code>`;
        }
    };

    if (dom.modalInput) dom.modalInput.addEventListener('input', updateFolderHint);
    if (dom.nestParentSelect) dom.nestParentSelect.addEventListener('change', updateFolderHint);

    if (dom.deleteAgentOnlyBtn) dom.deleteAgentOnlyBtn.addEventListener('click', () => handleDeleteAgent(false));
    if (dom.deleteConfirmBtn) dom.deleteConfirmBtn.addEventListener('click', () => handleDeleteAgent(true));

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

    setupAppearanceToggles(dom.spawnTypeToggle, 'spawnAppearanceType');
    setupAppearanceToggles(dom.updateTypeToggle, 'updateAppearanceType');

    if (dom.emojiUpdateSaveBtn) {
        dom.emojiUpdateSaveBtn.addEventListener('click', () => {
             let finalAppearance = state.updateSelectedEmoji || '🪐';
             if (state.updateAppearanceType === 'character') {
                 finalAppearance = 'SPRITE:' + (state.updateSelectedCharacter || 'Char1');
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
    
    if (dom.emojiPreview) {
        dom.emojiPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.emojiPopover.classList.toggle('hidden');
        });
    }

    if (dom.updateEmojiPreview) {
        dom.updateEmojiPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.updateEmojiArea.classList.toggle('hidden');
        });
    }

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
        if (m) {
            m.addEventListener('click', (e) => { if (e.target === m) { closeModal(); closeDeleteAgentModal(); } });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(); closeDeleteAgentModal();
            if (dom.emojiPopover) dom.emojiPopover.classList.add('hidden');
            const visiblePanels = Object.values(state.terminals).map(t => t.panel).filter(p => p && !p.classList.contains('hidden') && !p.classList.contains('docked-right'));
            if (visiblePanels.length > 0) {
                const topPanel = visiblePanels.reduce((prev, curr) => (parseInt(curr.style.zIndex || 0) > parseInt(prev.style.zIndex || 0) ? curr : prev));
                hideTerminal(topPanel.dataset.project);
            }
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (state.draggingWindow) return; 
        const isClickingSafeUI = e.target.closest('.terminal-panel') || 
                                e.target.closest('.robot-avatar') || 
                                e.target.closest('.modal-overlay') || 
                                e.target.closest('.settings-container') ||
                                e.target.closest('.sidebar') ||
                                e.target.closest('.spawn-btn');
                                
        if (!isClickingSafeUI) {
            Object.keys(state.terminals).forEach(pName => {
                const t = state.terminals[pName];
                if (t && t.panel && !t.panel.classList.contains('hidden')) {
                    if (t.panel.classList.contains('docked-right')) return;
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
        updateDockedLayout();
    });

    if (dom.emojiUpdateModal) {
        dom.emojiUpdateModal.addEventListener('click', (e) => { 
            if (e.target === dom.emojiUpdateModal) closeEmojiUpdateModal(); 
        });
    }
}

// Global exposure for inline HTML handlers
window.nova = { 
    openTerminal,
    moveToPosition,
    handleDeleteAgentByName,
    setHover: (name, isActive) => {
        if (state.walkingRobots[name]) {
            if (state.walkingRobots[name].isHovered !== isActive) {
                state.walkingRobots[name].isHovered = isActive;
                state.walkingRobots[name].frame = 0;
            }
        }
        const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(name) : name;
        const card = dom.robotCards?.querySelector(`.robot-avatar[data-project="${esc}"]`);
        if (card) card.classList.toggle('is-hovered', !!isActive);
    },
    spawnAtOrphaned(pName) {
        const p = state.projects.find(x => x.active === false && x.name === pName);
        if (p) {
            openModal();
            dom.modalInput.value = p.name;
            dom.nicknameInput.value = p.nickname || p.name;
        }
    },
    openDeleteAgentModalByName,
    toggleAgentVisibility,
    toggleSidebarSection,
    showTooltip,
    hideTooltip
};

window.focusAgentTerminal = (name) => {
    const term = state.terminals[name];
    if (term && term.panel) {
        term.panel.classList.remove('hidden');
        bringToFront(term.panel);
        term.panel.classList.add('highlight-glow');
        setTimeout(() => term.panel.classList.remove('highlight-glow'), 2000);
    }
};

window.resumeOrphanedFolder = (name) => {
    openModal();
    setTimeout(() => {
        if (dom.orphanedSelect) {
            dom.orphanedSelect.value = name;
            dom.orphanedSelect.dispatchEvent(new Event('change'));
        }
    }, 150);
};

document.addEventListener('DOMContentLoaded', init);
