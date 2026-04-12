/* ============================================
   NOVA — Walking & Path Logic
   ============================================ */

import { state, dom } from './state.js';
import { showToast, renderRobots, renderForegroundObjects } from './ui.js';
import { renderActivePath } from './devtool.js';

export let WALKABLE_PATH = [{"x":17.75,"y":73.69},{"x":53.13,"y":55.56},{"x":59.62,"y":58.94},{"x":67.63,"y":60.31},{"x":71.13,"y":58.31},{"x":88.13,"y":66.94},{"x":84,"y":67.94},{"x":85.88,"y":71.31},{"x":74,"y":77.69},{"x":70.63,"y":75.19},{"x":62.88,"y":80.06},{"x":59.62,"y":83.94},{"x":44,"y":74.94},{"x":33.13,"y":81.06},{"x":18.13,"y":73.81}];

export function isPointInPolygon(point, vs) {
    if (!vs || vs.length < 3) return true;
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function pickSafePoint() {
    if (WALKABLE_PATH.length < 3) return { x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 };
    for (let i = 0; i < 50; i++) {
        const p = { x: Math.random() * 100, y: Math.random() * 100 };
        if (isPointInPolygon(p, WALKABLE_PATH)) return p;
    }
    return WALKABLE_PATH[Math.floor(Math.random() * WALKABLE_PATH.length)];
}

export function startWalkingLoop() {
  setInterval(() => {
      const projectNames = state.projects.map(p => p.name);
      
      projectNames.forEach(name => {
          let r = state.walkingRobots[name];
          if (!r) {
              const start = pickSafePoint();
              const target = pickSafePoint();
              r = state.walkingRobots[name] = {
                  x: start.x, y: start.y,
                  tx: target.x, ty: target.y,
                  speed: 0.07 + Math.random() * 0.13,
                  isWalking: true, isHovered: false, isThinking: false, hasUpdate: false,
                  isIllegal: false, frame: 0, naturalIdleTimer: 0,
                  forcedTarget: null, activity: null, activityFrame: 0
              };
          }

          r.isIllegal = !isPointInPolygon({x: r.x, y: r.y}, WALKABLE_PATH);

          const p = state.projects.find(x => x.name === name);
          const t = state.terminals[name];
          const isWindowVisible = t && t.panel && !t.panel.classList.contains('hidden');
          const isOrphaned = p && !p.active;
          
          // If we have a forced target, we override normal stops UNLESS hovered
          const isManualStop = (isWindowVisible || r.isHovered || isOrphaned) && !r.forcedTarget;
          
          if (r.naturalIdleTimer > 0 && !r.forcedTarget) {
              r.naturalIdleTimer--;
              r.isWalking = false;
          } else {
              r.isWalking = !isManualStop;
              if (r.isWalking && Math.random() < 0.002 && !r.forcedTarget) {
                  r.naturalIdleTimer = 50 + Math.random() * 100;
                  r.frame = 0;
              }
          }

          if (r.isWalking) {
              const tx = r.forcedTarget ? r.forcedTarget.x : r.tx;
              const ty = r.forcedTarget ? r.forcedTarget.y : r.ty;
              
              const dx = tx - r.x;
              const dy = ty - r.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              if (dist < 1.0) { // Closer threshold for forced targets
                  if (r.forcedTarget) {
                      // ARRIVED at forced target
                      r.activity = r.forcedTarget.animation || 'idle';
                      r.isWalking = false;
                      // We keep forcedTarget so we stay there, but stop walking
                  } else {
                      if (Math.random() < 0.5) {
                          r.naturalIdleTimer = 80 + Math.random() * 150;
                          r.frame = 0;
                      }
                      const next = pickSafePoint();
                      r.tx = next.x; r.ty = next.y;
                  }
              } else {
                  // If we were doing an activity but started walking (shouldn't happen with logic above but safety first)
                  r.activity = null; 
                  
                  const nextX = r.x + (dx / dist) * r.speed;
                  const nextY = r.y + (dy / dist) * r.speed;
                  
                  if (r.isIllegal) {
                      r.x = nextX; r.y = nextY;
                  } else if (isPointInPolygon({x: nextX, y: nextY}, WALKABLE_PATH)) {
                      r.x = nextX; r.y = nextY;
                  } else if (r.forcedTarget) {
                      // Forced targets ignore polygon if they are slightly outside for precision (e.g. sitting on a chair)
                      r.x = nextX; r.y = nextY;
                  } else {
                      const next = pickSafePoint();
                      r.tx = next.x; r.ty = next.y;
                  }
              }
          }
      });

      projectNames.forEach(name => {
          const r = state.walkingRobots[name];
          if (!r) return;
          const el = dom.robotCards.querySelector(`[data-project="${name}"]`);
          if (el) {
              const t = state.terminals[name];
              const isWindowVisible = t && t.panel && !t.panel.classList.contains('hidden');
              
              el.style.left = r.x + '%';
              el.style.top = r.y + '%';
              el.style.zIndex = Math.floor(r.y * 100);
              
              const isPlayingIdle = r.isHovered || r.naturalIdleTimer > 0 || isWindowVisible || r.activity;
              if (r.isWalking || isPlayingIdle) {
                  const p = state.projects.find(x => x.name === name);
                  const appearance = p?.emoji || 'SPRITE:Char1';
                  const charId = appearance.startsWith('SPRITE:') ? appearance.split(':')[1] : 'Char1';
                  const charAnims = state.characterFrames[charId] || state.characterFrames['Char1'];
                  
                  // Priority: Activity > Walk > Hover/Idle/Visible
                  let animName = 'idle';
                  if (r.activity) animName = r.activity.toLowerCase();
                  else if (r.isWalking) animName = 'walk';
                  else if (isPlayingIdle) animName = 'idle';
                  else animName = 'walk'; // Fallback

                  // Fallback to idle if animation doesn't exist
                  if (!charAnims[animName]) animName = 'idle';
                  const frames = charAnims[animName] || charAnims['idle'];
                  
                  r.frame = (r.frame + 1) % frames.length;
                  const sprite = el.querySelector('.robot-char-sprite');
                  if (sprite) {
                      sprite.src = frames[r.frame];
                      if (r.isWalking) {
                          const tx = r.forcedTarget ? r.forcedTarget.x : r.tx;
                          const isFlipped = tx < r.x;
                          sprite.style.transform = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
                      } else {
                          sprite.style.transform = 'scaleX(1)';
                      }
                  }
              }

              if (r.isThinking) el.classList.add('thinking');
              else el.classList.remove('thinking');
              
              if (r.hasUpdate) el.classList.add('has-update');
              else el.classList.remove('has-update');
          }
      });
  }, 42);
}

export async function loadWalkablePath() {
    try {
        const res = await fetch('/api/walkable-path');
        const data = await res.json();
        if (Array.isArray(data) && data.length >= 3) {
            WALKABLE_PATH.length = 0;
            WALKABLE_PATH.push(...data);
            renderActivePath();
        }
    } catch (err) { console.error('Failed to load path', err); }
}

export async function saveWalkablePath(newPath) {
    try {
        const res = await fetch('/api/walkable-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: newPath })
        });
        if (res.ok) {
            WALKABLE_PATH.length = 0;
            WALKABLE_PATH.push(...newPath);
            showToast('success', '💾', 'Walkable path saved & synced!');
            renderActivePath();
        }
    } catch (err) { showToast('error', '❌', 'Failed to save path'); }
}

export async function loadAnchorConfig() {
    try {
        const res = await fetch('/api/anchor');
        const data = await res.json();
        if (typeof data.x === 'number' && typeof data.y === 'number') {
            state.anchor = { x: data.x, y: data.y };
            state.originalAnchor = { ...state.anchor };
            updateAnchorStyles(data.x, data.y);
        }
    } catch (err) { console.error('Failed to load anchor', err); }
}

export async function saveAnchorConfig(x, y) {
    try {
        const res = await fetch('/api/anchor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: Number(x), y: Number(y) })
        });
        if (res.ok) {
            state.originalAnchor = { x, y };
            showToast('success', '⚓', 'Anchor configuration saved!');
        }
    } catch (err) { showToast('error', '❌', 'Failed to save anchor'); }
}

export function updateAnchorStyles(x, y) {
    document.documentElement.style.setProperty('--anchor-x', `${x}%`);
    document.documentElement.style.setProperty('--anchor-y', `${y}%`);
    const inputX = document.querySelector('#input-anchor-x');
    const inputY = document.querySelector('#input-anchor-y');
    const valX = document.querySelector('#val-anchor-x');
    const valY = document.querySelector('#val-anchor-y');
    if (inputX) inputX.value = x;
    if (inputY) inputY.value = y;
    if (valX) valX.textContent = x;
    if (valY) valY.textContent = y;
}

export function initAnchorAdjuster() {
  if (!dom.inputAnchorX || !dom.inputAnchorY) return;

  const syncUI = () => {
      const x = dom.inputAnchorX.value;
      const y = dom.inputAnchorY.value;
      state.anchor.x = x;
      state.anchor.y = y;
      
      dom.valAnchorX.textContent = x;
      dom.valAnchorY.textContent = y;
      
      document.documentElement.style.setProperty('--anchor-x', `${x}%`);
      document.documentElement.style.setProperty('--anchor-y', `${y}%`);
  };

  dom.inputAnchorX.addEventListener('input', syncUI);
  dom.inputAnchorY.addEventListener('input', syncUI);
  
  const btnReset = document.querySelector('#btn-anchor-reset');
  const btnCancel = document.querySelector('#btn-anchor-cancel');
  const btnSave = document.querySelector('#btn-anchor-save');

  if (btnReset) {
      btnReset.onclick = () => {
          dom.inputAnchorX.value = 50;
          dom.inputAnchorY.value = 85;
          syncUI();
          showToast('info', '🔄', 'Anchor reset to default');
      };
  }

  if (btnCancel) {
      btnCancel.onclick = () => {
          dom.inputAnchorX.value = state.originalAnchor.x;
          dom.inputAnchorY.value = state.originalAnchor.y;
          syncUI();
          showToast('info', '📂', 'Changes discarded');
      };
  }

  if (btnSave) {
      btnSave.onclick = async () => {
          await saveAnchorConfig(state.anchor.x, state.anchor.y);
      };
  }

  syncUI();
}

export async function loadBreakPositions() {
    try {
        const res = await fetch('/api/break-positions');
        const data = await res.json();
        if (Array.isArray(data)) {
            state.breakPositions = data;
        }
    } catch (err) { console.error('Failed to load break positions', err); }
}

export async function saveBreakPositions(positions) {
    try {
        const res = await fetch('/api/break-positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions })
        });
        if (res.ok) {
            state.breakPositions = positions;
            showToast('success', '☕', 'Break positions saved!');
            renderActivePath();
            
            // Re-render objects in case association changed
            renderForegroundObjects();
            
            // Refresh all terminal activity bars
            import('./terminal.js').then(m => m.renderAllActivityBars());
        }
    } catch (err) { showToast('error', '❌', 'Failed to save positions'); }
}

export async function loadForegroundObjects() {
    try {
        const res = await fetch('/api/foreground-objects');
        const data = await res.json();
        if (Array.isArray(data)) {
            state.foregroundObjects = data;
            renderForegroundObjects();
        }
    } catch (err) { console.error('Failed to load foreground objects', err); }
}

export async function saveForegroundObjects(objects) {
    try {
        const res = await fetch('/api/foreground-objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objects })
        });
        if (res.ok) {
            state.foregroundObjects = objects;
            showToast('success', '🖼️', 'Foreground layout saved!');
            renderForegroundObjects();
            renderActivePath();
        }
    } catch (err) { showToast('error', '❌', 'Failed to save objects'); }
}

export async function loadObjectAssets() {
    try {
        const res = await fetch('/api/object-assets');
        const data = await res.json();
        if (Array.isArray(data)) {
            state.objectAssets = data;
        }
    } catch (err) { console.error('Failed to load object assets', err); }
}

export function moveToPosition(pName, positionId) {
    const r = state.walkingRobots[pName];
    if (!r) return;
    const pos = state.breakPositions.find(p => p.id === positionId);
    // Toggle: if already moving to or at this specific position target, cancel it
    if (r.forcedTarget && r.forcedTarget.id === pos.id) {
        r.forcedTarget = null;
        r.naturalIdleTimer = 0; // Return to natural AI
        import('./terminal.js').then(m => m.renderAllActivityBars());
        return;
    }

    r.forcedTarget = { id: pos.id, x: pos.x, y: pos.y, animation: pos.animation };
    r.isWalking = true;
    r.tx = pos.x; r.ty = pos.y;
    
    import('./terminal.js').then(m => m.renderAllActivityBars());

    // Optional: Send command if defined
    if (pos.command) {
        const t = state.terminals[pName];
        if (t && t.send) {
            t.send(pos.command + '\n');
        }
    }
}

export function bindHoverListeners() {
  dom.robotCards.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.robot-avatar');
      if (card) {
          const name = card.dataset.project;
          if (state.walkingRobots[name]) {
              if (!state.walkingRobots[name].isHovered) {
                  state.walkingRobots[name].isHovered = true;
                  state.walkingRobots[name].frame = 0;
              }
          }
      }
  });

  dom.robotCards.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.robot-avatar');
      if (card) {
          const name = card.dataset.project;
          const nextElement = e.relatedTarget;
          if (!nextElement || !card.contains(nextElement)) {
              if (state.walkingRobots[name]) {
                  if (state.walkingRobots[name].isHovered) {
                      state.walkingRobots[name].isHovered = false;
                      state.walkingRobots[name].frame = 0;
                  }
              }
          }
      }
  });
}
