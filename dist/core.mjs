export const CHECKPOINT_DAYS = [7, 30, 60];

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) throw new Error('Некорректная дата');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getCheckpointState(person, today) {
  return Object.fromEntries(CHECKPOINT_DAYS.map(day => {
    const dueDate = addDays(person.startDate, day);
    const checkin = person.checkpoints?.[day] ?? null;
    const state = checkin?.status === 'help' ? 'help'
      : checkin?.status === 'ok' ? 'done'
      : today > dueDate ? 'overdue'
      : today === dueDate ? 'due' : 'upcoming';
    return [day, { dueDate, state, checkin }];
  }));
}

export function getBoardLane(person, today) {
  const states = Object.values(getCheckpointState(person, today)).map(({ state }) => state);
  if (states.includes('help')) return 'help';
  if (states.includes('overdue') || states.includes('due')) return 'check';
  return 'plan';
}

export function getInitialCheckpointDay(person, today) {
  const checkpoints = getCheckpointState(person, today);
  return CHECKPOINT_DAYS.find(day => checkpoints[day].state === 'help')
    ?? CHECKPOINT_DAYS.find(day => ['overdue', 'due'].includes(checkpoints[day].state))
    ?? CHECKPOINT_DAYS.find(day => checkpoints[day].state === 'upcoming')
    ?? CHECKPOINT_DAYS[0];
}

export function recordCheckin(person, day, checkin) {
  if (!CHECKPOINT_DAYS.includes(Number(day))) throw new Error('Неизвестная контрольная точка');
  if (!['ok', 'help'].includes(checkin?.status)) throw new Error('Выберите результат проверки');
  if (checkin.status === 'help' && !checkin.note?.trim()) throw new Error('Опишите проблему');
  return {
    ...person,
    checkpoints: { ...person.checkpoints, [day]: {
      status: checkin.status,
      note: (checkin.note ?? '').trim(),
      checkedAt: checkin.checkedAt
    }}
  };
}

export function makeHelpTask(person, blocker, deadline) {
  if (!blocker?.trim()) throw new Error('Опишите проблему');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline || '') || Number.isNaN(new Date(`${deadline}T12:00:00Z`).getTime())) {
    throw new Error('Укажите срок решения');
  }
  if (!Number.isInteger(Number(person.managerBitrixId)) || Number(person.managerBitrixId) < 1) {
    throw new Error('Укажите Bitrix ID руководителя');
  }
  return {
    TITLE: `Новичок: помочь ${person.name}`,
    DESCRIPTION: `Сотрудник: ${person.name}\nДолжность: ${person.role}\nПроблема: ${blocker.trim()}\nСвязаться с новичком и зафиксировать решение.`,
    RESPONSIBLE_ID: Number(person.managerBitrixId),
    DEADLINE: `${deadline}T18:00:00+03:00`
  };
}

export async function createHelpCheckin(person, day, { note, checkedAt, deadline }, createTask) {
  if (person.helpTasks?.[day]) throw new Error('Задача помощи уже создана');
  const updated = recordCheckin(person, day, { status: 'help', note, checkedAt });
  const fields = makeHelpTask(person, note, deadline);
  const task = await createTask(fields);
  if (!task?.id) throw new Error('Битрикс24 не вернул ID задачи');
  return { ...updated, helpTasks: { ...person.helpTasks, [day]: task } };
}
