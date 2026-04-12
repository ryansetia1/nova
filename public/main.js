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
    showToast,
    bringToFront,
    getAppearanceHtml,
    initNotificationSettings,
    initDefaultFolderSettings,
    initMusicManager,
    initSystemStatus,
    showTooltip,
    hideTooltip
} from './ui.js';
import { 
    loadWalkablePath, 
    loadAnchorConfig, 
    startWalkingLoop, 
    bindHoverListeners, 
    initAnchorAdjuster,
    loadBreakPositions,
    loadForegroundObjects,
    loadAmbientObjects,
    moveToPosition
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

// ---- Initialization ----
async function init() {
    createParticles();
    startClock();
    
    await preloadAllAssets();
    
    await loadWalkablePath(); 
    await loadAnchorConfig(); 
    await loadBreakPositions();
    await loadForegroundObjects();
    await loadAmbientObjects();
    initSidebar();
    // initYouTubePlayer calls were in init in original app.js
    // I will check if initYouTubePlayer was there. Yes it was.
    // Wait, the original code had initYouTubePlayer(). Let me check.
    // Line 130: initYouTubePlayer();
    initYouTubePlayer(); 
    loadProjects();
    bindEvents();
    startWalkingLoop();
    bindHoverListeners();
    initDevTool(); 
    initEmojiPopover();
    initAnchorAdjuster();
    initThemeControl();
    initServiceSelector();
    initClaudeMdModal();
    initSwitchServiceModal();
    initNotificationSettings();
    initDefaultFolderSettings();
    initMusicManager();
    initSystemStatus();
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
        const res = await fetch('/api/projects');
        state.projects = await res.json();
        renderRobots();
        
        state.projects.forEach(project => {
            // Restore visibility (setupTerminal reads isDocked from meta natively)
            setupTerminal(project.name, !!project.isOpen);
        });
        
        // Finalize layout
        import('./terminal.js').then(m => m.updateDockedLayout());
    } catch (err) {}
}

function bindEvents() {
    dom.spawnBtn.addEventListener('click', () => openModal('agent'));
    
    if (dom.spawnDropdownToggle) {
        dom.spawnDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.spawnMenu.classList.toggle('hidden');
            
            // Constraint: Hide Captain if already exists
            const captainExists = state.projects.some(p => p.type === 'captain' || p.name === 'Captain');
            if (dom.spawnMenuCaptain) {
                dom.spawnMenuCaptain.classList.toggle('hidden', captainExists);
            }
        });
    }

    if (dom.spawnMenuItems) {
        dom.spawnMenuItems.forEach(item => {
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
    },
    spawnAtOrphaned(pName) {
        const p = state.projects.find(x => x.active === false && x.name === pName);
        if (p) {
            openModal();
            dom.modalInput.value = p.name;
            dom.nicknameInput.value = p.nickname || p.name;
        }
    },
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
