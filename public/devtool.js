/* ============================================
   NOVA — Dev Tools
   ============================================ */

import { state, dom } from './state.js';
import { showToast } from './ui.js';
import { WALKABLE_PATH, saveWalkablePath } from './walking.js';

export const dev = { isActive: false, mode: 'draw', polygon: [], originalPolygon: [], svg: null, toolbar: null, draggingIndex: null };

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
            }
        });
    }
}

function enterDevMode() {
    dev.originalPolygon = [...WALKABLE_PATH];
    dev.polygon = [...WALKABLE_PATH];
    document.body.classList.add('drawing-mode');
    showDevToolbar();
    initDevSvg();
    renderActivePath();
    showToast('info', '🛠️', 'Dev Mode: ON. Use toolbar to Draw or Tweak.');
}

function exitDevMode(save = true) {
    document.body.classList.remove('drawing-mode');
    if (dev.toolbar) dev.toolbar.remove();
    dev.toolbar = null;
    if (save && dev.polygon.length >= 3) {
        saveWalkablePath(dev.polygon);
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
        <div style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
        <button id="dev-btn-clear" style="${btnStyle}">🗑️ Clear</button>
        <button id="dev-btn-cancel" style="${btnStyle}">❌ Cancel</button>
        <button id="dev-btn-save" style="${btnStyle} background:#10b981; border-color:#10b981;">✅ Save & Exit</button>
    `;
    
    document.body.appendChild(dev.toolbar);
    
    dev.toolbar.querySelector('#dev-btn-draw').onclick = () => setDevMode('draw');
    dev.toolbar.querySelector('#dev-btn-tweak').onclick = () => setDevMode('tweak');
    dev.toolbar.querySelector('#dev-btn-clear').onclick = () => { dev.polygon = []; renderActivePath(); };
    dev.toolbar.querySelector('#dev-btn-cancel').onclick = () => { dev.isActive = false; exitDevMode(false); };
    dev.toolbar.querySelector('#dev-btn-save').onclick = () => { dev.isActive = false; exitDevMode(true); };
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
    }
}
