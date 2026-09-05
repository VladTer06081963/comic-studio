// tg-bot/mcp-client.js — multi-server MCP client.
//
// Подключается ко всем MCP-серверам из ~/.minimax/mcp.json (или $MINIMAX_MCP_CONFIG)
// и предоставляет единый API для бота:
//
//   import { listAllTools, callTool, closeAll, resolveToolServer, formatMcpResult }
//     from './mcp-client.js';
//
//   const tools = await listAllTools();          // [ { server, name, description, inputSchema } ]
//   const r = await callTool('generate_image', { prompt: 'a cat' });
//   await closeAll();
//
// Серверы ленивые — transport создаётся при первом вызове и кэшируется.
// При вызове callTool без явного server берётся первый сервер, у которого
// есть инструмент с таким именем; в multi-server среде используй resolveToolServer
// для разрешения неоднозначностей.
//
// Ошибки и метаданные: каждый callTool возвращает MCP-совместимый
// { content: [...], isError: bool }; formatMcpResult склеивает content в
// текст для отправки в Telegram.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MCP_CONFIG_PATH =
  process.env.MINIMAX_MCP_CONFIG ||
  path.join(os.homedir(), '.minimax', 'mcp.json');

// Default node binary — same as Hermes uses. Override via env if needed.
const NODE_BIN = process.env.MCP_NODE_BIN || '/Users/vladteresena/.hermes/node/bin/node';

/**
 * Read mcp.json and return a { serverName: { command, args, cwd, env } } map.
 * Throws on parse error or missing file (intentional — fail fast).
 */
function readMcpConfig() {
  const raw = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  const servers = parsed.mcpServers || parsed.mcp_servers || {};
  return Object.fromEntries(
    Object.entries(servers).map(([name, cfg]) => [
      name,
      {
        command: cfg.command,
        args: cfg.args || [],
        cwd: cfg.cwd,
        env: cfg.env || {},
      },
    ])
  );
}

/**
 * Lazy registry: serverName → { client, transport } (created on demand).
 * Lazy keeps startup fast and avoids spawning servers that won't be used
 * in a given session.
 */
const registry = new Map();
let configCache = null;

function getConfig() {
  if (!configCache) configCache = readMcpConfig();
  return configCache;
}

export function getMcpClient(serverName) {
  if (registry.has(serverName)) return registry.get(serverName);
  const cfg = getConfig()[serverName];
  if (!cfg) {
    throw new Error(
      `MCP server "${serverName}" not found in ${MCP_CONFIG_PATH}. ` +
        `Available: ${Object.keys(getConfig()).join(', ') || '(none)'}`
    );
  }
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    cwd: cfg.cwd,
    env: cfg.env,
  });
  const client = new Client(
    { name: 'comic-studio-tg-bot', version: '1.1.0' },
    { capabilities: {} }
  );
  return { client, transport, _pending: true };
}

async function connect(serverName) {
  if (registry.has(serverName)) {
    const entry = registry.get(serverName);
    if (entry._pending) {
      await entry.client.connect(entry.transport);
      entry._pending = false;
    }
    return entry;
  }
  const entry = getMcpClient(serverName);
  await entry.client.connect(entry.transport);
  entry._pending = false;
  registry.set(serverName, entry);
  return entry;
}

export async function closeAll() {
  const closers = [];
  for (const [, entry] of registry) {
    if (!entry._pending) {
      closers.push(
        entry.client.close().catch(() => {
          // process may already be dead; ignore
        })
      );
    }
  }
  await Promise.all(closers);
  registry.clear();
}

/**
 * List tools across all configured servers.
 * Returns: [ { server, name, description, inputSchema } ]
 */
export async function listAllTools() {
  const config = getConfig();
  const out = [];
  for (const name of Object.keys(config)) {
    try {
      const entry = await connect(name);
      const { tools } = await entry.client.listTools();
      for (const t of tools) {
        out.push({
          server: name,
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        });
      }
    } catch (e) {
      // one server failing shouldn't kill the whole listing
      out.push({ server: name, name: '__error__', description: String(e.message || e) });
    }
  }
  return out;
}

/**
 * Find which server has a tool with this name. Returns server name or null.
 */
export function resolveToolServer(toolName, tools) {
  const candidates = (tools || []).filter((t) => t.name === toolName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].server;
  return candidates[0].server; // pick first on conflict; bot can warn user
}

/**
 * Call a tool by name. If `serverName` is given, dispatch to that server.
 * Otherwise pick the first server that has the tool.
 */
export async function callTool(name, args = {}, serverName = null) {
  let server = serverName;
  if (!server) {
    const tools = await listAllTools();
    server = resolveToolServer(name, tools);
    if (!server) {
      throw new Error(
        `Tool "${name}" not found in any configured MCP server. ` +
          `Try /mcp_list to see what's available.`
      );
    }
  }
  const entry = await connect(server);
  return entry.client.callTool({ name, arguments: args });
}

/**
 * Format MCP tool result into a single string for Telegram.
 * Concatenates text blocks, notes image blocks.
 */
export function formatMcpResult(result) {
  if (!result) return '(нет вывода)';
  if (result.isError) {
    const errText = (result.content || [])
      .map((b) => (b.type === 'text' ? b.text : JSON.stringify(b)))
      .join('\n');
    return `❌ MCP error: ${errText}`;
  }
  const blocks = result.content || [];
  const text = blocks
    .map((b) => {
      if (b.type === 'text') return b.text;
      if (b.type === 'image') return `[image: ${b.mimeType || 'image'}, ${b.data?.length || 0} chars base64]`;
      return JSON.stringify(b);
    })
    .join('\n');
  return text || '(нет вывода)';
}

// ── Backwards-compat exports (old single-server API) ─────────────────────────
// The original mcp-client.js exposed createMcpClient / listTools / callTool /
// closeMcpClient. Keep them as thin wrappers so existing code still works.

export async function createMcpClient() {
  // Returns the comic-studio handle (most common case). New code should use
  // connect() directly or the new getMcpClient() + listAllTools() flow.
  const { client, transport } = await connect('comic-studio');
  return { client, transport };
}

export async function listTools(handle) {
  if (handle) {
    const { tools } = await handle.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
  }
  return listAllTools().then((all) =>
    all.filter((t) => t.name !== '__error__').map(({ server, ...rest }) => rest)
  );
}
