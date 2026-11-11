import test from 'node:test';
import assert from 'node:assert/strict';
import { getCheckpointState, recordCheckin, makeHelpTask } from '../dist/core.mjs';

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
