// tg-bot/mcp-client.js — тонкий wrapper вокруг comic-studio MCP server.
//
// Подключается к MCP-серверу через stdio (тот же транспорт, что mcp-server/index.js
// уже предоставляет). Позволяет боту вызывать типизированные MCP-тулы напрямую,
// без LLM в горячем пути. Дополняет /mcode команду: /mcp — для типизированных
// операций (быстро, идемпотентно), /mcode — для задач, требующих рассуждений.
//
// Single-server scope: подключается ТОЛЬКО к comic-studio MCP. Draw Things и
// другие MCP-серверы доступны напрямую через Hermes / IDE — здесь они не
// нужны (см. summary/audit/026_remove-draw-things-orchestrator.md).
//
// ENV:
//   COMIC_STUDIO_PROJECT_ROOT  — путь к проекту (default: ../ относительно tg-bot)
//
// Использование:
//
//   import { createMcpClient, listTools, callTool, closeMcpClient, formatMcpResult }
//     from './mcp-client.js';
//
//   const client = await createMcpClient();
//   const tools = await listTools(client);
//   const result = await callTool(client, 'list_scenarios', { status: 'draft' });
//   const text = formatMcpResult(result);
//   await closeMcpClient(client);
//
// Все результаты — JSON-сериализованные строки (для отправки в Telegram).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PROJECT_ROOT =
  process.env.COMIC_STUDIO_PROJECT_ROOT ||
  new URL('..', import.meta.url).pathname;

const MCP_SERVER_PATH = `${PROJECT_ROOT}mcp-server/index.js`;

/**
 * Создаёт MCP-клиент и подключается к comic-studio MCP-серверу через stdio.
 * Возвращает { client, transport }.
 */
export async function createMcpClient() {
  const transport = new StdioClientTransport({
    command: '/Users/vladteresena/.hermes/node/bin/node',
    args: [MCP_SERVER_PATH],
    cwd: PROJECT_ROOT,
  });

  const client = new Client(
    {
      name: 'comic-studio-tg-bot',
      version: '1.1.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  return { client, transport };
}

export async function closeMcpClient(handle) {
  if (!handle) return;
  try {
    await handle.client.close();
  } catch (e) {
    // ignore — процесс может уже быть мёртв
  }
}

/**
 * Возвращает список тулов [{ name, description, inputSchema }].
 */
export async function listTools(handle) {
  const { tools } = await handle.client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  }));
}

/**
 * Вызывает MCP-тул по имени. args — plain object.
 * Возвращает { content, isError } в формате MCP (content — массив блоков).
 * Для отправки в Telegram — formatMcpResult(result).
 */
export async function callTool(handle, name, args = {}) {
  return handle.client.callTool({ name, arguments: args });
}

/**
 * Удобная обёртка: возвращает строку, безопасную для вставки в Telegram.
 * Склеивает text-блоки в один, помечает image-блоки плейсхолдером.
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
