import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BitrixClient } from './bitrix.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript' };
export function validateWebhookUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Укажите URL вебхука'); }
  if (url.protocol !== 'https:') throw new Error('Для вебхука нужен HTTPS');
  if (!url.hostname.endsWith('.bitrix24.ru')) throw new Error('Ожидается адрес портала Битрикс24');
  if (!/^\/rest\/\d+\/[^/]+\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('Некорректный URL вебхука');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
function taskLink(client, id) {
  const url = new URL(client.base);
  const ownerId = url.pathname.match(/^\/rest\/(\d+)\//)?.[1] || '1';
  return `${url.origin}/company/personal/user/${ownerId}/tasks/task/view/${id}/`;
}

export async function handleApi({ method, url, body }, client) {
  if (url === '/api/status' && method === 'GET') {
    return { status: 200, body: client
      ? { connected: true, portal: new URL(client.base).origin }
      : { connected: false, portal: null } };
  }
  if (!client) return { status: 503, body: { error: 'Вебхук Битрикс24 не настроен' } };
  if (url === '/api/task/get' && method === 'POST') {
    const id = Number(body?.taskId);
    if (!Number.isSafeInteger(id) || id < 1) return { status: 400, body: { error: 'Укажите ID задачи' } };
    try {
      const task = await client.getTask(id);
      return { status: 200, body: { task, link: taskLink(client, id) } };
    } catch (error) { return { status: 502, body: { error: error.message } }; }
  }
  if (url === '/api/task/add' && method === 'POST') {
    const fields = body?.fields;
    if (!fields?.TITLE || !Number.isSafeInteger(Number(fields.RESPONSIBLE_ID))) {
      return { status: 400, body: { error: 'Укажите название и ответственного' } };
    }
    try {
      const task = await client.addTask(fields);
      return { status: 200, body: { task, link: taskLink(client, task.id) } };
    } catch (error) { return { status: 502, body: { error: error.message } }; }
  }
  return { status: 404, body: { error: 'Неизвестный адрес' } };
}

export function startServer({ webhookUrl = process.env.BITRIX_WEBHOOK_URL, port = Number(process.env.PORT || 4173) } = {}) {
  let client = webhookUrl ? new BitrixClient(validateWebhookUrl(webhookUrl)) : null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost').pathname;
    if (url.startsWith('/api/')) {
      let body = {};
      try {
        if (req.method === 'POST') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        }
        let result;
        if (url === '/api/connect' && req.method === 'POST') {
          try {
            const candidate = new BitrixClient(validateWebhookUrl(body.webhookUrl));
            await candidate.listTasks();
            client = candidate;
            result = { status: 200, body: { connected: true, portal: new URL(candidate.base).origin } };
          } catch (error) { result = { status: 400, body: { error: error.message } }; }
        } else result = await handleApi({ method: req.method, url, body }, client);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result.body));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Некорректный запрос' }));
      }
      return;
    }
    const file = url === '/' ? '/index.html' : url;
    const path = resolve(root, `.${file}`);
    if (!path.startsWith(root + '/') && path !== join(root, 'index.html')) {
      res.writeHead(403); res.end(); return;
    }
    try {
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8` });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Не найдено');
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
  console.log('Новичок: http://127.0.0.1:4173');
}
