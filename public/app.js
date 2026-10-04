const state = { user: null, restaurants: [], labels: {}, deleteId: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authDialog = $('#authDialog');
const restaurantDialog = $('#restaurantDialog');
const confirmDialog = $('#confirmDialog');
const foodPickerDialog = $('#foodPickerDialog');
const NEW_RESTAURANT_STORAGE_KEY = 'newmarket-resto-seen-announcements-v1';
let foodPickerRun = 0;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后再试');
  return data;
}

function toast(message, type = 'success', link) {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link; anchor.textContent = ' 开发模式：点击验证';
    item.append(anchor);
  }
  const openDialog = $("dialog[open]");
  let region = openDialog?.querySelector(".dialog-toast-region");
  if (openDialog && !region) {
    region = document.createElement("div");
    region.className = "dialog-toast-region";
    region.setAttribute("aria-live", "assertive");
    openDialog.prepend(region);
  }
  (region || $("#toastRegion")).append(item);
  setTimeout(() => item.remove(), link ? 12000 : 4500);
}

function showNewRestaurantNotice() {
  const notice = $('#newRestaurantNotice');
  if (!notice) return;

  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(NEW_RESTAURANT_STORAGE_KEY) || '[]'); }
  catch { seen = []; }
  const seenIds = new Set(Array.isArray(seen) ? seen : []);
  const unseen = state.restaurants
    .filter((restaurant) => restaurant.announcementAt && !seenIds.has(restaurant.id))
    .sort((left, right) => new Date(right.announcementAt) - new Date(left.announcementAt));
  if (!unseen.length) return;

  const names = unseen.slice(0, 4).map((restaurant) => `<li>${escapeHtml(restaurant.name)}</li>`).join('');
  const remainder = unseen.length > 4 ? `<li>以及另外 ${unseen.length - 4} 家</li>` : '';
  notice.innerHTML = `
    <button class="new-restaurant-close" type="button" aria-label="关闭新增餐厅通知">×</button>
    <span class="new-restaurant-kicker">新餐厅上线</span>
    <strong>${unseen.length === 1 ? escapeHtml(unseen[0].name) : `新增 ${unseen.length} 家餐厅`}</strong>
    ${unseen.length > 1 ? `<ul>${names}${remainder}</ul>` : '<p>快来看看同学们会把它排在哪一级。</p>'}
    <button class="new-restaurant-action" type="button">查看餐厅</button>`;
  notice.classList.remove('hidden');

  unseen.forEach((restaurant) => seenIds.add(restaurant.id));
  try { localStorage.setItem(NEW_RESTAURANT_STORAGE_KEY, JSON.stringify([...seenIds])); }
  catch { /* Private browsing or disabled storage: the popup still works. */ }
}

function weightedRestaurantPick(restaurants) {
  const weightedTotal = restaurants.reduce((total, restaurant) => total + (restaurant.ownRating || 1), 0);
  let choice = Math.random() * weightedTotal;
  for (const restaurant of restaurants) {
    choice -= restaurant.ownRating || 1;
    if (choice < 0) return restaurant;
  }
  return restaurants.at(-1);
}

function finishFoodPicker(winner, runId) {
  if (runId !== foodPickerRun) return;
  $('#foodPickerName').textContent = winner.name;
  $('#foodPickerRating').textContent = winner.ownRating
    ? `你的评分：${state.labels[winner.ownRating]}`
    : '你还没有评价过这家餐厅';
  const photo = $('#foodPickerPhoto');
  photo.src = winner.thumbnailUrl || winner.photoUrl;
  photo.alt = `${winner.name}的照片`;
  const mapLink = $('#foodPickerMap');
  mapLink.href = winner.googleMapsUrl;
  mapLink.classList.toggle('hidden', !winner.googleMapsUrl);
  $('#foodPickerResult').classList.remove('hidden');
  $('#pickAgainButton').disabled = false;
}

function runFoodPicker() {
  if (!state.restaurants.length) return toast('暂时没有可以选择的餐厅', 'error');
  const runId = ++foodPickerRun;
  const winner = weightedRestaurantPick(state.restaurants);
  const sequence = Array.from({ length: 22 }, () => weightedRestaurantPick(state.restaurants));
  sequence.push(winner);
  const track = $('#foodPickerTrack');
  track.classList.remove('is-spinning');
  track.style.transform = 'translateY(0)';
  track.replaceChildren(...sequence.map((restaurant) => {
    const item = document.createElement('div');
    item.className = 'food-picker-item';
    item.textContent = restaurant.name;
    return item;
  }));
  $('#foodPickerResult').classList.add('hidden');
  $('#foodPickerMap').classList.add('hidden');
  $('#pickAgainButton').disabled = true;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    track.style.transform = `translateY(-${(sequence.length - 1) * 72}px)`;
    finishFoodPicker(winner, runId);
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (runId !== foodPickerRun) return;
    track.classList.add('is-spinning');
    track.style.transform = `translateY(-${(sequence.length - 1) * 72}px)`;
  }));
  track.addEventListener('transitionend', () => finishFoodPicker(winner, runId), { once: true });
  setTimeout(() => finishFoodPicker(winner, runId), 5400);
}

function openFoodPicker() {
  if (!state.user || state.user.role !== 'user') return showAuth('login');
  foodPickerDialog.showModal();
  runFoodPicker();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showAuth(tab = 'login') {
  switchTab(tab);
  authDialog.showModal();
}

function switchTab(tab) {
  $$('.auth-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $('#loginForm').classList.toggle('hidden', tab !== 'login');
  $('#registerForm').classList.toggle('hidden', tab !== 'register');
}

function renderNav() {
  const nav = $('#navActions');
  if (!state.user) {
    nav.innerHTML = '<button class="btn btn-ghost" data-action="login">登录</button><button class="btn btn-primary" data-action="register">加入评分</button>';
  } else {
    nav.innerHTML = `<div class="user-chip"><span class="user-avatar">${escapeHtml(state.user.username.slice(0, 1))}</span><span>${escapeHtml(state.user.username)}</span>${state.user.role === 'admin' ? '<span class="role-badge">管理员</span>' : ''}</div><button class="btn btn-ghost" data-action="logout">退出</button>`;
    if (state.user.role === 'user') {
      const ratingLink = document.createElement('a');
      ratingLink.className = 'btn btn-primary rating-nav-button';
      ratingLink.href = '/rate.html';
      ratingLink.innerHTML = '<span class="rating-nav-full">添加/更新你的排名</span><span class="rating-nav-short">更新排名</span>';
      nav.querySelector('.user-chip').after(ratingLink);
      const pickerButton = document.createElement('button');
      pickerButton.className = 'btn btn-ghost food-picker-nav-button';
      pickerButton.type = 'button';
      pickerButton.dataset.action = 'food-picker';
      pickerButton.textContent = '今天吃什么';
      ratingLink.after(pickerButton);
    }
  }
  $('#addRestaurantButton').classList.toggle('hidden', state.user?.role !== 'admin');
}

function ratingControls(restaurant) {
  if (!state.user) return '<div class="locked-stats">🔒 登录并评分后，查看大家的评价</div>';
  if (state.user.role === 'admin') {
    if (!restaurant.stats?.count) return '<p class="admin-stats">暂无同学评分</p>';
    return `<div class="stats"><div class="average"><strong>${restaurant.stats.average}</strong><span>${restaurant.stats.count} 人评分</span></div>${distribution(restaurant.stats)}</div>`;
  }
  const buttons = [5, 4, 3, 2, 1].map((value) => `<button class="rating-button ${restaurant.ownRating === value ? 'selected' : ''}" data-rate="${value}" title="${state.labels[value]}"><strong>${value}</strong>${state.labels[value]}</button>`).join('');
  const stats = restaurant.stats ? `<div class="stats"><div class="average"><strong>${restaurant.stats.average ?? '—'}</strong><span>${restaurant.stats.count} 人评分</span></div>${distribution(restaurant.stats)}</div>` : '<div class="locked-stats">🔒 先选择你的评价，再解锁平均评分</div>';
  return `<p class="rating-prompt">${restaurant.ownRating ? '你的评价（可以随时修改）' : '吃过吗？留下你的真实评价'}</p><div class="rating-scale">${buttons}</div>${stats}`;
}

function distribution(stats) {
  return `<div class="distribution">${[5,4,3,2,1].map((value) => { const count = stats.distribution[value] || 0; const width = stats.count ? count / stats.count * 100 : 0; return `<div class="bar-row"><span>${value}</span><div class="bar"><i style="width:${width}%"></i></div><span>${count}</span></div>`; }).join('')}</div>`;
}

function renderRestaurants() {
  if (window.renderTierView) return window.renderTierView(state);
  const grid = $('#restaurantGrid');
  $('#emptyState').classList.toggle('hidden', state.restaurants.length > 0);
  grid.innerHTML = state.restaurants.map((restaurant) => `
    <article class="restaurant-card" data-id="${restaurant.id}">
      <img class="card-photo" src="${restaurant.thumbnailUrl || restaurant.photoUrl}" loading="lazy" decoding="async" width="480" height="320" alt="${escapeHtml(restaurant.name)}的照片">
      <div class="card-content">
        <div class="card-top"><h3>${escapeHtml(restaurant.name)}</h3>${state.user?.role === 'admin' ? `<div class="admin-actions"><button class="icon-button" data-edit title="编辑">✎</button><button class="icon-button delete" data-delete title="删除">×</button></div>` : ''}</div>
        ${ratingControls(restaurant)}
      </div>
    </article>`).join('');
}

async function load() {
  const [auth, restaurants] = await Promise.all([api('/api/auth/me'), api('/api/restaurants')]);
  state.user = auth.user; state.labels = restaurants.ratingLabels; state.restaurants = restaurants.restaurants;
  renderNav(); renderRestaurants();
  showNewRestaurantNotice();
}

function setSubmitting(form, busy) {
  const button = $('button[type="submit"]', form);
  button.disabled = busy;
  if (busy) { button.dataset.label = button.textContent; button.textContent = '请稍候…'; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('.new-restaurant-close')) $('#newRestaurantNotice').classList.add('hidden');
  if (event.target.closest('.new-restaurant-action')) {
    $('#newRestaurantNotice').classList.add('hidden');
    $('#restaurantsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'login' || action === 'register') showAuth(action);
  if (action === 'food-picker') openFoodPicker();
  if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST' }); state.user = null; await load(); toast('已安全退出');
  }
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
  const card = event.target.closest('.restaurant-card');
  if (card && event.target.closest('[data-rate]')) {
    const value = Number(event.target.closest('[data-rate]').dataset.rate);
    try {
      const data = await api(`/api/restaurants/${card.dataset.id}/rating`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
      const index = state.restaurants.findIndex((item) => item.id === card.dataset.id); state.restaurants[index] = data.restaurant; renderRestaurants(); toast(`已评价为「${state.labels[value]}」`);
    } catch (error) { toast(error.message, 'error'); }
  }
  if (card && event.target.closest('[data-edit]')) {
    const restaurant = state.restaurants.find((item) => item.id === card.dataset.id);
    const form = $('#restaurantForm'); form.reset(); form.elements.namedItem('id').value = restaurant.id; form.elements.namedItem('name').value = restaurant.name; form.elements.namedItem('googleMapsUrl').value = restaurant.googleMapsUrl || '';
    $('#restaurantDialogTitle').textContent = '编辑餐厅'; $('#photoOptional').textContent = '（不选择则保留原图）'; $('#fileLabel').textContent = '点击更换照片（最大 5MB）'; restaurantDialog.showModal();
  }
  if (card && event.target.closest('[data-delete]')) { state.deleteId = card.dataset.id; confirmDialog.showModal(); }
});

$$('.auth-tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('#addRestaurantButton').addEventListener('click', () => { const form = $('#restaurantForm'); form.reset(); form.elements.namedItem('id').value = ''; $('#restaurantDialogTitle').textContent = '添加餐厅'; $('#photoOptional').textContent = '（必填）'; $('#fileLabel').textContent = '点击选择照片（最大 5MB）'; restaurantDialog.showModal(); });
$('#restaurantForm input[type="file"]').addEventListener('change', (event) => { $('#fileLabel').textContent = event.target.files[0]?.name || '点击选择照片（最大 5MB）'; });
$('#pickAgainButton').addEventListener('click', runFoodPicker);

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setSubmitting(event.target, true);
  try {
    const form = new FormData(event.target); const data = await api('/api/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(Object.fromEntries(form)) });
    state.user = data.user; authDialog.close(); event.target.reset(); await load(); toast(`欢迎回来，${state.user.username}`);
  } catch (error) { toast(error.message, 'error'); } finally { setSubmitting(event.target, false); }
});

$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setSubmitting(event.target, true);
  try {
    const form = new FormData(event.target); const data = await api('/api/auth/register', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(Object.fromEntries(form)) });
    authDialog.close(); event.target.reset(); toast(data.message, 'success', data.previewUrl); switchTab('login');
  } catch (error) { toast(error.message, 'error'); } finally { setSubmitting(event.target, false); }
});

$("#forgotPasswordButton").addEventListener("click", async () => {
  const email = $("#loginForm input[name=\"email\"]").value;
  if (!email) return toast("请先填写邮箱地址", "error");
  try {
    const data = await api("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    toast(data.message, "success", data.previewUrl);
  } catch (error) { toast(error.message, "error"); }
});

$('#resendButton').addEventListener('click', async () => {
  const email = $('#loginForm input[name="email"]').value;
  if (!email) return toast('请先填写邮箱地址', 'error');
  try { const data = await api('/api/auth/resend', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email }) }); toast(data.message, 'success', data.previewUrl); } catch (error) { toast(error.message, 'error'); }
});

$('#restaurantForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const formData = new FormData(event.target); const id = formData.get('id');
  if (!id && !formData.get('photo')?.size) return toast('请选择一张餐厅照片', 'error');
  setSubmitting(event.target, true);
  try { await api(id ? `/api/restaurants/${id}` : '/api/restaurants', { method:id ? 'PUT' : 'POST', body:formData }); restaurantDialog.close(); await load(); toast(id ? '餐厅资料已更新' : '餐厅添加成功'); }
  catch (error) { toast(error.message, 'error'); } finally { setSubmitting(event.target, false); }
});

$('#confirmDelete').addEventListener('click', async () => {
  if (!state.deleteId) return;
  try { await api(`/api/restaurants/${state.deleteId}`, { method:'DELETE' }); confirmDialog.close(); state.deleteId = null; await load(); toast('餐厅已删除'); } catch (error) { toast(error.message, 'error'); }
});

const verification = new URLSearchParams(location.search).get('verification');
if (verification) { history.replaceState({}, '', '/'); setTimeout(() => toast(verification === 'success' ? '邮箱验证成功，现在可以登录了！' : '验证链接无效或已过期，请重新发送。', verification === 'success' ? 'success' : 'error'), 200); }
$('#year').textContent = new Date().getFullYear();
load().catch(() => toast('无法连接服务器，请刷新页面重试', 'error'));
