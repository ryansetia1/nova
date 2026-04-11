/* ============================================
   NOVA — Modals & Dialogs
   ============================================ */

import { state, dom } from './state.js';
import { showToast, renderRobots, getAppearanceHtml } from './ui.js';
import { setupTerminal, disposeTerminal } from './terminal.js';

let selectedService = 'ollama';

export async function getModelsForService(service) {
  try {
    let models = [];
    if (service === 'ollama') {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error(`Ollama fetch failed: ${res.status}`);
      models = await res.json();
    } else if (service === 'claude') {
      const res = await fetch('/api/claude-models');
      if (!res.ok) throw new Error(`Claude fetch failed: ${res.status}`);
      models = await res.json();
    } else {
      // Sumo or Custom
      models = ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'];
    }
    return models;
  } catch (err) {
    console.error('getModelsForService error:', err);
    return [];
  }
}

async function loadModelsForService(service) {
  const select = dom.modelSelect;
  if (!select) return;
  select.innerHTML = '<option value="">Loading...</option>';
  
  try {
    const models = await getModelsForService(service);
    
    select.innerHTML = '';
    
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });
    
    // Add Custom option at the end
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Custom...';
    select.appendChild(customOpt);

    // Set default
    if (service === 'ollama') {
        select.value = models.includes('qwen3.5:cloud') ? 'qwen3.5:cloud' : (models[0] || '');
    } else {
        select.value = models[0] || '';
    }
    
  } catch(err) {
    select.innerHTML = '<option value="">Failed to load models</option>';
  }
}

export function initServiceSelector() {
    dom.serviceToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedService = btn.dataset.service;
      
      // Update active state
      dom.serviceToggleBtns.forEach(b => 
        b.classList.remove('active')
      );
      btn.classList.add('active');
      
      // Handle configuration fields visibility
      if (selectedService === 'sumo') {
        dom.serviceConfigFields.classList.remove('hidden');
        dom.apiKeyGroup.classList.remove('hidden');
        dom.baseUrlGroup.classList.add('hidden');
        
        // Auto-load saved API key for Sumo
        const savedKey = localStorage.getItem('nova_sumo_api_key');
        if (savedKey) dom.apiKeyInput.value = savedKey;
        else dom.apiKeyInput.value = '';
      } 
      else if (selectedService === 'custom') {
        dom.serviceConfigFields.classList.remove('hidden');
        dom.apiKeyGroup.classList.remove('hidden');
        dom.baseUrlGroup.classList.remove('hidden');
        
        // Auto-load saved API key for Custom
        const savedKey = localStorage.getItem('nova_custom_api_key');
        if (savedKey) dom.apiKeyInput.value = savedKey;
        else dom.apiKeyInput.value = '';
        
        // Auto-load saved Base URL for Custom
        const savedUrl = localStorage.getItem('nova_custom_base_url');
        if (savedUrl) dom.baseUrlInput.value = savedUrl;
        else dom.baseUrlInput.value = '';
      }
      else {
        dom.serviceConfigFields.classList.add('hidden');
      }

      // Reload model list for selected service
      loadModelsForService(selectedService);
    });
    });

    if (dom.modelSelect) {
        dom.modelSelect.addEventListener('change', () => {
            if (dom.modelSelect.value === '__custom__') {
              dom.customModelInput.classList.remove('hidden');
              dom.customModelInput.focus();
            } else {
              dom.customModelInput.classList.add('hidden');
              dom.customModelInput.value = '';
            }
        });
    }
}

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
    if (dom.spawnCharacterSelect) dom.spawnCharacterSelect.value = 'Char1';
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

    // Populate Parent Agent dropdown for nesting
    const activeAgents = state.projects.filter(p => p.active === true || p.active === "true");
    if (dom.nestParentSelect) {
        dom.nestParentSelect.innerHTML = '<option value="">— None (create standalone agent) —</option>' +
            activeAgents.map(p => {
                const displayName = p.nickname || p.name;
                return `<option value="${p.name}">${displayName} (${p.name})</option>`;
            }).join('');
        dom.nestParentSelect.value = '';
    }

    selectedService = 'ollama';
    dom.serviceToggleBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.service === 'ollama');
    });
    dom.customModelInput.classList.add('hidden');
    dom.customModelInput.value = '';
    
    // Reset service config fields
    dom.serviceConfigFields.classList.add('hidden');
    dom.apiKeyInput.value = '';
    dom.baseUrlInput.value = '';

    loadModelsForService('ollama');

    setTimeout(() => dom.modalInput.focus(), 100);
}

export function closeModal() { 
    dom.modal.classList.add('hidden'); 
    if (dom.nestParentSelect) dom.nestParentSelect.value = '';
}

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
    const parentAgent = dom.nestParentSelect ? dom.nestParentSelect.value || null : null;
    const rawModel = dom.modelSelect.value;
    const model = rawModel === '__custom__' 
      ? dom.customModelInput.value.trim() 
      : rawModel;

    let emoji = state.selectedEmoji || '🪐';
    if (state.spawnAppearanceType === 'character') {
         emoji = 'SPRITE:' + dom.spawnCharacterSelect.value;
    }
    const apiKey = dom.apiKeyInput.value.trim();
    const baseUrl = dom.baseUrlInput.value.trim();

    if (!name) return showToast('error', '❌', 'Name required');
    if (!model) return showToast('error', '❌', 'Please enter a model name');

    // Save secrets to localStorage for auto-loading next time
    if (selectedService === 'sumo' && apiKey) {
        localStorage.setItem('nova_sumo_api_key', apiKey);
    } else if (selectedService === 'custom') {
        if (apiKey) localStorage.setItem('nova_custom_api_key', apiKey);
        if (baseUrl) localStorage.setItem('nova_custom_base_url', baseUrl);
    }

    dom.modalConfirm.disabled = true;
    try {
        const res = await fetch('/api/projects', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                name, 
                nickname, 
                model, 
                service: selectedService,
                apiKey,
                baseUrl,
                customPath, 
                emoji, 
                parentAgent 
            }) 
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
            // Don't close if clicking the popover itself or the trigger previews
            const isClickInside = dom.emojiPopover.contains(e.target);
            const isClickOnTrigger = e.target.closest('#selected-emoji-preview') || e.target.closest('#update-emoji-preview');
            
            if (!isClickInside && !isClickOnTrigger && !e.target.closest('.emoji-hint')) {
                dom.emojiPopover.classList.add('hidden');
            }
        }
    });
}

export async function openClaudeMdModal(pName) {
  const modal = dom.claudeMdModal;
  const textarea = dom.claudeMdTextarea;
  const label = dom.claudeMdLabel;
  
  // Set project label
  const project = state.projects.find(p => p.name === pName);
  label.textContent = project ? (project.nickname || pName) : pName;
  
  // Load existing content
  textarea.value = '';
  
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(pName)}/claude-md`);
    const data = await res.json();
    if (data.exists && data.content) {
      textarea.value = data.content;
    }
  } catch (err) {
    // proceed with empty textarea
  }

  // Store current project name on modal for save handler
  modal.dataset.project = pName;
  
  // Show modal
  modal.classList.remove('hidden');
  setTimeout(() => textarea.focus(), 100);
}

export function initClaudeMdModal() {
  dom.claudeMdCancelBtn.addEventListener('click', () => {
    dom.claudeMdModal.classList.add('hidden');
  });

  dom.claudeMdSaveBtn.addEventListener('click', async () => {
    const modal = dom.claudeMdModal;
    const pName = modal.dataset.project;
    const content = dom.claudeMdTextarea.value;

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pName)}/claude-md`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();

      if (data.success) {
        modal.classList.add('hidden');
        showToast('success', '📋', 'CLAUDE.md saved — takes effect on next session');
        
        // Update button state to active/bright
        const t = state.terminals[pName];
        if (t && t.panel) {
          const btn = t.panel.querySelector('.terminal-claude-md-btn');
          if (btn) {
            btn.classList.remove('dim');
            btn.classList.add('active');
          }
        }
      } else {
        showToast('error', '❌', 'Failed to save CLAUDE.md');
      }
    } catch (err) {
      showToast('error', '❌', 'Failed to save CLAUDE.md');
    }
  });

  // Close on overlay click
  dom.claudeMdModal.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });
}

// ============================================
// Switch Service & Model Modal
// ============================================
let activeSwitchService = 'ollama';

async function loadModelsForSwitchService(service, defaultModel) {
    const select = dom.switchModelSelect;
    if (!select) return;
    select.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const models = await getModelsForService(service);
        select.innerHTML = '';
        
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            select.appendChild(opt);
        });
        
        // Add Custom option at the end
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Custom...';
        select.appendChild(customOpt);

        if (defaultModel && models.includes(defaultModel)) {
            select.value = defaultModel;
            dom.switchCustomModelInput.classList.add('hidden');
        } else if (defaultModel && !models.includes(defaultModel) && defaultModel !== '') {
            select.value = '__custom__';
            dom.switchCustomModelInput.classList.remove('hidden');
            dom.switchCustomModelInput.value = defaultModel;
        } else if (service === 'ollama') {
            select.value = models.includes('qwen3.5:cloud') ? 'qwen3.5:cloud' : (models[0] || '');
            dom.switchCustomModelInput.classList.add('hidden');
        } else {
            select.value = models[0] || '';
            dom.switchCustomModelInput.classList.add('hidden');
        }
    } catch(err) {
        select.innerHTML = '<option value="">Failed to load models</option>';
    }
}

export function openSwitchServiceModal(pName) {
    const project = state.projects.find(p => p.name === pName);
    if (!project) return;
    
    dom.switchServiceProjectName.textContent = project.nickname || project.name;
    dom.switchServiceModal.dataset.project = pName;
    
    activeSwitchService = project.service || 'ollama';
    
    dom.switchServiceToggleBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.service === activeSwitchService);
    });
    
    // Setup fields visibility
    if (activeSwitchService === 'sumo') {
        dom.switchServiceConfigFields.classList.remove('hidden');
        dom.switchApiKeyGroup.classList.remove('hidden');
        dom.switchBaseUrlGroup.classList.add('hidden');
        dom.switchApiKeyInput.value = project.apiKey || localStorage.getItem('nova_sumo_api_key') || '';
    } else if (activeSwitchService === 'custom') {
        dom.switchServiceConfigFields.classList.remove('hidden');
        dom.switchApiKeyGroup.classList.remove('hidden');
        dom.switchBaseUrlGroup.classList.remove('hidden');
        dom.switchApiKeyInput.value = project.apiKey || localStorage.getItem('nova_custom_api_key') || '';
        dom.switchBaseUrlInput.value = project.baseUrl || localStorage.getItem('nova_custom_base_url') || '';
    } else {
        dom.switchServiceConfigFields.classList.add('hidden');
        dom.switchApiKeyInput.value = '';
        dom.switchBaseUrlInput.value = '';
    }
    
    dom.switchCustomModelInput.classList.add('hidden');
    loadModelsForSwitchService(activeSwitchService, project.model);
    
    dom.switchServiceModal.classList.remove('hidden');
}

export function closeSwitchServiceModal() {
    dom.switchServiceModal.classList.add('hidden');
}

export function initSwitchServiceModal() {
    dom.switchServiceToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            activeSwitchService = btn.dataset.service;
            dom.switchServiceToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (activeSwitchService === 'sumo') {
                dom.switchServiceConfigFields.classList.remove('hidden');
                dom.switchApiKeyGroup.classList.remove('hidden');
                dom.switchBaseUrlGroup.classList.add('hidden');
                const savedKey = localStorage.getItem('nova_sumo_api_key');
                if (savedKey) dom.switchApiKeyInput.value = savedKey;
                else dom.switchApiKeyInput.value = '';
            } else if (activeSwitchService === 'custom') {
                dom.switchServiceConfigFields.classList.remove('hidden');
                dom.switchApiKeyGroup.classList.remove('hidden');
                dom.switchBaseUrlGroup.classList.remove('hidden');
                const savedKey = localStorage.getItem('nova_custom_api_key');
                if (savedKey) dom.switchApiKeyInput.value = savedKey;
                else dom.switchApiKeyInput.value = '';
                const savedUrl = localStorage.getItem('nova_custom_base_url');
                if (savedUrl) dom.switchBaseUrlInput.value = savedUrl;
                else dom.switchBaseUrlInput.value = '';
            } else {
                dom.switchServiceConfigFields.classList.add('hidden');
            }
            loadModelsForSwitchService(activeSwitchService);
        });
    });

    if (dom.switchModelSelect) {
        dom.switchModelSelect.addEventListener('change', () => {
            if (dom.switchModelSelect.value === '__custom__') {
                dom.switchCustomModelInput.classList.remove('hidden');
                dom.switchCustomModelInput.focus();
            } else {
                dom.switchCustomModelInput.classList.add('hidden');
                dom.switchCustomModelInput.value = '';
            }
        });
    }

    dom.switchServiceCancelBtn.addEventListener('click', closeSwitchServiceModal);

    dom.switchServiceSaveBtn.addEventListener('click', async () => {
        const pName = dom.switchServiceModal.dataset.project;
        const project = state.projects.find(p => p.name === pName);
        if (!project) return;
        
        const tState = state.terminals[pName];
        if (!tState) return;

        const rawModel = dom.switchModelSelect.value;
        const newModel = rawModel === '__custom__' ? dom.switchCustomModelInput.value.trim() : rawModel;
        const newApiKey = dom.switchApiKeyInput.value.trim();
        const newBaseUrl = dom.switchBaseUrlInput.value.trim();

        if (!newModel) return showToast('error', '❌', 'Please enter a model name');

        // Save secrets locally
        if (activeSwitchService === 'sumo' && newApiKey) {
            localStorage.setItem('nova_sumo_api_key', newApiKey);
        } else if (activeSwitchService === 'custom') {
            if (newApiKey) localStorage.setItem('nova_custom_api_key', newApiKey);
            if (newBaseUrl) localStorage.setItem('nova_custom_base_url', newBaseUrl);
        }

        dom.switchServiceSaveBtn.disabled = true;
        try {
            const res = await fetch('/api/update-emoji', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: pName, 
                    service: activeSwitchService,
                    model: newModel,
                    apiKey: newApiKey || undefined,
                    baseUrl: newBaseUrl || undefined
                })
            });
            
            if (!res.ok) throw new Error('Failed to update project meta');
            
            // Meta updated. Let's restart the terminal!
            project.service = activeSwitchService;
            project.model = newModel;
            if (newApiKey) project.apiKey = newApiKey;
            if (newBaseUrl) project.baseUrl = newBaseUrl;

            // Update badge text
            const badge = tState.panel.querySelector('.terminal-project-badge');
            if (badge) badge.childNodes[0].textContent = newModel;

            closeSwitchServiceModal();
            
            // Execute restart
            if (tState.ws && tState.ws.readyState === WebSocket.OPEN) {
                showToast('info', '🔄', 'Restarting Agent Process...');
                
                // 1. Send exit to currently running process
                tState.ws.send(JSON.stringify({ type: 'input', data: '/exit\r' }));
                
                setTimeout(() => {
                    if (tState.ws.readyState !== WebSocket.OPEN) return;
                    
                    let cmd = '';
                    // 2. Export environment variables if needed
                    if (activeSwitchService === 'sumo') {
                        cmd += `export ANTHROPIC_API_KEY="${newApiKey}" ANTHROPIC_BASE_URL="https://ai.sumopod.com"\r`;
                    } else if (activeSwitchService === 'custom') {
                        cmd += `export ANTHROPIC_API_KEY="${newApiKey}" ANTHROPIC_BASE_URL="${newBaseUrl}"\r`;
                    }
                    
                    // 3. Launch Command
                    if (activeSwitchService === 'claude' || activeSwitchService === 'sumo' || activeSwitchService === 'custom') {
                        cmd += `claude --continue\r`;
                    } else {
                        cmd += `ollama launch claude --model ${newModel} -- --continue\r`;
                    }
                    
                    tState.ws.send(JSON.stringify({ type: 'input', data: cmd }));
                    
                    // 4. Force inject model command after it boots just to be absolutely sure
                    setTimeout(() => {
                        if (tState.ws.readyState === WebSocket.OPEN) {
                            tState.ws.send(JSON.stringify({ type: 'input', data: `/model ${newModel}\r` }));
                        }
                    }, 3500);

                }, 1500); // give exit 1.5s to close
            }

        } catch (err) {
            showToast('error', '❌', 'Failed to update service settings');
        } finally {
            dom.switchServiceSaveBtn.disabled = false;
        }
    });

    // Close on overlay click
    dom.switchServiceModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });
}
