export function handleModeSwitch(pName, newMode) {
    const t = state.terminals[pName];
    if (!t) return;
    if (t.uiMode === newMode) return;
    
    t.uiMode = newMode;
    
    // update meta
    fetch('/api/update-emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pName, uiMode: newMode })
    });
    
    updateModeUI(pName);
    
    // Restart WS to apply new stream flags
    if (t.ws) {
        try { t.ws.close(); } catch(e) {}
    }
    t.term.clear();
    t.jsonBuffer = '';
    
    // Re-instantiate
    t.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(pName)}&uiMode=${encodeURIComponent(t.uiMode)}`);
    bindWsEvents(t, pName);
}

export function updateModeUI(pName) {
    const t = state.terminals[pName];
    if (!t || !t.panel) return;
    
    const chatContainer = t.panel.querySelector('.chat-container');
    const termContainer = t.panel.querySelector('.terminal-container');
    const modeChatBtn = t.panel.querySelector('.mode-chat');
    const modeTermBtn = t.panel.querySelector('.mode-term');
    
    if (t.uiMode === 'chat') {
        if(chatContainer) chatContainer.classList.remove('hidden');
        if(termContainer) termContainer.classList.add('hidden');
        if(modeChatBtn) modeChatBtn.classList.add('active');
        if(modeTermBtn) modeTermBtn.classList.remove('active');
    } else {
        if(chatContainer) chatContainer.classList.add('hidden');
        if(termContainer) termContainer.classList.remove('hidden');
        if(modeTermBtn) modeTermBtn.classList.add('active');
        if(modeChatBtn) modeChatBtn.classList.remove('active');
    }
}

export function renderChatMessages(pName) {
    const t = state.terminals[pName];
    if (!t || !t.panel) return;
    const msgContainer = t.panel.querySelector('.chat-messages');
    if (!msgContainer) return;
    
    if (t.chatMessages.length === 0) {
        msgContainer.innerHTML = '<div class="chat-empty-state">No messages yet. Start chatting!</div>';
        return;
    }
    
    msgContainer.innerHTML = t.chatMessages.map(m => {
        let text = (m.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return `<div class="chat-bubble ${m.role}">${text}</div>`;
    }).join('');
    
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

export function handleChatJsonEvent(t, pName, parsed) {
    let lastMsg = t.chatMessages[t.chatMessages.length - 1];
    
    // General text extraction heuristic
    const textFragment = parsed.text || parsed.content || (parsed.delta && parsed.delta.text);
    
    if (textFragment && typeof textFragment === 'string') {
        if (!lastMsg || lastMsg.role !== 'assistant') {
            t.chatMessages.push({ role: 'assistant', content: textFragment });
        } else {
            lastMsg.content += textFragment;
        }
        
        // Save to local storage
        localStorage.setItem('nova-chat-' + pName, JSON.stringify(t.chatMessages));
        renderChatMessages(pName);
        
        // Terminal rendering if in terminal mode but stream is forced
        if (t.uiMode === 'terminal') {
            // Write to terminal to emulate logs
            t.term.write(textFragment);
        }
        
        // Walking robots integration
        const robot = state.walkingRobots[pName];
        if (robot) {
            robot.hasError = false;
            robot.isThinking = false;
            robot.hasUpdate = true;
            renderRobots();
        }
    } else if (parsed.type === 'thinking' || parsed.type === 'message_start' || parsed.thinking) {
        // Thinking state
        const robot = state.walkingRobots[pName];
        if (robot) {
            robot.isThinking = true;
            renderRobots();
        }
    }
}

export function bindWsEvents(t, pName) {
    t.ws.onopen = () => { 
        setTimeout(() => { 
            if (t.ws.readyState === WebSocket.OPEN) { 
                try { t.fitAddon.fit(); } catch(e) {}
                t.ready = true; 
                renderRobots(); 
                renderActivityBar(pName, t.panel);
            } 
        }, 1000); 
    };
    t.ws.onmessage = (e) => { 
        try { 
            const msg = JSON.parse(e.data); 
            if (msg.type === 'output') {
                if (t.uiMode === 'chat' || true) { // We forced backend to stream. So it's always JSON fragment
                    // Accumulate buffer
                    t.jsonBuffer += msg.data;
                    let lines = t.jsonBuffer.split(/\n|\r\n/);
                    t.jsonBuffer = lines.pop(); // keep last incomplete line
                    lines.forEach(line => {
                        if (!line.trim()) return;
                        // For pure terminal mode (non-JSON), it will fail to parse and fallback
                        try {
                            const parsed = JSON.parse(line);
                            handleChatJsonEvent(t, pName, parsed);
                        } catch(err) {
                            // If it's pure terminal (the base command without stream), we fallback to direct write
                            if (t.uiMode === 'terminal') {
                                t.term.write(line + '\r\n');
                            }
                        }
                    });
                    
                    // Fallback walking robot checks for non-json
                    if (t.uiMode === 'terminal' && !msg.data.startsWith('{')) {
                        const raw = msg.data;
                        const cleanText = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                        // Check normal TUI thinking
                        const robot = state.walkingRobots[pName];
                        if (robot) {
                           if(/✽|✢|✥|thinking/i.test(raw)) robot.isThinking = true;
                           renderRobots();
                        }
                    }
                } else {
                    t.term.write(msg.data); 
                }
            }
        } catch (err) {} 
    };
}
