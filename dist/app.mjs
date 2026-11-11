import { addDays, getCheckpointState, recordCheckin, makeHelpTask, CHECKPOINT_DAYS } from './core.mjs';

const $ = selector => document.querySelector(selector);
const today = new Date().toLocaleDateString('sv-SE');
const labels = { upcoming: 'Позже', due: 'Сегодня', overdue: 'Просрочено', help: 'Нужна помощь', done: 'Проверено' };
const seed = [
  { id:'n1', name:'Мария Лескова', role:'Продавец-консультант', department:'Магазин', startDate:addDays(today,-19), manager:'Анна Викторова', managerBitrixId:1, checkpoints:{7:{status:'help',note:'Не выдали доступ к кассовой программе',checkedAt:addDays(today,-12)},30:null,60:null}, helpTasks:{} },
  { id:'n2', name:'Илья Миронов', role:'Комплектовщик', department:'Склад', startDate:addDays(today,-11), manager:'Олег Баранов', managerBitrixId:1, checkpoints:{7:null,30:null,60:null}, helpTasks:{} },
  { id:'n3', name:'Денис Белов', role:'Менеджер по продажам', department:'Отдел продаж', startDate:addDays(today,-38), manager:'Елена Крылова', managerBitrixId:1, checkpoints:{7:{status:'ok',note:'Освоил процессы и знает, к кому обратиться',checkedAt:addDays(today,-31)},30:null,60:null}, helpTasks:{} },
  { id:'n4', name:'Ольга Карпова', role:'Товаровед', department:'Магазин', startDate:addDays(today,-5), manager:'Анна Викторова', managerBitrixId:1, checkpoints:{7:null,30:null,60:null}, helpTasks:{} },
  { id:'n5', name:'Артём Зорин', role:'Оператор склада', department:'Склад', startDate:addDays(today,-67), manager:'Олег Баранов', managerBitrixId:1, checkpoints:{7:{status:'ok',note:'',checkedAt:addDays(today,-60)},30:{status:'ok',note:'',checkedAt:addDays(today,-37)},60:null}, helpTasks:{} },
  { id:'n6', name:'Ника Беляева', role:'Офис-менеджер', department:'Офис', startDate:addDays(today,-31), manager:'Сергей Волков', managerBitrixId:1, checkpoints:{7:{status:'ok',note:'',checkedAt:addDays(today,-24)},30:{status:'help',note:'Нет понятного списка приоритетов на неделю',checkedAt:addDays(today,-1)},60:null}, helpTasks:{} }
];
const storageKey = 'novichok-demo-v1';
let people;
try { people = JSON.parse(localStorage.getItem(storageKey)) || structuredClone(seed); }
catch { people = structuredClone(seed); }
let selectedId = people[0]?.id;
let selectedDay = 7;
let filter = 'all';
let query = '';
let live = false;
let portal = null;

function persist() { localStorage.setItem(storageKey, JSON.stringify(people)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pretty(date) { return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`)); }
function age(person) { return Math.max(1,Math.floor((new Date(`${today}T12:00:00Z`)-new Date(`${person.startDate}T12:00:00Z`))/86400000)+1); }
function stateOf(person) {
  const states = Object.values(getCheckpointState(person,today)).map(x=>x.state);
  return states.includes('help') ? 'help' : states.includes('overdue') ? 'overdue' : states.includes('due') ? 'due' : 'upcoming';
}
function statusText(state) { return labels[state] || state; }
function toast(message) { const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3500); }

function render() {
  $('#today').textContent = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
  $('#metric-total').textContent = people.length;
  $('#metric-due').textContent = people.filter(p=>['due','overdue'].includes(stateOf(p))).length;
  $('#metric-help').textContent = people.filter(p=>stateOf(p)==='help').length;
  const visible = people.filter(p => (filter==='all'||['help','due','overdue'].includes(stateOf(p))) && `${p.name} ${p.department}`.toLowerCase().includes(query));
  $('#people').innerHTML = visible.length ? visible.map((p,i) => `<button class="person-card ${p.id===selectedId?'selected':''}" data-person="${esc(p.id)}" type="button"><span class="avatar ${i%3===1?'purple':i%3===2?'amber':''}">${esc(p.name.split(' ').map(s=>s[0]).slice(0,2).join(''))}</span><span class="person-main"><strong>${esc(p.name)}</strong><small>${esc(p.role)} · ${esc(p.department)} · день ${age(p)}</small></span><span class="status ${stateOf(p)}">${statusText(stateOf(p))}</span></button>`).join('') : '<div class="empty">Никого не нашли.<br>Попробуйте другой поиск или фильтр.</div>';
  renderDetail();
}

function renderDetail() {
  const p=people.find(x=>x.id===selectedId);
  if (!p) { $('#detail').innerHTML='<div class="detail-placeholder"><div><span>◎</span>Выберите новичка из списка</div></div>'; return; }
  const cps=getCheckpointState(p,today);
  const current=cps[selectedDay];
  const check=current.checkin;
  const made=p.helpTasks?.[selectedDay];
  const taskLine=p.bitrixTaskId ? `<div class="linked-task"><span>${esc(p.bitrixTaskTitle || 'Задача приёма')} #${esc(p.bitrixTaskId)}</span>${p.bitrixTaskLink?`<a href="${esc(p.bitrixTaskLink)}" target="_blank" rel="noopener">Открыть в Битрикс24 ↗</a>`:'<span>Демо-связь</span>'}</div>` : '';
  $('#detail').innerHTML=`<div class="detail-top"><div class="detail-header"><div><div class="eyebrow dark">КАРТОЧКА НОВИЧКА</div><h2>${esc(p.name)}</h2><p>${esc(p.role)} · ${esc(p.department)}</p></div><span class="status ${stateOf(p)}">${statusText(stateOf(p))}</span></div><div class="detail-meta"><div><span>Первый день</span><strong>${pretty(p.startDate)}</strong></div><div><span>Руководитель</span><strong>${esc(p.manager)}</strong></div><div><span>Сейчас</span><strong>День ${age(p)} из 90</strong></div></div>${taskLine}</div><div class="check-head"><h3>Контрольные точки</h3><span>7 · 30 · 60 день</span></div><div class="timeline">${CHECKPOINT_DAYS.map(day=>`<button type="button" data-day="${day}" class="${selectedDay===day?'active':''}"><strong>День ${day}</strong><small>${pretty(cps[day].dueDate)}</small><span class="mini ${cps[day].state}">${statusText(cps[day].state)}</span></button>`).join('')}</div><form id="check-form" class="check-form"><h3>Проверка на ${selectedDay}-й день</h3><p class="hint">Один короткий разговор. Что мешает человеку работать и кто может помочь?</p><div class="choice-row"><label><input type="radio" name="status" value="ok" ${check?.status==='ok'?'checked':''} required> Всё в порядке</label><label><input type="radio" name="status" value="help" ${check?.status==='help'?'checked':''}> Нужна помощь</label></div><label class="field-label">Короткий итог<textarea name="note" placeholder="Например, не выдали доступ к кассовой программе">${esc(check?.note||'')}</textarea></label><div class="form-actions"><small>${check?.checkedAt?`Последняя проверка: ${pretty(check.checkedAt)}`:`Срок: ${pretty(current.dueDate)}`}</small><button class="primary-button" type="submit">Сохранить проверку</button></div></form>${check?.status==='help'?`<div class="help-action"><strong>Следующий шаг — назначить помощь</strong><p>Проблема зафиксирована. Создайте задачу руководителю, чтобы у неё был ответственный и срок.</p>${made?`<div class="task-made">${made.link?`<a href="${esc(made.link)}" target="_blank" rel="noopener">Задача #${esc(made.id)} в Битрикс24 ↗</a>`:`Демо-задача #${esc(made.id)} создана`}</div>`:`<label class="field-label">Срок решения<input id="help-deadline" type="date" value="${addDays(today,2)}" min="${today}"></label><button id="create-help" class="primary-button" type="button">${live?'Создать задачу в Битрикс24':'Создать демо-задачу'}</button>`}</div>`:''}`;
}

async function checkConnection() {
  try {
    const response=await fetch('/api/status',{cache:'no-store'});
    if (!response.ok) return;
    const data=await response.json();
    live=Boolean(data.connected); portal=data.portal;
    if (live) { $('#connection').classList.add('live'); $('#connection span:last-child').textContent='Битрикс24 подключён'; $('#reset').hidden=true; $('#setup').hidden=true; }
    else if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') $('#setup').hidden=false;
    render();
  } catch { /* static demo */ }
}

$('#people').addEventListener('click',event=>{const card=event.target.closest('[data-person]');if(!card)return;selectedId=card.dataset.person;selectedDay=7;render();});
$('.segmented').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('selected',el===button));render();});
$('#search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();render();});
$('#detail').addEventListener('click',async event=>{
  const dayButton=event.target.closest('[data-day]');
  if(dayButton){selectedDay=Number(dayButton.dataset.day);renderDetail();return;}
  if(event.target.id==='create-help'){
    const p=people.find(x=>x.id===selectedId);const deadline=$('#help-deadline').value;
    try {
      const fields=makeHelpTask(p,p.checkpoints[selectedDay].note,deadline);
      let made;
      if(live){const response=await fetch('/api/task/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});const data=await response.json();if(!response.ok)throw new Error(data.error);made={id:data.task.id,link:data.link};}
      else made={id:`D${Math.floor(Math.random()*9000)+1000}`,link:null};
      p.helpTasks={...p.helpTasks,[selectedDay]:made};persist();render();toast(live?'Задача создана в Битрикс24':'Демо-задача создана');
    }catch(error){toast(error.message);}
  }
});
$('#detail').addEventListener('submit',event=>{
  if(event.target.id!=='check-form')return;
  event.preventDefault();const p=people.find(x=>x.id===selectedId);const form=new FormData(event.target);
  try{const updated=recordCheckin(p,selectedDay,{status:form.get('status'),note:form.get('note'),checkedAt:today});people=people.map(x=>x.id===p.id?updated:x);persist();render();toast('Проверка сохранена');}
  catch(error){toast(error.message);}
});
$('#add-person').addEventListener('click',()=>{const form=$('#person-form');form.reset();form.elements.startDate.value=today;$('#person-error').textContent='';$('#person-dialog').showModal();});
$('#setup').addEventListener('submit',async event=>{
  event.preventDefault();$('#setup-error').textContent='';
  const webhookUrl=$('#webhook-url').value;
  try{const response=await fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({webhookUrl})});const data=await response.json();if(!response.ok)throw new Error(data.error);$('#webhook-url').value='';live=true;portal=data.portal;$('#setup').hidden=true;$('#connection').classList.add('live');$('#connection span:last-child').textContent='Битрикс24 подключён';$('#reset').hidden=true;render();toast('Битрикс24 подключён');}
  catch(error){$('#setup-error').textContent=error.message;}
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
$('#person-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;const data=new FormData(form);const taskId=data.get('bitrixTaskId');let taskLink=null;let taskTitle=null;
  $('#person-error').textContent='';
  try{
    if(live&&taskId){const response=await fetch('/api/task/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId})});const result=await response.json();if(!response.ok)throw new Error(result.error);taskLink=result.link;taskTitle=result.task.title;}
    const person={id:crypto.randomUUID(),name:String(data.get('name')).trim(),role:String(data.get('role')).trim(),department:data.get('department'),startDate:data.get('startDate'),manager:String(data.get('manager')).trim(),managerBitrixId:Number(data.get('managerBitrixId')),bitrixTaskId:taskId?Number(taskId):null,bitrixTaskLink:taskLink,bitrixTaskTitle:taskTitle,checkpoints:{7:null,30:null,60:null},helpTasks:{}};
    people.unshift(person);selectedId=person.id;selectedDay=7;persist();$('#person-dialog').close();filter='all';document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('selected',el.dataset.filter==='all'));render();toast('Новичок добавлен');
  }catch(error){$('#person-error').textContent=error.message;}
});
$('#reset').addEventListener('click',()=>{people=structuredClone(seed);selectedId=people[0].id;selectedDay=7;filter='all';query='';$('#search').value='';document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('selected',el.dataset.filter==='all'));persist();render();toast('Демо сброшено');});
render();checkConnection();
