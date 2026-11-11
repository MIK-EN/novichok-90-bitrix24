import test from 'node:test';
import assert from 'node:assert/strict';
import { BitrixClient } from '../bitrix.mjs';

function fakeClient(handler) {
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const response = handler(url, body, options);
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return new BitrixClient('https://example.bitrix24.ru/rest/1/test-secret', fetchImpl);
}

test('reads an existing Bitrix task by ID through a server-side webhook', async () => {
  const client = fakeClient((url, body, options) => {
    assert.equal(url, 'https://example.bitrix24.ru/rest/1/test-secret/tasks.task.get.json');
    assert.equal(options.method, 'POST');
    assert.deepEqual(body, { taskId: 42 });
    return { result: { task: { id: '42', title: 'Приём: Мария Лескова' } } };
  });
  const task = await client.getTask(42);
  assert.equal(task.title, 'Приём: Мария Лескова');
});

test('creates a help task in Bitrix and returns its ID', async () => {
  const client = fakeClient((url, body) => {
    assert.equal(url, 'https://example.bitrix24.ru/rest/1/test-secret/tasks.task.add.json');
    assert.equal(body.fields.RESPONSIBLE_ID, 1);
    return { result: { task: { id: '73' } } };
  });
  const task = await client.addTask({ TITLE: 'Помочь', RESPONSIBLE_ID: 1 });
  assert.equal(task.id, '73');
});

test('checks task access before accepting a webhook', async () => {
  const client = fakeClient((url, body) => {
    assert.equal(url, 'https://example.bitrix24.ru/rest/1/test-secret/tasks.task.list.json');
    assert.deepEqual(body.filter, {});
    return { result: { tasks: [{ id: '42', title: 'Приём' }] } };
  });
  const tasks = await client.listTasks();
  assert.equal(tasks[0].id, '42');
});

test('reports Bitrix permission failures without leaking the webhook URL', async () => {
  const client = fakeClient(() => ({ error: 'insufficient_scope', error_description: 'No task scope' }));
  await assert.rejects(() => client.getTask(42), error => {
    assert.match(error.message, /insufficient_scope/);
    assert.ok(!error.message.includes('test-secret'));
    return true;
  });
});

test('network errors cannot disclose the webhook secret to the browser', async () => {
  const client = new BitrixClient('https://example.bitrix24.ru/rest/1/test-secret', async () => {
    throw new Error('Failed https://example.bitrix24.ru/rest/1/test-secret/tasks.task.get.json');
  });
  await assert.rejects(() => client.getTask(42), error => {
    assert.ok(!error.message.includes('test-secret'));
    assert.match(error.message, /соедин/);
    return true;
  });
});
