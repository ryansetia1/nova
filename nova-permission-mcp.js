#!/usr/bin/env node

const readline = require('readline');

const bridgeUrl = process.env.NOVA_PERMISSION_BRIDGE_URL || 'http://127.0.0.1:3000/api/permission-bridge/request';
const sessionKey = process.env.NOVA_PERMISSION_SESSION || '';

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function extractToolName(args) {
  return args.tool_name || args.toolName || args.name || args.tool || args.toolUseName || 'Tool';
}

function extractToolInput(args) {
  return args.input || args.tool_input || args.toolInput || args.arguments || args.params || {};
}

async function requestPermission(args) {
  const toolName = extractToolName(args);
  const input = extractToolInput(args);
  const response = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionKey,
      toolName,
      input,
      raw: args
    })
  });

  if (!response.ok) {
    return { behavior: 'deny', message: `NOVA permission bridge failed with HTTP ${response.status}.` };
  }

  return response.json();
}

const tool = {
  name: 'approval',
  description: 'Ask the NOVA user to approve or deny a Claude Code tool permission request.',
  inputSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      tool_name: { type: 'string' },
      toolName: { type: 'string' },
      name: { type: 'string' },
      input: { type: 'object', additionalProperties: true },
      tool_input: { type: 'object', additionalProperties: true },
      arguments: { type: 'object', additionalProperties: true }
    }
  }
};

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async line => {
  if (!line.trim()) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch (err) {
    return;
  }

  if (message.id === undefined || message.id === null) return;

  try {
    if (message.method === 'initialize') {
      result(message.id, {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'nova-permission', version: '1.0.0' }
      });
      return;
    }

    if (message.method === 'tools/list') {
      result(message.id, { tools: [tool] });
      return;
    }

    if (message.method === 'tools/call') {
      const { name, arguments: args = {} } = message.params || {};
      if (name !== tool.name) {
        error(message.id, -32602, `Unknown tool: ${name}`);
        return;
      }

      const decision = await requestPermission(args);
      result(message.id, {
        content: [{ type: 'text', text: JSON.stringify(decision) }]
      });
      return;
    }

    result(message.id, {});
  } catch (err) {
    const decision = { behavior: 'deny', message: `NOVA permission bridge error: ${err.message}` };
    if (message.method === 'tools/call') {
      result(message.id, {
        content: [{ type: 'text', text: JSON.stringify(decision) }]
      });
    } else {
      error(message.id, -32603, err.message);
    }
  }
});
