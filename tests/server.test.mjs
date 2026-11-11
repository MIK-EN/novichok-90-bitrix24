import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi, validateWebhookUrl } from '../server.mjs';

const client = {
  base: 'https://example.bitrix24.ru/rest/1/secret',
  async getTask(id) { return { id: String(id), title: 'Приём: Мария Лескова' }; },
  async addTask(fields) { return { id: '73', title: fields.TITLE }; }
};

test('status exposes portal address but never webhook secret', async () => {
  const response = await handleApi({ method: 'GET', url: '/api/status' }, client);
  assert.deepEqual(response.body, { connected: true, portal: 'https://example.bitrix24.ru' });
  assert.ok(!JSON.stringify(response.body).includes('secret'));
});

test('task lookup validates IDs before calling Bitrix', async () => {
  const response = await handleApi({ method: 'POST', url: '/api/task/get', body: { taskId: 'nope' } }, client);
  assert.equal(response.status, 400);
});

test('task lookup returns a safe link to the actual Bitrix task', async () => {
  const response = await handleApi({ method: 'POST', url: '/api/task/get', body: { taskId: 42 } }, client);
  assert.equal(response.body.task.title, 'Приём: Мария Лескова');
  assert.equal(response.body.link, 'https://example.bitrix24.ru/company/personal/user/1/tasks/task/view/42/');
});

test('task links use the webhook owner ID instead of assuming employee 1', async () => {
  const otherClient = { ...client, base: 'https://example.bitrix24.ru/rest/7/secret' };
  const response = await handleApi({ method: 'POST', url: '/api/task/get', body: { taskId: 42 } }, otherClient);
  assert.equal(response.body.link, 'https://example.bitrix24.ru/company/personal/user/7/tasks/task/view/42/');
});

test('local setup accepts a Bitrix webhook and rejects external URLs', () => {
  assert.equal(validateWebhookUrl('https://team.bitrix24.ru/rest/7/secret'), 'https://team.bitrix24.ru/rest/7/secret');
  assert.throws(() => validateWebhookUrl('http://team.bitrix24.ru/rest/7/secret'), /HTTPS/);
  assert.throws(() => validateWebhookUrl('https://evil.example/rest/7/secret'), /Битрикс24/);
});
