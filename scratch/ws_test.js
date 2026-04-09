const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000?project=test_project');
ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'input', data: 'Write a long poem\r' }));
});
ws.on('message', (data) => {
    const raw = JSON.parse(data).data;
    if (raw && (raw.includes('ing') || raw.includes('...'))) {
        console.log('RECEIVED (JSON):', JSON.stringify(raw));
    }
});
