/* ============================================
   NOVA — Dev Tools
   ============================================ */

import { state, dom } from './state.js';
import { showToast, showTooltip, hideTooltip } from './ui.js';
import { WALKABLE_PATH, saveWalkablePath } from './walking.js';

export const dev = { 
    isActive: false, 
    mode: 'draw', 
    polygon: [], 
    originalPolygon: [], 
    originalPositions: [], 
    originalObjects: [],
    originalAmbientObjects: [],
    svg: null, 
    toolbar: null, 
    draggingIndex: null,
    draggingPositionIndex: null, 
    draggingObjectIndex: null,
    draggingAmbientIndex: null,
    editingPosition: null, // index of break position being edited
    editingObject: null, // index of foreground object being edited
    editingAmbient: null, // index of ambient object being edited
    availableAnimationsMap: {}, // { charId: [animations] }
    resizeStart: { w:0, h:0, x:0, y:0 }
};

function getNextDefaultName(type, asset = null) {
    if (type === 'object') {
        const base = (asset || 'Object').charAt(0).toUpperCase() + (asset || 'Object').slice(1);
        const existingCount = state.foregroundObjects.filter(o => o.name && o.name.startsWith(base)).length;
        return `${base} ${existingCount + 1}`;
    } else if (type === 'ambient') {
        const existingCount = state.ambientObjects.filter(p => p.name && p.name.startsWith('Ambient')).length;
        return `Ambient ${existingCount + 1}`;
    } else {
        const existingCount = state.breakPositions.filter(p => p.name && p.name.startsWith('Position')).length;
        return `Position ${existingCount + 1}`;
    }
}

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
                }
            } else if (dev.mode === 'layout') {
                const targetObj = e.target.closest('.workspace-object');
                if (targetObj) {
                    const hitIndex = parseInt(targetObj.getAttribute('data-index'));
                    dev.draggingObjectIndex = hitIndex;
                    dev.editingObject = hitIndex;
                    document.addEventListener('mousemove', onObjectMove);
                    document.addEventListener('mouseup', onObjectUp);
                    showLayoutConfig(hitIndex);
                }
            } else if (dev.mode === 'theatre') {
                const targetAmbient = e.target.closest('.ambient-object-wrapper');
                if (targetAmbient) {
                    const hitIndex = parseInt(targetAmbient.getAttribute('data-index'));
                    dev.draggingAmbientIndex = hitIndex;
                    dev.editingAmbient = hitIndex;
                    document.addEventListener('mousemove', onAmbientMove);
                    document.addEventListener('mouseup', onAmbientUp);
                    showAmbientConfig(hitIndex);
                }
            }
        });
    }
}

function onObjectMove(e) {
    if (dev.draggingObjectIndex === null) return;
    const pt = dev.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(dev.svg.getScreenCTM().inverse());
    
    state.foregroundObjects[dev.draggingObjectIndex].x = parseFloat(svgP.x.toFixed(2));
    state.foregroundObjects[dev.draggingObjectIndex].y = parseFloat(svgP.y.toFixed(2));
    
    // Direct DOM manipulation for fast drag without full re-render
    const el = document.querySelector(`.workspace-object[data-index="${dev.draggingObjectIndex}"]`);
    if (el) {
        el.style.left = parseFloat(svgP.x.toFixed(2)) + '%';
        el.style.top = parseFloat(svgP.y.toFixed(2)) + '%';
    }
    renderActivePath();
}

function onObjectUp() {
    dev.draggingObjectIndex = null;
    document.removeEventListener('mousemove', onObjectMove);
    document.removeEventListener('mouseup', onObjectUp);
}

function onAmbientMove(e) {
    if (dev.draggingAmbientIndex === null) return;
    const floorWrapper = document.querySelector('#floor-wrapper');
    const rect = floorWrapper.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = parseFloat(Math.max(0, Math.min(100, x)).toFixed(2));
    y = parseFloat(Math.max(0, Math.min(100, y)).toFixed(2));
    
    state.ambientObjects[dev.draggingAmbientIndex].x = x;
    state.ambientObjects[dev.draggingAmbientIndex].y = y;
    
    // Fast dynamic update
    const el = document.querySelector(`.ambient-object-wrapper[data-index="${dev.draggingAmbientIndex}"]`);
    if (el) {
        el.style.left = x + '%';
        el.style.top = y + '%';
    }
}

function onAmbientUp() {
    dev.draggingAmbientIndex = null;
    document.removeEventListener('mousemove', onAmbientMove);
    document.removeEventListener('mouseup', onAmbientUp);
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
    dev.originalPolygon = JSON.parse(JSON.stringify(WALKABLE_PATH));
    dev.originalPositions = JSON.parse(JSON.stringify(state.breakPositions));
    dev.originalObjects = JSON.parse(JSON.stringify(state.foregroundObjects));
    dev.originalAmbientObjects = JSON.parse(JSON.stringify(state.ambientObjects));
    
    dev.polygon = [...WALKABLE_PATH];
    document.body.classList.add('drawing-mode');
    
    // Fetch animations for dropdowns
    fetch('/api/character-animations')
        .then(r => r.json())
        .then(data => { dev.availableAnimationsMap = data; });

    // Fetch object assets
    import('./walking.js').then(m => m.loadObjectAssets());

    setDevMode('visualize');
    initDevSvg();
    renderActivePath();
    showToast('info', '🛠️', 'Dev Mode: ON');
}

function renderDevSidebar() {
    const sidebar = document.getElementById('dev-right-sidebar');
    if (!sidebar) return;

    const isPositions = dev.mode === 'positions';
    const isLayout = dev.mode === 'layout';
    const isTheatre = dev.mode === 'theatre';
    
    if (!isPositions && !isLayout && !isTheatre) {
        sidebar.classList.add('hidden');
        return;
    }

    sidebar.classList.remove('hidden');
    
    const entities = isPositions ? state.breakPositions : (isLayout ? state.foregroundObjects : state.ambientObjects);
    const title = isPositions ? 'Workspace Positions' : (isLayout ? 'Workspace Objects' : 'Ambient Objects');
    const icon = isPositions ? '📍' : (isLayout ? '📦' : '🎬');

    sidebar.innerHTML = `
        <div class="dev-sidebar-header">${title}</div>
        <div class="dev-entity-list">
            ${entities.map((ent, i) => `
                <div class="dev-entity-item ${ (isPositions ? dev.editingPosition : (isLayout ? dev.editingObject : dev.editingAmbient)) === i ? 'active' : ''}" data-index="${i}">
                    <span style="font-size:14px;">${ent.emoji || (isPositions ? '📍' : (isLayout ? (state.objectAssets.includes(ent.asset) ? '📦' : '❓') : '🎬'))}</span>
                    <span class="dev-entity-name">${ent.name || (isPositions ? 'Position ' + (i+1) : (isLayout ? ent.asset : 'Ambient ' + (i+1)))}</span>
                    <span class="dev-entity-delete" data-index="${i}">✕</span>
                </div>
            `).join('')}
            ${entities.length === 0 ? '<div style="font-size:11px; opacity:0.3; text-align:center; margin-top:20px;">No entities found</div>' : ''}
            
            <button id="dev-sidebar-add-btn" class="dev-sidebar-main-btn" style="margin-top: 12px; height: 36px; gap: 10px;">
                <span style="font-size: 18px; font-weight: 400; line-height: 1;">+</span>
                <span>${isPositions ? 'Add Position' : (isLayout ? 'Add Object' : 'Add Iframe')}</span>
            </button>
        </div>
    `;

    const addBtn = sidebar.querySelector('#dev-sidebar-add-btn');
    if (addBtn) {
        addBtn.onclick = () => {
            if (isPositions) {
                const id = 'pos_' + Date.now();
                const name = getNextDefaultName('position');
                state.breakPositions.push({ id, name, x: 50, y: 50, emoji: '☕', animation: 'coffee', command: '', assignee: 'All Agents', objectId: null });
                dev.editingPosition = state.breakPositions.length - 1;
                showPositionConfig(state.breakPositions.length - 1);
            } else if (isLayout) {
                const id = 'obj_' + Date.now();
                const asset = state.objectAssets[0] || 'dispenser';
                const name = getNextDefaultName('object', asset);
                state.foregroundObjects.push({ id, name, x: 50, y: 50, rotation: 0, scale: 0.4, asset, layer: 'behind' });
                dev.editingObject = state.foregroundObjects.length - 1;
                showLayoutConfig(state.foregroundObjects.length - 1);
                import('./ui.js').then(m => m.renderForegroundObjects());
            } else if (isTheatre) {
                const id = 'ambient_' + Date.now();
                const name = getNextDefaultName('ambient');
                state.ambientObjects.push({ 
                    id, name, url: '', x: 50, y: 50, 
                    width: 300, height: 180, rotation: 0, scale: 1, skewX: 0, skewY: 0
                });
                dev.editingAmbient = state.ambientObjects.length - 1;
                showAmbientConfig(state.ambientObjects.length - 1);
                import('./ui.js').then(m => m.renderAmbientObjects());
            }
            renderDevSidebar();
            renderActivePath();
        };
    }

    sidebar.querySelectorAll('.dev-entity-item').forEach(item => {
        item.onclick = (e) => {
            if (e.target.classList.contains('dev-entity-delete')) return;
            const idx = parseInt(item.getAttribute('data-index'));
            if (isPositions) showPositionConfig(idx);
            else if (isLayout) showLayoutConfig(idx);
            else showAmbientConfig(idx);
            renderDevSidebar(); 
            renderActivePath();
        };
    });

    sidebar.querySelectorAll('.dev-entity-delete').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'));
            if (isPositions) {
                state.breakPositions.splice(idx, 1);
                hidePositionConfig();
            } else if (isLayout) {
                state.foregroundObjects.splice(idx, 1);
                hideLayoutConfig();
                import('./ui.js').then(m => m.renderForegroundObjects());
            } else {
                state.ambientObjects.splice(idx, 1);
                hideAmbientConfig();
                import('./ui.js').then(m => m.renderAmbientObjects());
            }
            renderDevSidebar();
            renderActivePath();
        };
    });
}

export function exitDevMode(save = true) {
    document.body.classList.remove('drawing-mode');
    document.body.classList.remove('layout-mode');
    document.body.classList.remove('theatre-mode');
    document.body.classList.remove('show-visuals');
    document.body.classList.remove('dev-mode-visualize', 'dev-mode-draw', 'dev-mode-tweak', 'dev-mode-positions', 'dev-mode-layout', 'dev-mode-theatre');
    
    // Clear panels
    const adj = document.getElementById('anchor-adjuster');
    if (adj) adj.classList.remove('active');
    
    const sidebar = document.getElementById('dev-right-sidebar');
    if (sidebar) sidebar.classList.add('hidden');

    hidePositionConfig();
    hideLayoutConfig();
    hideAmbientConfig();

    if (dev.toolbar) dev.toolbar.remove();
    dev.toolbar = null;
    if (save && (dev.polygon.length >= 3 || state.breakPositions.length > 0 || state.foregroundObjects.length > 0 || state.ambientObjects.length > 0)) {
        saveWalkablePath(dev.polygon);
        import('./walking.js').then(m => {
            m.saveBreakPositions(state.breakPositions);
            m.saveForegroundObjects(state.foregroundObjects);
            m.saveAmbientObjects(state.ambientObjects);
        });
    } else if (!save) {
        dev.polygon = [...dev.originalPolygon];
        state.breakPositions = JSON.parse(JSON.stringify(dev.originalPositions));
        state.foregroundObjects = JSON.parse(JSON.stringify(dev.originalObjects));
        state.ambientObjects = JSON.parse(JSON.stringify(dev.originalAmbientObjects));
        
        // Re-render UI to remove discarded objects
        import('./ui.js').then(m => {
            m.renderForegroundObjects();
            m.renderAmbientObjects();
        });
        
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
}



function showDevToolbar() {
    if (dev.toolbar) dev.toolbar.remove();
    dev.toolbar = document.createElement('div');
    dev.toolbar.id = 'dev-toolbar';
    dev.toolbar.setAttribute('style', 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(13,17,28,0.95); padding:8px; border-radius:12px; z-index:40000; border:1px solid #3b82f6; display:flex; gap:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px);');
    
    const btnStyle = 'padding:6px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; cursor:pointer; font-size:12px; transition:all 0.2s;';
    
    dev.toolbar.innerHTML = `
        <button id="dev-btn-visualize" style="${btnStyle} ${dev.mode === 'visualize' ? 'background:#8b5cf6; border-color:#8b5cf6;' : ''}">⚓ Visualize</button>
        <button id="dev-btn-draw" style="${btnStyle} ${dev.mode === 'draw' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🖋️ Draw</button>
        <button id="dev-btn-tweak" style="${btnStyle} ${dev.mode === 'tweak' ? 'background:#3b82f6; border-color:#3b82f6;' : ''}">🎯 Tweak</button>
        <button id="dev-btn-positions" style="${btnStyle} ${dev.mode === 'positions' ? 'background:#6366f1; border-color:#6366f1;' : ''}">📍 Positions</button>
        <button id="dev-btn-layout" style="${btnStyle} ${dev.mode === 'layout' ? 'background:#10b981; border-color:#10b981;' : ''}">📐 Layout</button>
        <button id="dev-btn-theatre" style="${btnStyle} ${dev.mode === 'theatre' ? 'background:#d97706; border-color:#d97706;' : ''}">🎬 Theatre</button>
        <div style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
        <button id="dev-btn-clear" style="${btnStyle}">🗑️ Clear</button>
        <button id="dev-btn-cancel" style="${btnStyle}">❌ Cancel</button>
        <button id="dev-btn-save" style="${btnStyle} background:#3b82f6; border-color:#3b82f6;">✅ Save & Exit</button>
    `;
    
    document.body.appendChild(dev.toolbar);
    
    dev.toolbar.querySelector('#dev-btn-visualize').onclick = (e) => { e.stopPropagation(); setDevMode('visualize'); };
    dev.toolbar.querySelector('#dev-btn-draw').onclick = (e) => { e.stopPropagation(); setDevMode('draw'); };
    dev.toolbar.querySelector('#dev-btn-tweak').onclick = (e) => { e.stopPropagation(); setDevMode('tweak'); };
    dev.toolbar.querySelector('#dev-btn-positions').onclick = (e) => { e.stopPropagation(); setDevMode('positions'); };
    dev.toolbar.querySelector('#dev-btn-layout').onclick = (e) => { e.stopPropagation(); setDevMode('layout'); };
    const theatreBtn = dev.toolbar.querySelector('#dev-btn-theatre');
    if (theatreBtn) theatreBtn.onclick = (e) => { e.stopPropagation(); setDevMode('theatre'); };
    
    dev.toolbar.querySelector('#dev-btn-clear').onclick = () => { 
        if (dev.mode === 'positions') state.breakPositions = [];
        else if (dev.mode === 'layout') { state.foregroundObjects = []; import('./ui.js').then(m => m.renderForegroundObjects()); }
        else if (dev.mode === 'theatre') { state.ambientObjects = []; import('./ui.js').then(m => m.renderAmbientObjects()); }
        else dev.polygon = []; 
        renderActivePath(); 
    };

    dev.toolbar.querySelector('#dev-btn-cancel').onclick = () => { dev.isActive = false; exitDevMode(false); hidePositionConfig(); hideLayoutConfig(); hideAmbientConfig(); };
    dev.toolbar.querySelector('#dev-btn-save').onclick = () => { dev.isActive = false; exitDevMode(true); hidePositionConfig(); hideLayoutConfig(); hideAmbientConfig(); };
}

function showPositionConfig(index) {
    const pos = state.breakPositions[index];
    if (!pos) return;

    let panel = document.querySelector('#dev-pos-config');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'dev-pos-config';
        panel.setAttribute('style', 'position:fixed; top:100px; left:70px; background:rgba(13,17,28,0.95); padding:16px; border-radius:12px; z-index:45000; border:1px solid #6366f1; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px); display:flex; flex-direction:column; gap:12px;');
        const app = document.getElementById('app');
        if (app) app.appendChild(panel);
        else document.body.appendChild(panel);
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
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Name</label>
            <input type="text" id="pos-name" value="${pos.name || ''}" placeholder="e.g. Position 1" style="width:100%; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px; margin-bottom:8px;">
        </div>
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
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Link to Object</label>
            <select id="pos-object-id" style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
                <option value="">— No Object —</option>
                ${state.foregroundObjects.map(obj => `<option value="${obj.id}" ${pos.objectId === obj.id ? 'selected' : ''}>${obj.name || obj.asset}</option>`).join('')}
            </select>
        </div>
        <div style="display:flex; gap:8px;">
            <button id="pos-delete" style="flex:1; padding:6px; background:#f43f5e; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Delete</button>
            <button id="pos-close" style="flex:1; padding:6px; background:#10b981; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Done</button>
        </div>
    `;

    renderDevSidebar(); // Sync sidebar selection

    panel.querySelectorAll('.pos-emoji-chip').forEach(btn => {
        btn.onclick = () => {
            pos.emoji = btn.textContent;
            showPositionConfig(index); // Refresh to show active chip
            renderActivePath();
        };
    });

    panel.querySelector('#pos-name').oninput = (e) => { pos.name = e.target.value; };
    panel.querySelector('#pos-emoji').oninput = (e) => { pos.emoji = e.target.value; renderActivePath(); };
    panel.querySelector('#pos-assignee').onchange = (e) => { 
        pos.assignee = e.target.value; 
        showPositionConfig(index); // Re-render to update animations dropdown
    };
    panel.querySelector('#pos-anim').onchange = (e) => { pos.animation = e.target.value; };
    panel.querySelector('#pos-object-id').onchange = (e) => { pos.objectId = e.target.value || null; import('./ui.js').then(m => m.renderForegroundObjects()); };
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

function showLayoutConfig(index) {
    const obj = state.foregroundObjects[index];
    if (!obj) return;

    let panel = document.querySelector('#dev-layout-config');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'dev-layout-config';
        panel.setAttribute('style', 'position:fixed; top:100px; left:70px; background:rgba(13,17,28,0.95); padding:16px; border-radius:12px; z-index:45000; border:1px solid #10b981; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px); display:flex; flex-direction:column; gap:12px;');
        const app = document.getElementById('app');
        if (app) app.appendChild(panel);
        else document.body.appendChild(panel);
    }
    panel.classList.remove('hidden');

    // Highlight selection in HTML
    document.querySelectorAll('.workspace-object').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`.workspace-object[data-index="${index}"]`);
    if (selected) selected.classList.add('selected');

    const assetOptions = state.objectAssets.map(a => `<option value="${a}" ${obj.asset === a ? 'selected' : ''}>${a}</option>`).join('');

    const isNight = document.body.classList.contains('theme-night');
    const suffix = isNight ? '_night' : '_day';
    const previewUrl = `assets/office/${isNight ? 'night' : 'day'}/objects/${obj.asset}${suffix}.png`;

    panel.innerHTML = `
        <div style="font-weight:700; color:#10b981; font-size:12px; text-transform:uppercase; margin-bottom:4px;">Config Object</div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Name</label>
            <input type="text" id="obj-name" value="${obj.name || ''}" placeholder="e.g. Dispenser 1" style="width:100%; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px; margin-bottom:8px;">
        </div>
        <div id="obj-preview-box" style="width:100%; height:80px; background:rgba(0,0,0,0.3); border-radius:8px; border:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; margin-bottom:8px; overflow:hidden;">
            <img src="${previewUrl}" style="max-width:90%; max-height:90%; object-fit:contain; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));">
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Asset Type</label>
            <select id="obj-asset" style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
                ${assetOptions}
            </select>
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Layer Order</label>
            <select id="obj-layer" style="width:100%; height:32px; background:rgba(13,17,28,1); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px;">
                <option value="behind" ${obj.layer !== 'front' ? 'selected' : ''}>Behind Foreground</option>
                <option value="front" ${obj.layer === 'front' ? 'selected' : ''}>In Front of Foreground</option>
            </select>
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Rotation (${obj.rotation || 0}°)</label>
            <input type="range" id="obj-rot" min="0" max="360" value="${obj.rotation || 0}" style="width:100%;">
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Scale (${(obj.scale || 1).toFixed(2)})</label>
            <input type="range" id="obj-scale" min="0.01" max="2" step="0.01" value="${obj.scale || 0.4}" style="width:100%;">
        </div>
        <div style="display:flex; gap:8px;">
            <button id="obj-delete" style="flex:1; padding:6px; background:#f43f5e; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Delete</button>
            <button id="obj-close" style="flex:1; padding:6px; background:#10b981; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Done</button>
        </div>
    `;

    renderDevSidebar(); // Sync sidebar selection

    panel.querySelector('#obj-name').oninput = (e) => { obj.name = e.target.value; };
    panel.querySelector('#obj-asset').onchange = (e) => { 
        obj.asset = e.target.value; 
        showLayoutConfig(index); // Re-render to update preview
        import('./ui.js').then(m => m.renderForegroundObjects()); 
    };
    panel.querySelector('#obj-layer').onchange = (e) => { obj.layer = e.target.value; import('./ui.js').then(m => m.renderForegroundObjects()); };
    
    const rotLabel = panel.querySelectorAll('label')[2];
    const scaleLabel = panel.querySelectorAll('label')[3];
    
    panel.querySelector('#obj-rot').oninput = (e) => {
        obj.rotation = parseInt(e.target.value);
        rotLabel.textContent = `Rotation (${obj.rotation}°)`;
        import('./ui.js').then(m => m.renderForegroundObjects());
    };
    panel.querySelector('#obj-scale').oninput = (e) => {
        obj.scale = parseFloat(e.target.value);
        scaleLabel.textContent = `Scale (${obj.scale.toFixed(2)})`;
        import('./ui.js').then(m => m.renderForegroundObjects());
    };

    panel.querySelector('#obj-delete').onclick = () => {
        state.foregroundObjects.splice(index, 1);
        hideLayoutConfig();
        import('./ui.js').then(m => m.renderForegroundObjects());
    };
    panel.querySelector('#obj-close').onclick = hideLayoutConfig;
}

function hideLayoutConfig() {
    const panel = document.querySelector('#dev-layout-config');
    if (panel) panel.classList.add('hidden');
    dev.editingObject = null;
    // Remove selection highlight
    document.querySelectorAll('.workspace-object').forEach(el => el.classList.remove('selected'));
}

function setDevMode(mode) {
    dev.mode = mode;
    showDevToolbar();
    
    // Toggle visualization visibility
    if (mode === 'visualize') {
        document.body.classList.add('show-visuals');
        const adj = document.getElementById('anchor-adjuster');
        if (adj) adj.classList.add('active');
    } else {
        document.body.classList.remove('show-visuals');
        const adj = document.getElementById('anchor-adjuster');
        if (adj) adj.classList.remove('active');
    }

    // Update body classes for CSS targeting
    document.body.classList.remove('dev-mode-draw', 'dev-mode-tweak', 'dev-mode-positions', 'dev-mode-layout', 'dev-mode-visualize', 'dev-mode-theatre');
    document.body.classList.add(`dev-mode-${mode}`);
    
    // Sidebar management
    if (mode === 'positions' || mode === 'layout' || mode === 'theatre') {
        renderDevSidebar();
    } else {
        const sidebar = document.getElementById('dev-right-sidebar');
        if (sidebar) sidebar.classList.add('hidden');
    }

    // Close any open config panels when switching modes to prevent stale data
    hidePositionConfig();
    hideLayoutConfig();
    hideAmbientConfig();

    if (mode === 'layout') {
        document.body.classList.add('layout-mode');
    } else {
        document.body.classList.remove('layout-mode');
    }

    if (mode === 'theatre') {
        document.body.classList.add('theatre-mode');
        renderDevSidebar();
        import('./ui.js').then(m => m.renderAmbientObjects());
    } else {
        document.body.classList.remove('theatre-mode');
    }

    // DON'T clear dev.polygon here anymore, let the user use the Clear button
    if (mode === 'tweak' && dev.polygon.length === 0) {
        dev.polygon = [...WALKABLE_PATH]; 
    }
    
    showDevToolbar();
    renderActivePath();
    showToast('info', '⚙️', `Switched to ${mode.toUpperCase()} mode`);
}

export function showAmbientConfig(index) {
    const obj = state.ambientObjects[index];
    if (!obj) return;

    let panel = document.querySelector('#dev-ambient-config');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'dev-ambient-config';
        panel.setAttribute('style', 'position:fixed; top:100px; left:70px; background:rgba(13,17,28,0.95); padding:16px; border-radius:12px; z-index:45000; border:1px solid #d97706; width:240px; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px); display:flex; flex-direction:column; gap:12px;');
        const app = document.getElementById('app');
        if (app) app.appendChild(panel);
        else document.body.appendChild(panel);
    }
    panel.classList.remove('hidden');

    // Highlight selection
    document.querySelectorAll('.ambient-object-wrapper').forEach(el => el.classList.remove('dev-selected'));
    const selected = document.querySelector(`.ambient-object-wrapper[data-index="${index}"]`);
    if (selected) selected.classList.add('dev-selected');

    panel.innerHTML = `
        <div style="font-weight:700; color:#d97706; font-size:12px; text-transform:uppercase; margin-bottom:4px;">Config Ambient</div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Name</label>
            <input type="text" id="amb-name" value="${obj.name || ''}" placeholder="e.g. Laptop Screen" style="width:100%; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px; font-size:10px; margin-bottom:8px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Iframe URL (Leave empty to mirror playlist)</label>
            <input type="text" id="amb-url" value="${obj.url || ''}" placeholder="Optional: YouTube URL" style="width:100%; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; padding:0 8px; font-size:10px;">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div>
                <label style="display:block; font-size:10px; opacity:0.6;">Width</label>
                <input type="number" id="amb-w" value="${obj.width}" style="width:100%; height:32px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:0 8px;">
            </div>
            <div>
                <label style="display:block; font-size:10px; opacity:0.6;">Height</label>
                <input type="number" id="amb-h" value="${obj.height}" style="width:100%; height:32px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:0 8px;">
            </div>
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Rotation (${obj.rotation}°)</label>
            <input type="range" id="amb-rot" min="-180" max="180" value="${obj.rotation}" style="width:100%;">
        </div>
        <div>
            <label style="display:block; font-size:10px; opacity:0.6; margin-bottom:4px;">Scale (${obj.scale.toFixed(2)})</label>
            <input type="range" id="amb-scale" min="0.1" max="3" step="0.1" value="${obj.scale}" style="width:100%;">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div>
                <label style="display:block; font-size:10px; opacity:0.6;">Skew X (${obj.skewX}°)</label>
                <input type="range" id="amb-skew-x" min="-60" max="60" value="${obj.skewX}" style="width:100%;">
            </div>
            <div>
                <label style="display:block; font-size:10px; opacity:0.6;">Skew Y (${obj.skewY}°)</label>
                <input type="range" id="amb-skew-y" min="-60" max="60" value="${obj.skewY}" style="width:100%;">
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="amb-delete" style="flex:1; padding:8px; background:#f43f5e; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Delete</button>
            <button id="amb-close" style="flex:1; padding:8px; background:#10b981; border:none; color:#fff; border-radius:6px; font-size:11px; cursor:pointer;">Done</button>
        </div>
    `;

    panel.querySelector('#amb-name').oninput = (e) => { 
        obj.name = e.target.value; 
        renderDevSidebar();
    };
    panel.querySelector('#amb-url').onchange = (e) => { 
        obj.url = e.target.value; 
        import('./ui.js').then(m => m.renderAmbientObjects()); 
    };
    panel.querySelector('#amb-w').oninput = (e) => { obj.width = parseInt(e.target.value); import('./ui.js').then(m => m.renderAmbientObjects()); };
    panel.querySelector('#amb-h').oninput = (e) => { obj.height = parseInt(e.target.value); import('./ui.js').then(m => m.renderAmbientObjects()); };
    panel.querySelector('#amb-rot').oninput = (e) => { 
        obj.rotation = parseInt(e.target.value); 
        panel.querySelectorAll('label')[4].textContent = `Rotation (${obj.rotation}°)`;
        import('./ui.js').then(m => m.renderAmbientObjects()); 
    };
    panel.querySelector('#amb-scale').oninput = (e) => { 
        obj.scale = parseFloat(e.target.value); 
        panel.querySelectorAll('label')[5].textContent = `Scale (${obj.scale.toFixed(2)})`;
        import('./ui.js').then(m => m.renderAmbientObjects()); 
    };
    panel.querySelector('#amb-skew-x').oninput = (e) => { 
        obj.skewX = parseInt(e.target.value); 
        panel.querySelectorAll('label')[6].textContent = `Skew X (${obj.skewX}°)`;
        import('./ui.js').then(m => m.renderAmbientObjects()); 
    };
    panel.querySelector('#amb-skew-y').oninput = (e) => { 
        obj.skewY = parseInt(e.target.value); 
        panel.querySelectorAll('label')[7].textContent = `Skew Y (${obj.skewY}°)`;
        import('./ui.js').then(m => m.renderAmbientObjects()); 
    };

    panel.querySelector('#amb-delete').onclick = () => {
        state.ambientObjects.splice(index, 1);
        hideAmbientConfig();
        import('./ui.js').then(m => m.renderAmbientObjects());
        renderDevSidebar();
        // Auto-save on delete
        import('./walking.js').then(m => m.saveAmbientObjects(state.ambientObjects));
    };
    panel.querySelector('#amb-close').onclick = () => {
        hideAmbientConfig();
        // Auto-save on done to prevent data loss
        import('./walking.js').then(m => m.saveAmbientObjects(state.ambientObjects));
    };
}

export function hideAmbientConfig() {
    const panel = document.querySelector('#dev-ambient-config');
    if (panel) panel.classList.add('hidden');
    dev.editingAmbient = null;
    document.querySelectorAll('.ambient-object-wrapper').forEach(el => el.classList.remove('dev-selected'));
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
    if (dev.mode === 'theatre' && dev.isActive) {
        if (dev.svg) {
            dev.svg.innerHTML = '';
            dev.svg.style.display = 'none';
        }
        return;
    }
    if (dev.svg) dev.svg.style.display = dev.isActive ? 'block' : 'none';

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
        
        // Muted zone in positions mode
        const opacity = dev.mode === 'positions' ? '0.08' : '0.2';
        poly.setAttribute('fill', `rgba(59, 130, 246, ${opacity})`);
        
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
        // Show polygon vertices only in Draw/Tweak modes
        if (dev.mode === 'draw' || dev.mode === 'tweak') {
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
        }

        // Render Break Positions - only in Positions/Layout mode
        if (dev.mode === 'positions' || dev.mode === 'layout') {
            state.breakPositions.forEach((pos, i) => {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                const isPositionsMode = dev.mode === 'positions';
                group.setAttribute('style', `cursor:${isPositionsMode ? 'pointer' : 'default'}; pointer-events:${isPositionsMode ? 'auto' : 'none'};`);
                
                group.onmousemove = (e) => {
                    if (!isPositionsMode) return;
                    const name = pos.name || `Position ${i + 1}`;
                    showTooltip(name, e.clientX, e.clientY - 40);
                };
                group.onmouseleave = () => {
                    hideTooltip();
                };
                group.onclick = (e) => { 
                    if (!isPositionsMode) return;
                    e.stopPropagation(); 
                    dev.editingPosition = i;
                    showPositionConfig(i); 
                    showDevToolbar();
                };

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pos.x); circle.setAttribute('cy', pos.y);
                circle.setAttribute('r', '2');
                circle.setAttribute('fill', 'rgba(99, 102, 241, 0.2)');
                circle.setAttribute('stroke', '#6366f1');
                circle.setAttribute('stroke-width', '0.2');
                if (dev.editingPosition === i) {
                    circle.setAttribute('stroke-width', '0.5');
                    circle.setAttribute('stroke-dasharray', '0.5,0.5');
                }
                group.appendChild(circle);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', pos.x); text.setAttribute('y', pos.y + 0.6);
                text.setAttribute('font-size', '1.5');
                text.setAttribute('text-anchor', 'middle');
                text.textContent = pos.emoji || '📍';
                group.appendChild(text);

                dev.svg.appendChild(group);
            });
        }
    }
}
