/* ============================================
   NOVA — Modals & Dialogs
   ============================================ */

import { state, dom } from './state.js';
import { showToast, renderRobots, getAppearanceHtml } from './ui.js';
import { setupTerminal, disposeTerminal } from './terminal.js';

export async function openModal() {
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
    
    if (dom.spawnTypeToggle) {
        const btns = dom.spawnTypeToggle.querySelectorAll('.type-btn');
        btns.forEach(b => b.classList.toggle('active', b.dataset.type === 'emoji'));
        dom.spawnEmojiZone.classList.remove('hidden');
        dom.spawnCharacterArea.classList.add('hidden');
    }
    
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

export function closeModal() { dom.modal.classList.add('hidden'); }

export function openEmojiUpdateModal(pName) {
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

export function closeEmojiUpdateModal() {
    dom.emojiUpdateModal.classList.add('hidden');
    state.projectForEmojiUpdate = null;
}

export async function handleEmojiUpdate(emoji) {
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
        
        const project = state.projects.find(p => p.name === pName);
        if (project) project.emoji = emoji;
        
        const t = state.terminals[pName];
        if (t && t.panel) {
            const emojiEl = t.panel.querySelector('.terminal-header-emoji');
            if (emojiEl) emojiEl.innerHTML = getAppearanceHtml(emoji);
        }
        
        closeEmojiUpdateModal();
        renderRobots(); 
        showToast('success', '✨', 'Emoji updated!');
    } catch (err) {
        showToast('error', '❌', 'Failed to update emoji');
    }
}

export function openDeleteAgentModal(project) {
    if (project.customPath) {
        handleDeleteAgent(false); 
        return;
    }

    state.agentToDelete = project;
    dom.deleteAgentName.textContent = project.nickname || project.name;
    dom.deleteModal.classList.remove('hidden');
    const t = state.terminals[project.name];
    if (t && t.panel) {
        const d = t.panel.querySelector('.terminal-dropdown');
        if (d) d.classList.add('hidden');
    }
}

export function closeDeleteAgentModal() { dom.deleteModal.classList.add('hidden'); }

export async function handleSpawn() {
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

export async function handleDeleteAgent(deleteFiles = false) {
    const project = state.agentToDelete; if (!project) return;
    const pName = project.name;
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(project.name)}?deleteFiles=${deleteFiles}`, { method: 'DELETE' });
        const data = await res.json();
        
        disposeTerminal(pName);

        if (data.type === 'symlink' || deleteFiles) {
            state.projects = state.projects.filter(p => p.name !== project.name);
        } else if (data.type === 'orphaned') {
            const p = state.projects.find(x => x.name === project.name);
            if (p) p.active = false;
        }
        
        closeDeleteAgentModal();
        renderRobots();
        
        showToast('success', '🗑️', data.message || 'Agent removed');
    } catch (err) {
        showToast('error', '❌', 'Failed to remove agent');
    }
}

export function setupAppearanceToggles(toggleContainer, typeVarName, onTypeChange) {
    if (!toggleContainer) return;
    const btns = toggleContainer.querySelectorAll('.type-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            state[typeVarName] = type;
            btns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (onTypeChange) onTypeChange(type);
            
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

export function initEmojiPopover() {
    document.addEventListener('click', (e) => {
        if (dom.emojiPopover && !dom.emojiPopover.classList.contains('hidden')) {
            if (!dom.emojiPopover.contains(e.target) && !e.target.closest('.emoji-hint')) {
                dom.emojiPopover.classList.add('hidden');
            }
        }
    });
}
