import { addDays, getCheckpointState, getBoardLane, getInitialCheckpointDay, recordCheckin, createHelpCheckin, CHECKPOINT_DAYS } from './core.mjs';

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
let selectedId = null;
let selectedDay = 7;
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
  const visible = people.filter(p => `${p.name} ${p.department}`.toLowerCase().includes(query));
  const lanes = [
    { id: 'help', title: 'Нужна помощь', subtitle: 'Есть вопрос для ответственного' },
    { id: 'check', title: 'Ждут проверки', subtitle: 'Сегодня или просрочено' },
    { id: 'plan', title: 'По плану', subtitle: 'Следующая проверка позже' }
  ];
  $('#people').innerHTML = lanes.map(lane => {
    const cards = visible.filter(p => getBoardLane(p, today) === lane.id);
    return `<section class="kanban-column lane-${lane.id}" aria-label="${lane.title}"><header class="kanban-heading"><div><h3>${lane.title}</h3><p>${lane.subtitle}</p></div><span class="kanban-count">${cards.length}</span></header><div class="kanban-cards">${cards.length ? cards.map((p,i) => {
      const day = getInitialCheckpointDay(p, today);
      const checkpoint = getCheckpointState(p, today)[day];
      const note = checkpoint.checkin?.status === 'help' ? checkpoint.checkin.note : '';
      return `<button class="kanban-card" data-person="${esc(p.id)}" type="button" aria-label="Открыть карточку ${esc(p.name)}"><span class="card-top"><span class="avatar ${i%3===1?'purple':i%3===2?'amber':''}">${esc(p.name.split(' ').map(s=>s[0]).slice(0,2).join(''))}</span><span class="status ${stateOf(p)}">${statusText(stateOf(p))}</span></span><strong class="card-name">${esc(p.name)}</strong><span class="card-role">${esc(p.role)} · ${esc(p.department)}</span>${note ? `<span class="card-note">${esc(note)}</span>` : ''}<span class="card-footer"><span>День ${age(p)} из 90</span><span>Проверка ${day} · ${pretty(checkpoint.dueDate)}</span></span></button>`;
    }).join('') : `<div class="column-empty">${query ? 'По этому запросу никого нет' : 'Пока никого нет'}</div>`}</div></section>`;
  }).join('');
  renderDetail();
}

function renderDetail() {
  const p=people.find(x=>x.id===selectedId);
  if (!p) { $('#detail').innerHTML=''; return; }
  const cps=getCheckpointState(p,today);
  const current=cps[selectedDay];
  const check=current.checkin;
  const made=p.helpTasks?.[selectedDay];
  const taskLine=p.bitrixTaskId ? `<div class="linked-task"><span>${esc(p.bitrixTaskTitle || 'Задача приёма')} #${esc(p.bitrixTaskId)}</span>${p.bitrixTaskLink?`<a href="${esc(p.bitrixTaskLink)}" target="_blank" rel="noopener">Открыть в Битрикс24 ↗</a>`:'<span>Демо-связь</span>'}</div>` : '';
  $('#detail').innerHTML=`<div class="detail-top"><div class="detail-header"><div><div class="eyebrow dark">КАРТОЧКА НОВИЧКА</div><h2>${esc(p.name)}</h2><p>${esc(p.role)} · ${esc(p.department)}</p></div><span class="status ${stateOf(p)}">${statusText(stateOf(p))}</span></div><div class="detail-meta"><div><span>Первый день</span><strong>${pretty(p.startDate)}</strong></div><div><span>Руководитель</span><strong>${esc(p.manager)}</strong></div><div><span>Сейчас</span><strong>День ${age(p)} из 90</strong></div></div>${taskLine}</div><div class="check-head"><h3>Контрольные точки</h3><span>7 · 30 · 60 день</span></div><div class="timeline">${CHECKPOINT_DAYS.map(day=>`<button type="button" data-day="${day}" class="${selectedDay===day?'active':''}"><strong>День ${day}</strong><small>${pretty(cps[day].dueDate)}</small><span class="mini ${cps[day].state}">${statusText(cps[day].state)}</span></button>`).join('')}</div><form id="check-form" class="check-form"><h3>Проверка на ${selectedDay}-й день</h3><p class="hint">Один короткий разговор. Что мешает человеку работать и кто может помочь?</p><div class="choice-row"><label><input type="radio" name="status" value="ok" ${check?.status==='ok'?'checked':''} required> Всё в порядке</label><label><input type="radio" name="status" value="help" ${check?.status==='help'?'checked':''}> Нужна помощь</label></div><label class="field-label"><span id="note-label">${check?.status==='help'?'Комментарий для задачи':'Короткий итог'}</span><textarea name="note" placeholder="Например, не выдали доступ к кассовой программе" ${check?.status==='help'?'required':''}>${esc(check?.note||'')}</textarea></label><div id="deadline-field" ${check?.status==='help'&&!made?'':'hidden'}><label class="field-label">Срок решения<input name="deadline" type="date" value="${addDays(today,2)}" min="${today}"></label></div>${made?`<div class="task-made">${made.link?`<a href="${esc(made.link)}" target="_blank" rel="noopener">Задача #${esc(made.id)} в Битрикс24 ↗</a>${made.verified===true?' · Подтверждена повторным запросом':made.verified===false?' · Создана, повторная проверка не удалась':''}`:`Демо-задача #${esc(made.id)} создана`}</div>`:''}<p id="demo-task-hint" class="demo-task-hint" ${check?.status==='help'&&!made&&!live?'':'hidden'}>Демо-режим: задача появится только здесь. При подключённом Битрикс24 она будет создана в портале.</p><p id="existing-task-hint" class="demo-task-hint" ${check?.status==='ok'&&made?'':'hidden'}>Задача помощи уже создана. При необходимости закройте её в Битрикс24 отдельно.</p><div class="form-actions"><small>${check?.checkedAt?`Последняя проверка: ${pretty(check.checkedAt)}`:`Срок проверки: ${pretty(current.dueDate)}`}</small><button id="check-submit" class="primary-button" type="submit">${check?.status==='help'&&!made?'Добавить задачу в Битрикс24':made&&check?.status==='help'?'Сохранить комментарий':'Сохранить проверку'}</button></div></form>`;
}

function updateCheckForm() {
  const form = $('#check-form');
  if (!form) return;
  const help = form.elements.status.value === 'help';
  const made = Boolean(people.find(p => p.id === selectedId)?.helpTasks?.[selectedDay]);
  $('#note-label').textContent = help ? 'Комментарий для задачи' : 'Короткий итог';
  form.elements.note.required = help;
  $('#deadline-field').hidden = !help || made;
  form.elements.deadline.required = help && !made;
  $('#demo-task-hint').hidden = !help || made || live;
  $('#existing-task-hint').hidden = help || !made;
  $('#check-submit').textContent = help ? made ? 'Сохранить комментарий' : 'Добавить задачу в Битрикс24' : 'Сохранить проверку';
}

async function checkConnection() {
  try {
    const response=await fetch('/api/status',{cache:'no-store'});
    if (!response.ok) throw new Error('API недоступен');
    const data=await response.json();
    if (typeof data.connected !== 'boolean') throw new Error('API недоступен');
    live=Boolean(data.connected); portal=data.portal;
    if (live) { $('#connection').classList.add('live'); $('#connection span:last-child').textContent='Битрикс24 подключён'; $('#reset').hidden=true; $('#setup').hidden=true; }
    else $('#setup').hidden=false;
    render();
  } catch {
    $('#setup').hidden=false;
    $('#webhook-url').disabled=true;
    $('#setup button').disabled=true;
    $('#setup-error').textContent='Для подключения откройте сайт через локальный сервер: npm start → http://127.0.0.1:4173';
  }
}

$('#people').addEventListener('click',event=>{const card=event.target.closest('[data-person]');if(!card)return;selectedId=card.dataset.person;selectedDay=getInitialCheckpointDay(people.find(p=>p.id===selectedId),today);renderDetail();$('#detail-dialog').showModal();});
$('#close-detail').addEventListener('click',()=>$('#detail-dialog').close());
$('#search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();render();});
$('#detail').addEventListener('click',async event=>{
  const dayButton=event.target.closest('[data-day]');
  if(dayButton){selectedDay=Number(dayButton.dataset.day);renderDetail();return;}
});
$('#detail').addEventListener('change',event=>{if(event.target.name==='status')updateCheckForm();});
$('#detail').addEventListener('submit',async event=>{
  if(event.target.id!=='check-form')return;
  event.preventDefault();const p=people.find(x=>x.id===selectedId);const form=new FormData(event.target);const button=$('#check-submit');
  button.disabled=true;
  try{
    const status=form.get('status');let updated;
    if(status==='help'&&!p.helpTasks?.[selectedDay]){
      updated=await createHelpCheckin(p,selectedDay,{note:form.get('note'),checkedAt:today,deadline:form.get('deadline')},async fields=>{
        if(!live)return {id:`D${Math.floor(Math.random()*9000)+1000}`,link:null};
        const response=await fetch('/api/task/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
        const data=await response.json();if(!response.ok)throw new Error(data.error);
        return {id:data.task.id,link:data.link,verified:data.verified};
      });
    }else updated=recordCheckin(p,selectedDay,{status,note:form.get('note'),checkedAt:today});
    people=people.map(x=>x.id===p.id?updated:x);persist();render();
    toast(status==='help'&&!p.helpTasks?.[selectedDay] ? live?'Задача создана в Битрикс24':'Демо-задача создана' : 'Проверка сохранена');
  }catch(error){button.disabled=false;toast(error.message);}
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
    people.unshift(person);selectedId=person.id;selectedDay=7;persist();$('#person-dialog').close();render();$('#detail-dialog').showModal();toast('Новичок добавлен');
  }catch(error){$('#person-error').textContent=error.message;}
});
$('#reset').addEventListener('click',()=>{people=structuredClone(seed);selectedId=null;selectedDay=7;query='';$('#search').value='';$('#detail-dialog').close();persist();render();toast('Демо сброшено');});
render();checkConnection();
