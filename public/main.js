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
    getAppearanceHtml
} from './ui.js';
import { 
    loadWalkablePath, 
    loadAnchorConfig, 
    startWalkingLoop, 
    bindHoverListeners, 
    initAnchorAdjuster 
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
    openDeleteAgentModal,
    openEmojiUpdateModal,
    closeEmojiUpdateModal,
    handleEmojiUpdate,
    setupAppearanceToggles,
    initServiceSelector
} from './modals.js';
import { 
    setupTerminal, 
    openTerminal, 
    hideTerminal 
} from './terminal.js';

// ---- Initialization ----
async function init() {
    createParticles();
    startClock();
    
    await preloadAllAssets();
    
    await loadWalkablePath(); 
    await loadAnchorConfig(); 
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
    
    setTimeout(() => {
        if (dom.loader) dom.loader.classList.add('hidden');
    }, 500);
}

async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        state.projects = await res.json();
        renderRobots();
        state.projects.forEach(project => setupTerminal(project.name, false));
    } catch (err) {}
}

function bindEvents() {
    dom.spawnBtn.addEventListener('click', openModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', handleSpawn);
    dom.deleteCancelBtn.addEventListener('click', closeDeleteAgentModal);
    
    if (dom.spawnCharacterSelect) {
        dom.spawnCharacterSelect.onchange = () => {
            if (state.spawnAppearanceType === 'character') {
                const preview = document.getElementById('selected-emoji-preview');
                if (preview) preview.innerHTML = getAppearanceHtml('SPRITE:' + dom.spawnCharacterSelect.value);
            }
        };
    }

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
                        dom.emojiPreview.textContent = p.emoji;
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
            const visiblePanels = Object.values(state.terminals).map(t => t.panel).filter(p => p && !p.classList.contains('hidden'));
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

    if (dom.emojiUpdateModal) {
        dom.emojiUpdateModal.addEventListener('click', (e) => { 
            if (e.target === dom.emojiUpdateModal) closeEmojiUpdateModal(); 
        });
    }
}

// Global exposure for inline HTML handlers
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
