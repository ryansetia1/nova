        const modeChatBtn = panel.querySelector('.mode-chat');
        const modeTermBtn = panel.querySelector('.mode-term');
        const chatContainer = panel.querySelector('.chat-container');
        const chatInput = panel.querySelector('.chat-input');
        const chatSendBtn = panel.querySelector('.chat-send-btn');
        
        if (modeChatBtn && modeTermBtn) {
            modeChatBtn.addEventListener('click', (e) => { e.stopPropagation(); window.switchUiMode(pName, 'chat'); });
            modeTermBtn.addEventListener('click', (e) => { e.stopPropagation(); window.switchUiMode(pName, 'terminal'); });
        }
        
        if (chatSendBtn && chatInput) {
            const sendChat = () => {
                const val = chatInput.value.trim();
                if (!val) return;
                
                // Add to messages UI as user
                t.chatMessages.push({ role: 'user', content: val });
                localStorage.setItem('nova-chat-' + pName, JSON.stringify(t.chatMessages));
                window.renderChatMessages(pName);
                
                // Send to backend
                if (t.ws && t.ws.readyState === WebSocket.OPEN) {
                    t.ws.send(JSON.stringify({ type: 'input', data: JSON.stringify({type: "message", content: val}) + '\n' }));
                }
                chatInput.value = '';
                chatInput.focus();
            };
            
            chatSendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                sendChat();
            });
            
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                }
            });
        }
