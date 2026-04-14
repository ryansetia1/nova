/* ============================================
   NOVA — Schedule Management UI
   ============================================ */

import { state } from './state.js';
import { addSchedule, removeSchedule, toggleSchedule, saveSchedules, stopSchedule, startSchedule } from './scheduler.js';
import { getAppearanceHtml } from './ui.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let editingScheduleId = null;

// Get a nice display text for agent instead of raw emoji/SPRITE text
function getAgentDisplayText(agent) {
  const appearance = agent.emoji || 'SPRITE:Char1';
  let avatar;
  
  if (appearance.startsWith('SPRITE:')) {
    const charName = appearance.split(':')[1];
    avatar = `🎭 ${charName}`;  // Use theater mask for sprite characters
  } else {
    avatar = appearance;  // Use the emoji as-is
  }
  
  const name = agent.nickname || agent.name;
  return `${avatar} ${name}`;
}

export function initScheduleUI() {
  const manageBtn = document.getElementById('manage-schedules-btn');
  if (manageBtn) {
    manageBtn.addEventListener('click', openScheduleModal);
  }

  bindModalEvents();
  console.log('📅 Schedule UI initialized');
}

function bindModalEvents() {
  const modal = document.getElementById('schedule-modal');
  const addBtn = document.getElementById('schedule-add-btn');
  const closeBtn = document.getElementById('schedule-close-btn');
  const closeFtr = document.getElementById('schedule-close-footer-btn');

  if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);
  if (closeFtr) closeFtr.addEventListener('click', closeScheduleModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeScheduleModal(); });
  if (addBtn) addBtn.addEventListener('click', () => openAddForm());

  const formModal = document.getElementById('schedule-form-modal');
  const formCancel = document.getElementById('sched-form-cancel');
  const formSave = document.getElementById('sched-form-save');
  
  if (formCancel) formCancel.addEventListener('click', closeFormModal);
  if (formSave) formSave.addEventListener('click', handleSaveSchedule);
  if (formModal) formModal.addEventListener('click', (e) => { if (e.target === formModal) closeFormModal(); });
}

function openScheduleModal() {
  renderScheduleList();
  const modal = document.getElementById('schedule-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeScheduleModal() {
  const modal = document.getElementById('schedule-modal');
  if (modal) modal.classList.add('hidden');
}

function openAddForm(existingSchedule = null) {
  const formModal = document.getElementById('schedule-form-modal');
  if (!formModal) return;

  editingScheduleId = existingSchedule ? existingSchedule.id : null;

  resetForm();
  
  const title = document.getElementById('sched-form-title');
  const saveBtn = document.getElementById('sched-form-save');
  if (existingSchedule) {
    if (title) title.textContent = 'Edit Schedule';
    if (saveBtn) saveBtn.textContent = 'Update Schedule';
  } else {
    if (title) title.textContent = 'Add New Schedule';
    if (saveBtn) saveBtn.textContent = 'Save Schedule';
  }

  setupModeToggle();
  setupTimingToggle();
  setupIntervalCustomToggle();
  setupTimeInputFormatting();
  setupAgentDropdown();
  populateActionDropdown(existingSchedule?.mode || 'broadcast');
  populateAgentDropdown();
  populateDayCheckboxes();

  if (existingSchedule) {
    fillFormWithSchedule(existingSchedule);
  }

  formModal.classList.remove('hidden');
}

function fillFormWithSchedule(s) {
  const nameInput = document.getElementById('sched-name');
  if (nameInput) nameInput.value = s.name || '';

  // Mode
  document.querySelectorAll('input[name="sched-mode"]').forEach(r => {
    r.checked = r.value === s.mode;
  });
  toggleAgentField(s.mode);
  populateActionDropdown(s.mode);

  if (s.mode === 'per_agent' && s.targetAgent) {
    const agent = state.projects.find(p => p.name === s.targetAgent);
    if (agent) {
      setSelectedAgent(agent);
    }
  }

  // Timing
  document.querySelectorAll('input[name="sched-timing"]').forEach(r => {
    r.checked = r.value === s.timingType;
  });
  toggleTimingFields(s.timingType);

  if (s.timingType === 'specific' && s.time) {
    setTimeFromHHMM(s.time);
    if (s.days) {
      document.querySelectorAll('#sched-days-group .sched-days-row input[type="checkbox"]').forEach(cb => {
        cb.checked = s.days.includes(parseInt(cb.value));
      });
    }
  } else if (s.timingType === 'interval' && s.interval) {
    const intervalSel = document.getElementById('sched-interval');
    if (intervalSel) {
      const presetMatch = [...intervalSel.options].find(o => o.value === s.interval && o.value !== 'custom');
      if (presetMatch) {
        intervalSel.value = s.interval;
      } else {
        intervalSel.value = 'custom';
        showCustomInterval(true);
        fillCustomInterval(s.interval);
      }
    }
  }

  // Duration
  const durSel = document.getElementById('sched-duration');
  if (durSel && s.duration) durSel.value = String(s.duration);

  // Action
  const actSel = document.getElementById('sched-action');
  if (actSel && s.actionId) actSel.value = s.actionId;

  // Enabled
  const enabledCheck = document.getElementById('sched-enabled');
  if (enabledCheck) enabledCheck.checked = s.enabled !== false;
}

function setTimeFromHHMM(time24) {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr);
  const m = parseInt(mStr) || 0;
  let ampm = 'AM';

  if (h === 0) { h = 12; ampm = 'AM'; }
  else if (h === 12) { ampm = 'PM'; }
  else if (h > 12) { h -= 12; ampm = 'PM'; }

  const hourInput = document.getElementById('sched-hour');
  const minInput = document.getElementById('sched-minute');
  const ampmSel = document.getElementById('sched-ampm');

  if (hourInput) hourInput.value = String(h);
  if (minInput) minInput.value = String(m).padStart(2, '0');
  if (ampmSel) ampmSel.value = ampm;
}

function getTimeAsHHMM() {
  const hourInput = document.getElementById('sched-hour');
  const minInput = document.getElementById('sched-minute');
  const ampmSel = document.getElementById('sched-ampm');

  let h = parseInt(hourInput?.value || '12');
  let m = parseInt(minInput?.value || '0');
  const ampm = ampmSel?.value || 'PM';

  // Clamp
  if (h < 1) h = 1;
  if (h > 12) h = 12;
  if (m < 0) m = 0;
  if (m > 59) m = 59;

  // Convert to 24h
  if (ampm === 'AM' && h === 12) h = 0;
  else if (ampm === 'PM' && h !== 12) h += 12;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function setupTimeInputFormatting() {
  const minInput = document.getElementById('sched-minute');
  if (minInput) {
    minInput.addEventListener('blur', () => {
      let v = parseInt(minInput.value) || 0;
      if (v < 0) v = 0;
      if (v > 59) v = 59;
      minInput.value = String(v).padStart(2, '0');
    });
  }

  const hourInput = document.getElementById('sched-hour');
  if (hourInput) {
    hourInput.addEventListener('blur', () => {
      let v = parseInt(hourInput.value) || 12;
      if (v < 1) v = 1;
      if (v > 12) v = 12;
      hourInput.value = String(v);
    });
  }
}

function fillCustomInterval(intervalStr) {
  const hoursInput = document.getElementById('sched-custom-hours');
  const minsInput = document.getElementById('sched-custom-minutes');
  if (!hoursInput || !minsInput) return;

  const match = intervalStr.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (match) {
    hoursInput.value = match[1] || '0';
    minsInput.value = match[2] || '0';
  }
}

function getCustomInterval() {
  const h = parseInt(document.getElementById('sched-custom-hours')?.value || '0');
  const m = parseInt(document.getElementById('sched-custom-minutes')?.value || '0');
  let result = '';
  if (h > 0) result += `${h}h`;
  if (m > 0) result += `${m}m`;
  return result || '30m';
}

function closeFormModal() {
  const formModal = document.getElementById('schedule-form-modal');
  if (formModal) formModal.classList.add('hidden');
  closeAgentDropdown();
  editingScheduleId = null;
}

function resetForm() {
  const nameInput = document.getElementById('sched-name');
  const modeRadios = document.querySelectorAll('input[name="sched-mode"]');
  const timingRadios = document.querySelectorAll('input[name="sched-timing"]');
  const intervalSelect = document.getElementById('sched-interval');
  const durationSelect = document.getElementById('sched-duration');
  const enabledCheck = document.getElementById('sched-enabled');

  if (nameInput) nameInput.value = '';
  modeRadios.forEach(r => { r.checked = r.value === 'broadcast'; });
  timingRadios.forEach(r => { r.checked = r.value === 'specific'; });
  if (intervalSelect) intervalSelect.value = '2h';
  if (durationSelect) durationSelect.value = '60';
  if (enabledCheck) enabledCheck.checked = true;

  // Reset time to 12:00 PM
  const hourInput = document.getElementById('sched-hour');
  const minInput = document.getElementById('sched-minute');
  const ampmSel = document.getElementById('sched-ampm');
  if (hourInput) hourInput.value = '12';
  if (minInput) minInput.value = '00';
  if (ampmSel) ampmSel.value = 'PM';

  // Reset agent dropdown
  resetAgentDropdown();

  showCustomInterval(false);
  toggleTimingFields('specific');
  toggleAgentField('broadcast');
}

function resetAgentDropdown() {
  const selected = document.getElementById('sched-agent-selected');
  const hiddenInput = document.getElementById('sched-agent');
  
  if (selected) {
    selected.innerHTML = `
      <span class="dropdown-placeholder">Select an agent</span>
      <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    `;
  }
  
  if (hiddenInput) hiddenInput.value = '';
  
  closeAgentDropdown();
}

function setupModeToggle() {
  document.querySelectorAll('input[name="sched-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const mode = radio.value;
      toggleAgentField(mode);
      populateActionDropdown(mode);
    });
  });
}

function setupTimingToggle() {
  document.querySelectorAll('input[name="sched-timing"]').forEach(radio => {
    radio.addEventListener('change', () => {
      toggleTimingFields(radio.value);
    });
  });
}

function setupIntervalCustomToggle() {
  const intervalSel = document.getElementById('sched-interval');
  if (!intervalSel) return;
  intervalSel.addEventListener('change', () => {
    showCustomInterval(intervalSel.value === 'custom');
  });
}

function showCustomInterval(show) {
  const el = document.getElementById('sched-interval-custom');
  if (el) el.style.display = show ? 'block' : 'none';
}

function toggleAgentField(mode) {
  const agentGroup = document.getElementById('sched-agent-group');
  if (agentGroup) {
    agentGroup.style.display = mode === 'per_agent' ? 'block' : 'none';
  }
}

function toggleTimingFields(timingType) {
  const timeGroup = document.getElementById('sched-time-group');
  const intervalGroup = document.getElementById('sched-interval-group');
  const daysGroup = document.getElementById('sched-days-group');

  if (timeGroup) timeGroup.style.display = timingType === 'specific' ? 'block' : 'none';
  if (intervalGroup) intervalGroup.style.display = timingType === 'interval' ? 'block' : 'none';
  if (daysGroup) daysGroup.style.display = timingType === 'specific' ? 'block' : 'none';
}

function populateActionDropdown(mode) {
  const select = document.getElementById('sched-action');
  if (!select) return;

  const actions = state.actions || [];
  
  if (mode === 'broadcast') {
    select.innerHTML = actions.map(a => 
      `<option value="${a.id}">${a.emoji || '📍'} ${a.name || a.id} (${a.animation})</option>`
    ).join('');
  } else {
    select.innerHTML = actions.map(a => 
      `<option value="${a.id}">${a.emoji || '📍'} ${a.name || a.id} (${a.animation})</option>`
    ).join('');
  }
  
  if (actions.length === 0) {
    select.innerHTML = '<option value="" disabled>No actions available — create some in Dev Mode first</option>';
  }
}

function populateAgentDropdown() {
  const list = document.getElementById('sched-agent-list');
  const hiddenInput = document.getElementById('sched-agent');
  if (!list || !hiddenInput) return;

  const agents = state.projects.filter(p => p.active);
  
  if (agents.length === 0) {
    list.innerHTML = '<div class="dropdown-option disabled" style="opacity:0.5;">No active agents</div>';
    return;
  }

  list.innerHTML = agents.map(agent => {
    const appearance = agent.emoji || 'SPRITE:Char1';
    let avatarHtml;
    
    if (appearance.startsWith('SPRITE:')) {
      const charName = appearance.split(':')[1];
      avatarHtml = `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" class="dropdown-option-avatar" alt="${charName}">`;
    } else {
      avatarHtml = `<div class="dropdown-option-emoji">${appearance}</div>`;
    }
    
    const name = agent.nickname || agent.name;
    
    return `
      <div class="dropdown-option" data-value="${agent.name}">
        ${avatarHtml}
        <span class="dropdown-option-name">${name}</span>
      </div>
    `;
  }).join('');

  // Bind click events
  list.querySelectorAll('.dropdown-option:not(.disabled)').forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.value;
      const agent = agents.find(a => a.name === value);
      if (agent) {
        setSelectedAgent(agent);
        closeAgentDropdown();
      }
    });
  });
}

function setSelectedAgent(agent) {
  const selected = document.getElementById('sched-agent-selected');
  const hiddenInput = document.getElementById('sched-agent');
  
  if (!selected || !hiddenInput) return;

  const appearance = agent.emoji || 'SPRITE:Char1';
  let avatarHtml;
  
  if (appearance.startsWith('SPRITE:')) {
    const charName = appearance.split(':')[1];
    avatarHtml = `<img src="assets/characters/${charName}/avatar/${charName}Avatar.png" class="dropdown-option-avatar" alt="${charName}">`;
  } else {
    avatarHtml = `<div class="dropdown-option-emoji">${appearance}</div>`;
  }
  
  const name = agent.nickname || agent.name;
  
  selected.innerHTML = `
    <div class="dropdown-content">
      ${avatarHtml}
      <span class="dropdown-option-name">${name}</span>
    </div>
    <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  `;
  
  hiddenInput.value = agent.name;
}

function openAgentDropdown() {
  const selected = document.getElementById('sched-agent-selected');
  const list = document.getElementById('sched-agent-list');
  
  if (!selected || !list) return;
  
  selected.classList.add('open');
  list.classList.add('open');
  
  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', closeAgentDropdownOutside, true);
  }, 0);
}

function closeAgentDropdown() {
  const selected = document.getElementById('sched-agent-selected');
  const list = document.getElementById('sched-agent-list');
  
  if (selected) selected.classList.remove('open');
  if (list) list.classList.remove('open');
  
  document.removeEventListener('click', closeAgentDropdownOutside, true);
}

function closeAgentDropdownOutside(e) {
  const dropdown = document.getElementById('sched-agent-dropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    closeAgentDropdown();
  }
}

function setupAgentDropdown() {
  const selected = document.getElementById('sched-agent-selected');
  if (!selected) return;
  
  selected.addEventListener('click', (e) => {
    e.preventDefault();
    const list = document.getElementById('sched-agent-list');
    if (list && list.classList.contains('open')) {
      closeAgentDropdown();
    } else {
      openAgentDropdown();
    }
  });
}

function populateDayCheckboxes() {
  const container = document.getElementById('sched-days-group');
  if (!container) return;

  const existing = container.querySelectorAll('.sched-days-row input[type="checkbox"]');
  if (existing.length > 0) {
    existing.forEach(cb => { cb.checked = true; });
    return;
  }
}

function handleSaveSchedule() {
  const name = document.getElementById('sched-name')?.value?.trim();
  if (!name) {
    alert('Please enter a schedule name');
    return;
  }

  const mode = document.querySelector('input[name="sched-mode"]:checked')?.value || 'broadcast';
  const timingType = document.querySelector('input[name="sched-timing"]:checked')?.value || 'specific';
  const actionId = document.getElementById('sched-action')?.value;
  const duration = parseInt(document.getElementById('sched-duration')?.value || '60');
  const enabled = document.getElementById('sched-enabled')?.checked ?? true;

  if (!actionId) {
    alert('Please select an action');
    return;
  }

  const schedule = {
    name,
    mode,
    timingType,
    actionId,
    duration,
    enabled
  };

  if (mode === 'per_agent') {
    schedule.targetAgent = document.getElementById('sched-agent')?.value;
    if (!schedule.targetAgent) {
      alert('Please select an agent');
      return;
    }
  }

  if (timingType === 'specific') {
    schedule.time = getTimeAsHHMM();
    const dayCheckboxes = document.querySelectorAll('#sched-days-group .sched-days-row input[type="checkbox"]:checked');
    schedule.days = Array.from(dayCheckboxes).map(cb => parseInt(cb.value));
    if (schedule.days.length === 0) {
      alert('Please select at least one day');
      return;
    }
  } else {
    const intervalSel = document.getElementById('sched-interval');
    if (intervalSel?.value === 'custom') {
      schedule.interval = getCustomInterval();
    } else {
      schedule.interval = intervalSel?.value || '2h';
    }
  }

  if (editingScheduleId) {
    updateExistingSchedule(editingScheduleId, schedule);
  } else {
    addSchedule(schedule);
  }

  closeFormModal();
  renderScheduleList();
}

function updateExistingSchedule(id, updates) {
  const idx = state.schedules.findIndex(s => s.id === id);
  if (idx === -1) return;

  const wasEnabled = state.schedules[idx].enabled;

  if (wasEnabled) {
    stopSchedule(id);
  }

  Object.assign(state.schedules[idx], updates);

  if (updates.enabled) {
    startSchedule(state.schedules[idx]);
  }

  saveSchedules();
}

function formatTimeDisplay(time24) {
  if (!time24) return '';
  const [hStr, m] = time24.split(':');
  let h = parseInt(hStr);
  let ampm = 'AM';
  if (h === 0) { h = 12; ampm = 'AM'; }
  else if (h === 12) { ampm = 'PM'; }
  else if (h > 12) { h -= 12; ampm = 'PM'; }
  return `${h}:${m} ${ampm}`;
}

function renderScheduleList() {
  const container = document.getElementById('schedule-list');
  if (!container) return;

  if (!state.schedules || state.schedules.length === 0) {
    container.innerHTML = `
      <div class="schedule-empty">
        <p>No schedules yet</p>
        <p style="font-size: 12px; opacity: 0.6;">Click "Add Schedule" to create one</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.schedules.map(s => {
    const action = state.actions?.find(a => a.id === s.actionId);
    const actionLabel = action ? `${action.emoji || '📍'} ${action.name || action.id}` : s.actionId;
    
    let timingLabel;
    if (s.timingType === 'specific') {
      const dayLabels = (s.days || []).map(d => DAY_LABELS[d]).join(', ');
      timingLabel = `${formatTimeDisplay(s.time)} on ${dayLabels || 'every day'}`;
    } else {
      timingLabel = `Every ${s.interval}`;
    }

    let modeLabel = '🌍 Broadcast';
    if (s.mode === 'per_agent') {
      const agent = state.projects.find(p => p.name === s.targetAgent);
      if (agent) {
        modeLabel = `👤 ${getAgentDisplayText(agent)}`;
      } else {
        modeLabel = `👤 ${s.targetAgent}`;
      }
    }
    const durationLabel = s.duration >= 60 ? `${Math.floor(s.duration / 60)}m` : `${s.duration}s`;

    return `
      <div class="schedule-card ${s.enabled ? '' : 'disabled'}">
        <div class="schedule-card-header">
          <div class="schedule-card-name">${s.name}</div>
          <label class="schedule-toggle">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} data-id="${s.id}" class="schedule-toggle-input">
            <span class="schedule-toggle-slider"></span>
          </label>
        </div>
        <div class="schedule-card-details">
          <span class="schedule-detail-badge">${modeLabel}</span>
          <span class="schedule-detail-badge">🕐 ${timingLabel}</span>
          <span class="schedule-detail-badge">⏱️ ${durationLabel}</span>
          <span class="schedule-detail-badge">${actionLabel}</span>
        </div>
        <div class="schedule-card-actions">
          <button class="schedule-edit-btn" data-id="${s.id}">Edit</button>
          <button class="schedule-delete-btn" data-id="${s.id}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind toggle events
  container.querySelectorAll('.schedule-toggle-input').forEach(cb => {
    cb.addEventListener('change', (e) => {
      toggleSchedule(e.target.dataset.id, e.target.checked);
      renderScheduleList();
    });
  });

  // Bind edit events
  container.querySelectorAll('.schedule-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const schedule = state.schedules.find(s => s.id === btn.dataset.id);
      if (schedule) openAddForm(schedule);
    });
  });

  // Bind delete events
  container.querySelectorAll('.schedule-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Remove this schedule?')) {
        removeSchedule(btn.dataset.id);
        renderScheduleList();
      }
    });
  });
}
