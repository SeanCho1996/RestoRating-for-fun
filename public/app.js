const state = { user: null, restaurants: [], labels: {}, deleteId: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authDialog = $('#authDialog');
const restaurantDialog = $('#restaurantDialog');
const confirmDialog = $('#confirmDialog');

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
      ratingLink.textContent = '添加/更新你的排名';
      nav.querySelector('.user-chip').after(ratingLink);
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
}

function setSubmitting(form, busy) {
  const button = $('button[type="submit"]', form);
  button.disabled = busy;
  if (busy) { button.dataset.label = button.textContent; button.textContent = '请稍候…'; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
}

document.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'login' || action === 'register') showAuth(action);
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
