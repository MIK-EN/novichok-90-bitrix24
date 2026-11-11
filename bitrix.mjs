export class BitrixClient {
  constructor(webhookUrl, fetchImpl = fetch) {
    if (!webhookUrl) throw new Error('Не задан BITRIX_WEBHOOK_URL');
    this.base = webhookUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async call(method, payload) {
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new Error('Нет соединения с Битрикс24');
    }
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(`Битрикс24: ${data.error || response.status} — ${data.error_description || 'Ошибка запроса'}`);
    }
    return data.result;
  }

  async getTask(taskId) {
    const result = await this.call('tasks.task.get', { taskId: Number(taskId) });
    return result.task;
  }

  async listTasks() {
    const result = await this.call('tasks.task.list', { filter: {}, select: ['ID', 'TITLE'], start: 0 });
    return result.tasks ?? [];
  }

  async addTask(fields) {
    const result = await this.call('tasks.task.add', { fields });
    return result.task;
  }
}
