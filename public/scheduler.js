/* ============================================
   NOVA — User-Driven Agent Scheduling System
   ============================================ */

import { state } from './state.js';
import { moveToPosition, clearForcedTarget } from './walking.js';

function wsParam() {
    return state.activeWorkspace ? `?workspace=${encodeURIComponent(state.activeWorkspace)}` : '';
}

// Active timers per schedule
const activeTimers = new Map();     // scheduleId -> intervalId or timeoutId
const durationTimers = new Map();   // agentName -> timeoutId (for clearing on cancel)

// Parse interval string (e.g. "2h", "30m", "1h30m") to milliseconds
function parseInterval(str) {
  let totalMs = 0;
  const hMatch = str.match(/(\d+)h/);
  const mMatch = str.match(/(\d+)m/);
  const sMatch = str.match(/(\d+)s/);
  if (hMatch) totalMs += parseInt(hMatch[1]) * 60 * 60 * 1000;
  if (mMatch) totalMs += parseInt(mMatch[1]) * 60 * 1000;
  if (sMatch) totalMs += parseInt(sMatch[1]) * 1000;
  return totalMs > 0 ? totalMs : null;
}

// Calculate ms until the next occurrence of a specific-time schedule
function msUntilNextOccurrence(schedule) {
  const [targetH, targetM] = schedule.time.split(':').map(Number);
  const now = new Date();
  const days = schedule.days && schedule.days.length > 0 ? schedule.days : [0,1,2,3,4,5,6];

  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(targetH, targetM, 0, 0);

    if (candidate <= now) continue;
    if (!days.includes(candidate.getDay())) continue;

    return candidate - now;
  }

  return null;
}

// Get agents that can run a given animation
function getEligibleAgents(animationName, targetAgent = null) {
  const activeAgents = state.projects.filter(p => p.active);
  
  if (targetAgent) {
    const agent = activeAgents.find(a => a.name === targetAgent);
    return agent ? [agent] : [];
  }

  return activeAgents.filter(agent => {
    const appearance = agent.emoji || 'SPRITE:Char1';
    const charId = appearance.startsWith('SPRITE:') ? appearance.split(':')[1] : 'Char1';
    const charAnims = state.characterFrames[charId] || state.characterFrames['Char1'];
    
    // Emoji agents are always eligible
    if (!appearance.startsWith('SPRITE:')) return true;
    
    // Sprite agents must have the animation
    if (!charAnims) return true;
    return !!charAnims[animationName.toLowerCase()] || !!charAnims[animationName];
  });
}

// Calculate broadcast offsets to prevent stacking
function getBroadcastOffset(agentIndex, totalAgents) {
  if (totalAgents <= 1) return { offsetX: 0, offsetY: 0 };

  const spreadRadius = 2.5;
  const angle = (2 * Math.PI / totalAgents) * agentIndex;
  return {
    offsetX: Math.cos(angle) * spreadRadius,
    offsetY: Math.sin(angle) * spreadRadius
  };
}

// Execute a schedule's action
function executeScheduleAction(schedule) {
  const action = state.actions.find(a => a.id === schedule.actionId);
  if (!action) {
    console.warn(`📅 Action not found for schedule "${schedule.name}": ${schedule.actionId}`);
    return;
  }

  const isBroadcast = schedule.mode === 'broadcast';
  const agents = isBroadcast
    ? getEligibleAgents(action.animation)
    : getEligibleAgents(action.animation, schedule.targetAgent);

  if (agents.length === 0) {
    console.log(`📅 No eligible agents for schedule "${schedule.name}"`);
    return;
  }

  console.log(`📅 Executing schedule "${schedule.name}" for ${agents.length} agent(s)`);

  agents.forEach((agent, i) => {
    // Cancel any existing duration timer for this agent
    if (durationTimers.has(agent.name)) {
      clearTimeout(durationTimers.get(agent.name));
      durationTimers.delete(agent.name);
    }

    // Cancel any current action (last active gets cancelled)
    const r = state.walkingRobots[agent.name];
    if (r && r.forcedTarget) {
      r.forcedTarget = null;
      r.activity = null;
    }

    const offset = isBroadcast ? getBroadcastOffset(i, agents.length) : { offsetX: 0, offsetY: 0 };
    
    moveToPosition(agent.name, schedule.actionId, {
      fromScheduler: true,
      offsetX: offset.offsetX,
      offsetY: offset.offsetY
    });

    // Set duration timer — after duration, agent resumes random walking
    if (schedule.duration && schedule.duration > 0) {
      const durationMs = schedule.duration * 1000;
      const timer = setTimeout(() => {
        clearForcedTarget(agent.name);
        durationTimers.delete(agent.name);
        console.log(`📅 Duration expired for "${agent.name}" on schedule "${schedule.name}"`);
      }, durationMs);
      durationTimers.set(agent.name, timer);
    }
  });
}

// Schedule a precise setTimeout for the next occurrence, then chain to the one after
function scheduleNextOccurrence(schedule) {
  stopSchedule(schedule.id);

  const ms = msUntilNextOccurrence(schedule);
  if (ms === null) {
    console.warn(`📅 No upcoming occurrence for "${schedule.name}"`);
    return;
  }

  const secsUntil = Math.round(ms / 1000);
  const minsUntil = Math.floor(secsUntil / 60);
  const hrsUntil = Math.floor(minsUntil / 60);
  const timeLabel = hrsUntil > 0
    ? `${hrsUntil}h ${minsUntil % 60}m`
    : `${minsUntil}m ${secsUntil % 60}s`;

  console.log(`📅 Schedule "${schedule.name}" will fire at ${schedule.time} in ${timeLabel}`);

  const timerId = setTimeout(() => {
    activeTimers.delete(schedule.id);
    executeScheduleAction(schedule);
    // Chain: schedule the next occurrence
    if (schedule.enabled) {
      scheduleNextOccurrence(schedule);
    }
  }, ms);

  activeTimers.set(schedule.id, timerId);
}

// Start a specific schedule
export function startSchedule(schedule) {
  if (!schedule.enabled) return;
  stopSchedule(schedule.id);

  if (schedule.timingType === 'interval') {
    const intervalMs = parseInterval(schedule.interval);
    if (!intervalMs) {
      console.error(`📅 Invalid interval for "${schedule.name}": ${schedule.interval}`);
      return;
    }
    
    // Execute immediately on start, then repeat at interval
    executeScheduleAction(schedule);
    const timerId = setInterval(() => executeScheduleAction(schedule), intervalMs);
    activeTimers.set(schedule.id, timerId);
    console.log(`📅 Started interval schedule "${schedule.name}" every ${schedule.interval}`);
    
  } else if (schedule.timingType === 'specific') {
    scheduleNextOccurrence(schedule);
  }
}

// Stop a specific schedule
export function stopSchedule(scheduleId) {
  const timerId = activeTimers.get(scheduleId);
  if (timerId) {
    clearTimeout(timerId);
    clearInterval(timerId);
    activeTimers.delete(scheduleId);
  }
}

// Load schedules from server and start enabled ones
export async function initScheduler() {
  console.log('📅 Initializing NOVA Scheduler...');
  
  try {
    const res = await fetch(`/api/schedules${wsParam()}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      state.schedules = data;
    }
  } catch (err) {
    console.error('Failed to load schedules', err);
  }

  state.schedules.forEach(schedule => {
    if (schedule.enabled) {
      startSchedule(schedule);
    }
  });
  
  state.schedulerInitialized = true;
  console.log(`📅 Scheduler initialized with ${state.schedules.length} schedule(s), ${activeTimers.size} active`);
}

// Persist schedules to server
export async function saveSchedules() {
  try {
    await fetch(`/api/schedules${wsParam()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedules: state.schedules })
    });
  } catch (err) {
    console.error('Failed to save schedules', err);
  }
}

// Add a new schedule
export function addSchedule(schedule) {
  schedule.id = 'sched_' + Date.now();
  schedule.createdAt = new Date().toISOString();
  state.schedules.push(schedule);
  
  if (schedule.enabled) {
    startSchedule(schedule);
  }
  
  saveSchedules();
  console.log(`📅 Added schedule "${schedule.name}"`);
  return schedule;
}

// Remove a schedule
export function removeSchedule(scheduleId) {
  stopSchedule(scheduleId);
  state.schedules = state.schedules.filter(s => s.id !== scheduleId);
  saveSchedules();
  console.log(`📅 Removed schedule ${scheduleId}`);
}

// Toggle a schedule on/off
export function toggleSchedule(scheduleId, enabled) {
  const schedule = state.schedules.find(s => s.id === scheduleId);
  if (!schedule) return;
  
  schedule.enabled = enabled;
  
  if (enabled) {
    startSchedule(schedule);
  } else {
    stopSchedule(scheduleId);
  }
  
  saveSchedules();
  console.log(`📅 Schedule "${schedule.name}" ${enabled ? 'enabled' : 'disabled'}`);
}

// Clean up all timers
export function shutdownScheduler() {
  activeTimers.forEach((timerId) => { clearTimeout(timerId); clearInterval(timerId); });
  activeTimers.clear();
  durationTimers.forEach((timerId) => clearTimeout(timerId));
  durationTimers.clear();
  console.log('📅 Scheduler shutdown');
}

// Expose for debugging
window.novaScheduler = {
  get schedules() { return state.schedules; },
  get activeTimers() { return activeTimers.size; },
  addSchedule,
  removeSchedule,
  toggleSchedule,
  executeScheduleAction
};
