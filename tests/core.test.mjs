import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../dist/core.mjs';
const { getCheckpointState, getBoardLane, getInitialCheckpointDay, recordCheckin, makeHelpTask, createHelpCheckin } = core;

const newcomer = {
  id: 'n1', name: 'Мария Лескова', role: 'Продавец-консультант', department: 'Магазин',
  startDate: '2026-11-01', manager: 'Анна', managerBitrixId: 1,
  checkpoints: { 7: null, 30: null, 60: null }
};

test('seven-day check becomes overdue after its date while later checks stay upcoming', () => {
  const state = getCheckpointState(newcomer, '2026-11-11');
  assert.equal(state[7].state, 'overdue');
  assert.equal(state[30].state, 'upcoming');
  assert.equal(state[7].dueDate, '2026-11-08');
});

test('recording a blocker preserves the check-in and identifies the next action', () => {
  const updated = recordCheckin(newcomer, 7, {
    status: 'help', note: 'Нет доступа к кассе', checkedAt: '2026-11-11'
  });
  assert.equal(updated.checkpoints[7].note, 'Нет доступа к кассе');
  assert.equal(getCheckpointState(updated, '2026-11-11')[7].state, 'help');
  assert.equal(newcomer.checkpoints[7], null);
});

test('help task addresses the manager and states the concrete blocker', () => {
  const fields = makeHelpTask(newcomer, 'Нет доступа к кассе', '2026-11-13');
  assert.equal(fields.RESPONSIBLE_ID, 1);
  assert.match(fields.TITLE, /Мария Лескова/);
  assert.match(fields.DESCRIPTION, /Нет доступа к кассе/);
  assert.match(fields.DEADLINE, /^2026-11-13T/);
});

test('empty blocker cannot create a help task', () => {
  assert.throws(() => makeHelpTask(newcomer, '  ', '2026-11-13'), /проблем/);
});

test('help task rejects an empty deadline instead of sending an invalid date to Bitrix', () => {
  assert.throws(() => makeHelpTask(newcomer, 'Нет доступа', ''), /срок/);
});

test('board puts unresolved help ahead of an overdue checkpoint', () => {
  const person = { ...newcomer, checkpoints: { ...newcomer.checkpoints, 7: { status: 'help', note: 'Нет доступа', checkedAt: '2026-11-08' } } };
  assert.equal(getBoardLane(person, '2026-12-15'), 'help');
  assert.equal(getBoardLane(newcomer, '2026-11-11'), 'check');
  assert.equal(getBoardLane({ ...newcomer, startDate: '2026-11-10' }, '2026-11-11'), 'plan');
});

test('opening a board card selects its first check needing action', () => {
  const person = { ...newcomer, checkpoints: { 7: { status: 'ok', note: '', checkedAt: '2026-11-08' }, 30: null, 60: null }, startDate: '2026-10-01' };
  assert.equal(getInitialCheckpointDay(person, '2026-11-11'), 30);
  assert.equal(getInitialCheckpointDay({ ...newcomer, startDate: '2026-11-10' }, '2026-11-11'), 7);
});

test('help check-in records the result only after a task is created', async () => {
  let sentFields;
  const updated = await createHelpCheckin(newcomer, 7, { note: 'Нет доступа к кассе', checkedAt: '2026-11-11', deadline: '2026-11-13' }, async fields => {
    sentFields = fields;
    return { id: 42, link: 'https://example.bitrix24.ru/tasks/42' };
  });
  assert.match(sentFields.DESCRIPTION, /Нет доступа к кассе/);
  assert.equal(updated.checkpoints[7].status, 'help');
  assert.equal(updated.helpTasks[7].id, 42);
  assert.equal(newcomer.checkpoints[7], null);
});

test('failed Bitrix task creation does not record a help check-in', async () => {
  await assert.rejects(createHelpCheckin(newcomer, 7, { note: 'Нет доступа', checkedAt: '2026-11-11', deadline: '2026-11-13' }, async () => {
    throw new Error('Нет соединения');
  }), /Нет соединения/);
  assert.equal(newcomer.checkpoints[7], null);
});
