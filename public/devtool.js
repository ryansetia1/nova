/* ============================================
   NOVA — Dev Tools
   ============================================ */

import { state, dom } from './state.js';
import { showToast } from './ui.js';
import { WALKABLE_PATH, saveWalkablePath } from './walking.js';

export const dev = { 
    isActive: false, 
    mode: 'draw', 
    polygon: [], 
    originalPolygon: [], 
    svg: null, 
    toolbar: null, 
    draggingIndex: null,
    draggingPositionIndex: null, 
    editingPosition: null, // index of break position being edited
    availableAnimationsMap: {} // { charId: [animations] }
};

export function initDevTool() {
    renderActivePath();

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'd') {
            dev.isActive = !dev.isActive;
            if (dev.isActive) {
                enterDevMode();
            } else {
                exitDevMode();
            }
        }
    });

    const floorWrapper = document.querySelector('#floor-wrapper');
    if (floorWrapper) {
        floorWrapper.addEventListener('mousedown', e => {
            if (!dev.isActive) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
            const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));

            if (dev.mode === 'draw') {
                dev.polygon.push({x, y});
                renderActivePath();
            } else if (dev.mode === 'tweak') {
                const hitIndex = dev.polygon.findIndex(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < 2);
                if (hitIndex !== -1) {
                    dev.draggingIndex = hitIndex;
                    document.addEventListener('mousemove', onTweakMove);
                    document.addEventListener('mouseup', onTweakUp);
                }
            } else if (dev.mode === 'positions') {
                const hitIndex = state.breakPositions.findIndex(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < 3);
                if (hitIndex !== -1) {
                    dev.draggingPositionIndex = hitIndex;
                    dev.editingPosition = hitIndex;
                    document.addEventListener('mousemove', onPositionMove);
                    document.addEventListener('mouseup', onPositionUp);
                } else {
                    const id = 'pos_' + Date.now();
                    state.breakPositions.push({ id, x, y, emoji: '☕', animation: 'coffee', command: '', assignee: 'All Agents' });
                    dev.editingPosition = state.breakPositions.length - 1;
                    showPositionConfig(state.breakPositions.length - 1);
                    renderActivePath();
                }
            }
        });
    }
}

function onPositionMove(e) {
    if (dev.draggingPositionIndex === null) return;
    const pt = dev.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(dev.svg.getScreenCTM().inverse());
    
    state.breakPositions[dev.draggingPositionIndex].x = svgP.x;
    state.breakPositions[dev.draggingPositionIndex].y = svgP.y;
    renderActivePath();
}

function onPositionUp() {
    if (dev.draggingPositionIndex !== null) {
        showPositionConfig(dev.draggingPositionIndex);
    }
    dev.draggingPositionIndex = null;
    document.removeEventListener('mousemove', onPositionMove);
    document.removeEventListener('mouseup', onPositionUp);
}

function enterDevMode() {
    dev.originalPolygon = [...WALKABLE_PATH];
    dev.polygon = [...WALKABLE_PATH];
    document.body.classList.add('drawing-mode');
    
    // Fetch animations for dropdowns
    fetch('/api/character-animations')
        .then(r => r.json())
        .then(data => { dev.availableAnimationsMap = data; });

    showDevToolbar();
    initDevSvg();
    renderActivePath();
    showToast('info', '🛠️', 'Dev Mode: ON. Use toolbar to Draw, Tweak, or set Positions.');
}

function exitDevMode(save = true) {
    document.body.classList.remove('drawing-mode');
    if (dev.toolbar) dev.toolbar.remove();
    dev.toolbar = null;
    if (save && (dev.polygon.length >= 3 || state.breakPositions.length > 0)) {
        saveWalkablePath(dev.polygon);
        import('./walking.js').then(m => m.saveBreakPositions(state.breakPositions));
    } else if (!save) {
        dev.polygon = [...dev.originalPolygon];
        showToast('info', '📂', 'Changes discarded.');
    }
    renderActivePath();
}

function initDevSvg() {
    if (!dev.svg) {
        dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dev.svg.id = 'dev-svg-layer';
        dev.svg.setAttribute('viewBox', '0 0 100 100');
        dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:30000;');
        const floorWrapper = document.querySelector('#floor-wrapper');
        if (floorWrapper) floorWrapper.appendChild(dev.svg);
    }
    dev.svg.style.pointerEvents = 'auto'; 
}

function showDevToolbar() {
    if (dev.toolbar) dev.toolbar.remove();
    dev.toolbar = document.createElement('div');
    dev.toolbar.id = 'dev-toolbar';
    dev.toolbar.setAttribute('style', 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(13,17,28,0.95); padding:8px; border-radius:12px; z-index:40000; border:1px solid #3b82f6; display:flex; gap:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px);');
    
    const btnStyle = 'padding:6px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; cursor:pointer; font-size:12px; transition:all 0.2s;';
    
    dev.toolbar.innerHTML = `
        <button id="dev-btn-draw" style="${btnStyle} ${dev.mode === 'draw' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🖋️ Draw</button>
        <button id="dev-btn-tweak" style="${btnStyle} ${dev.mode === 'tweak' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🎯 Tweak</button>
        <button id="dev-btn-positions" style="${btnStyle} ${dev.mode === 'positions' ? 'background:#6366f1; border-color:#6366f1;' : ''}">📍 Positions</button>
        <div style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
        <button id="dev-btn-clear" style="${btnStyle}">🗑️ Clear</button>
        <button id="dev-btn-cancel" style="${btnStyle}">❌ Cancel</button>
        <button id="dev-btn-save" style="${btnStyle} background:#10b981; border-color:#10b981;">✅ Save & Exit</button>
    `;
    
    document.body.appendChild(dev.toolbar);
    
    dev.toolbar.querySelector('#dev-btn-draw').onclick = () => setDevMode('draw');
    dev.toolbar.querySelector('#dev-btn-tweak').onclick = () => setDevMode('tweak');
    dev.toolbar.querySelector('#dev-btn-positions').onclick = () => setDevMode('positions');
    dev.toolbar.querySelector('#dev-btn-clear').onclick = () => { 
        if (dev.mode === 'positions') state.breakPositions = [];
        else dev.polygon = []; 
        renderActivePath(); 
    };
    dev.toolbar.querySelector('#dev-btn-cancel').onclick = () => { dev.isActive = false; exitDevMode(false); hidePositionConfig(); };
    dev.toolbar.querySelector('#dev-btn-save').onclick = () => { dev.isActive = false; exitDevMode(true); hidePositionConfig(); };
}

function showPositionConfig(index) {
    const pos = state.breakPositions[index];
    if (!pos) return;

    let panel = document.querySelector('#dev-pos-config');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'dev-pos-config';
        panel.setAttribute('style', 'position:fixed; top:20px; right:20px; background:rgba(13,17,28,0.95); padding:16px; border-radius:12px; z-index:45000; border:1px solid #6366f1; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px); display:flex; flex-direction:column; gap:12px;');
        document.body.appendChild(panel);
    }
    panel.classList.remove('hidden');

    // Get animations based on assignment
    let animations = [];
    if (!pos.assignee || pos.assignee === 'All Agents') {
        // Intersection of animations across all ACTIVE agents' models
        const activeCharIds = [...new Set(state.projects
            .filter(p => p.active)
            .map(p => (p.emoji && p.emoji.startsWith('SPRITE:')) ? p.emoji.split(':')[1] : 'Char1'))];
        
        if (activeCharIds.length === 0) {
            animations = ['Walk', 'Idle'];
        } else {
            // Start with animations of the first active character
            animations = Object.keys(dev.availableAnimationsMap[activeCharIds[0]] || { 'Walk': 42, 'Idle': 80 });
            // Intersect with the rest of the active characters
            activeCharIds.forEach(id => {
                const charAnims = Object.keys(dev.availableAnimationsMap[id] || { 'Walk': 42, 'Idle': 80 });
                animations = animations.filter(a => charAnims.includes(a));
            });
        }
    } else {
        const agent = state.projects.find(p => p.name === pos.assignee);
        const charId = (agent?.emoji && agent.emoji.startsWith('SPRITE:')) ? agent.emoji.split(':')[1] : 'Char1';
        animations = Object.keys(dev.availableAnimationsMap[charId] || { 'Walk': 42, 'Idle': 80 });
    }

    const animOptions = animations.map(a => `<option value="${a}" ${pos.animation === a ? 'selected' : ''}>${a}</option>`).join('');
    const agentOptions = [
        { name: 'All Agents', label: 'All Agents' },
        ...state.projects.map(p => ({ name: p.name, label: p.nickname || p.name }))
    ].map(opt => `<option value="${opt.name}" ${pos.assignee === opt.name ? 'selected' : ''}>${opt.label}</option>`).join('');

    const commonEmojis = ['☕', '🚬', '🛋️', '🍴', '🎧', '💤', '📖', '🚽', '🎮'];
    const emojiButtons = commonEmojis.map(e => 
        `<button class="pos-emoji-chip" style="background:${pos.emoji === e ? '#6366f1' : 'rgba(255,255,255,0.05)'}; border:none; color:#fff; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:16px;">${e}</button>`
    ).join('');

    panel.innerHTML = `
        <div style="font-weight:700; color:#6366f1; font-size:12px; text-transform:uppercase; margin-bottom:4px;">Config Position</div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:6px;">Icon / Emoji</label>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                ${emojiButtons}
            </div>
            <input type="text" id="pos-emoji" value="${pos.emoji}" placeholder="Or type emoji..." style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px; font-size:14px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px; margin-top:4px;">Assignment (Which Agent?)</label>
            <select id="pos-assignee" style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
                ${agentOptions}
            </select>
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Animation (Loop)</label>
            <select id="pos-anim" style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
                ${animOptions}
            </select>
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Command (Terminal)</label>
            <input type="text" id="pos-cmd" value="${pos.command || ''}" placeholder="/coffee" style="width:100%; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
        </div>
        <div style="display:flex; gap:8px;">
            <button id="pos-delete" style="flex:1; padding:6px; background:#f43f5e; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Delete</button>
            <button id="pos-close" style="flex:1; padding:6px; background:#10b981; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Done</button>
        </div>
    `;

    panel.querySelectorAll('.pos-emoji-chip').forEach(btn => {
        btn.onclick = () => {
            pos.emoji = btn.textContent;
            showPositionConfig(index); // Refresh to show active chip
            renderActivePath();
        };
    });

    panel.querySelector('#pos-emoji').oninput = (e) => { pos.emoji = e.target.value; renderActivePath(); };
    panel.querySelector('#pos-assignee').onchange = (e) => { 
        pos.assignee = e.target.value; 
        showPositionConfig(index); // Re-render to update animations dropdown
    };
    panel.querySelector('#pos-anim').onchange = (e) => { pos.animation = e.target.value; };
    panel.querySelector('#pos-cmd').oninput = (e) => { pos.command = e.target.value; };
    panel.querySelector('#pos-delete').onclick = () => {
        state.breakPositions.splice(index, 1);
        hidePositionConfig();
        renderActivePath();
    };
    panel.querySelector('#pos-close').onclick = hidePositionConfig;
}

function hidePositionConfig() {
    const panel = document.querySelector('#dev-pos-config');
    if (panel) panel.classList.add('hidden');
    dev.editingPosition = null;
}

function setDevMode(mode) {
    dev.mode = mode;
    if (mode === 'draw') {
        dev.polygon = []; 
    } else if (mode === 'tweak' && dev.polygon.length === 0) {
        dev.polygon = [...WALKABLE_PATH]; 
    }
    showDevToolbar();
    renderActivePath();
    showToast('info', '⚙️', `Switched to ${mode.toUpperCase()} mode`);
}

function onTweakMove(e) {
    if (dev.draggingIndex === null) return;
    const floorWrapper = document.querySelector('#floor-wrapper');
    const rect = floorWrapper.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = parseFloat(Math.max(0, Math.min(100, x)).toFixed(2));
    y = parseFloat(Math.max(0, Math.min(100, y)).toFixed(2));
    
    dev.polygon[dev.draggingIndex] = {x, y};
    renderActivePath();
}

function onTweakUp() {
    dev.draggingIndex = null;
    document.removeEventListener('mousemove', onTweakMove);
    document.removeEventListener('mouseup', onTweakUp);
}

export function renderActivePath() {
    const targetPolygon = dev.isActive ? dev.polygon : WALKABLE_PATH;
    if (targetPolygon.length < 1) { if (dev.svg) dev.svg.innerHTML = ''; return; }
    
    if (!dev.svg) {
        dev.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dev.svg.id = 'dev-svg-layer';
        dev.svg.setAttribute('viewBox', '0 0 100 100');
        dev.svg.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:30000;');
        const floorWrapper = document.querySelector('#floor-wrapper');
        if (floorWrapper) floorWrapper.appendChild(dev.svg);
    }
    dev.svg.innerHTML = '';
    
    if (targetPolygon.length >= 3) {
        const points = targetPolygon.map(p => `${p.x},${p.y}`).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', points);
        poly.setAttribute('fill', 'rgba(59, 130, 246, 0.2)');
        poly.setAttribute('stroke', '#3b82f6');
        poly.setAttribute('stroke-width', '0.4');
        poly.setAttribute('stroke-dasharray', '1,1');
        dev.svg.appendChild(poly);
    } else if (targetPolygon.length >= 2) {
        for (let i = 0; i < targetPolygon.length - 1; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', targetPolygon[i].x); line.setAttribute('y1', targetPolygon[i].y);
            line.setAttribute('x2', targetPolygon[i+1].x); line.setAttribute('y2', targetPolygon[i+1].y);
            line.setAttribute('stroke', '#3b82f6'); line.setAttribute('stroke-width', '0.4');
            dev.svg.appendChild(line);
        }
    }

    if (dev.isActive) {
        targetPolygon.forEach((p, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
            circle.setAttribute('r', dev.mode === 'tweak' ? '1.2' : '0.8');
            circle.setAttribute('fill', dev.mode === 'tweak' ? '#fbbf24' : '#f43f5e');
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '0.2');
            if (dev.mode === 'tweak') circle.setAttribute('style', 'cursor:move; pointer-events:auto;');
            dev.svg.appendChild(circle);
        });

        // Render Break Positions
        state.breakPositions.forEach((pos, i) => {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('style', 'cursor:pointer; pointer-events:auto;');
            group.onclick = (e) => { e.stopPropagation(); showPositionConfig(i); };

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pos.x); circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', '2');
            circle.setAttribute('fill', 'rgba(99, 102, 241, 0.4)');
            circle.setAttribute('stroke', '#6366f1');
            circle.setAttribute('stroke-width', '0.3');
            group.appendChild(circle);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', pos.x); text.setAttribute('y', pos.y + 0.5);
            text.setAttribute('font-size', '1.5');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = pos.emoji || '📍';
            group.appendChild(text);

            dev.svg.appendChild(group);
        });
    }
}
