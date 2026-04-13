        const uiMode = meta ? (meta.uiMode || 'chat') : 'chat';
        
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}?project=${encodeURIComponent(pName)}&uiMode=${encodeURIComponent(uiMode)}`);
        
        t = { 
            term, fitAddon: fit, ws, panel, container, ready: false, 
            thinkingTimer: null, isMaximized: false, prevRect: null,
            uploads: [], uiMode, chatMessages: [], jsonBuffer: ''
        };
        state.terminals[pName] = t;

        // Apply UI mode visibility
        const chatContainer = panel.querySelector('.chat-container');
        const modeChatBtn = panel.querySelector('.mode-chat');
        const modeTermBtn = panel.querySelector('.mode-term');
        
        if (uiMode === 'chat') {
            container.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            if(modeChatBtn) modeChatBtn.classList.add('active');
            if(modeTermBtn) modeTermBtn.classList.remove('active');
        } else {
            container.classList.remove('hidden');
            chatContainer.classList.add('hidden');
            if(modeTermBtn) modeTermBtn.classList.add('active');
            if(modeChatBtn) modeChatBtn.classList.remove('active');
        }

        // Restore history
        try {
            const hist = localStorage.getItem('nova-chat-' + pName);
            if (hist) t.chatMessages = JSON.parse(hist);
            renderChatMessages(pName, t);
        } catch(e) {}
