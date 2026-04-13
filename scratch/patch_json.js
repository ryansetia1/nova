        ws.onmessage = (e) => { 
            try { 
                const msg = JSON.parse(e.data); 
                if (msg.type === 'output') {
                    if (t.uiMode === 'chat' || true) {
                        t.jsonBuffer += msg.data;
                        let lines = t.jsonBuffer.split(/\n|\r\n/);
                        t.jsonBuffer = lines.pop(); // keep remainder
                        lines.forEach(line => {
                            if (!line.trim()) return;
                            try {
                                const parsed = JSON.parse(line);
                                handleChatJsonEvent(t, pName, parsed);
                            } catch(err) {
                                if (t.uiMode === 'chat') {
                                    // Render non-json fallback into chat UI so we can debug!
                                    const raw = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                                    if(raw.trim()){
                                        t.chatMessages.push({ role: 'system', content: raw });
                                        localStorage.setItem('nova-chat-' + pName, JSON.stringify(t.chatMessages));
                                        renderChatMessages(pName);
                                    }
                                } else {
                                    term.write(line + '\r\n');
                                }
                            }
                        });
                        // Handle raw tui thinking fallback in pure terminal mode if we disable backend flag in future
                        if (t.uiMode === 'terminal' && !msg.data.startsWith('{')) {
                            const raw = msg.data;
                            const cleanText = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                            const robot = state.walkingRobots[pName];
                            if (robot) {
                                if(/✽|✢|✥|thinking/i.test(raw)) robot.isThinking = true;
                                renderRobots();
                            }
                        }
                    } else {
                        term.write(msg.data); 
                    }
                }
            } catch (err) {} 
        };
