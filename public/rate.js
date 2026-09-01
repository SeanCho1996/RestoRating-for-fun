const list = document.querySelector('#rateList');
const loginRequired = document.querySelector('#rateLoginRequired');
const emptyState = document.querySelector('#rateEmpty');
const labels = { 1: '拉完了', 2: 'NPC', 3: '人上人', 4: '顶级', 5: '夯' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后再试');
  return data;
}

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = message;
  document.querySelector('#rateToast').append(item);
  setTimeout(() => item.remove(), 3500);
}

function render(restaurants) {
  emptyState.classList.toggle('hidden', restaurants.length > 0);
  list.innerHTML = restaurants.map((restaurant) => `
    <article class="rate-card" data-id="${restaurant.id}">
      <img src="${restaurant.thumbnailUrl || restaurant.photoUrl}" loading="lazy" decoding="async" width="480" height="320" alt="${escapeHtml(restaurant.name)}的照片">
      <div class="rate-card-content">
        <h2>${escapeHtml(restaurant.name)}</h2>
        <p class="current-rating">${restaurant.ownRating ? `你当前的评分：<strong>${labels[restaurant.ownRating]}</strong>` : '你还没有评价这家饭馆'}</p>
        <div class="rate-options">
          ${[5, 4, 3, 2, 1].map((value) => `<button class="rate-option ${restaurant.ownRating === value ? 'selected' : ''}" data-value="${value}"><strong>${value}</strong>${labels[value]}</button>`).join('')}
        </div>
      </div>
    </article>`).join('');
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('.rate-option');
  if (!button) return;
  const card = button.closest('.rate-card');
  const buttons = [...card.querySelectorAll('.rate-option')];
  buttons.forEach((item) => { item.disabled = true; });
  try {
    const value = Number(button.dataset.value);
    const result = await api(`/api/restaurants/${card.dataset.id}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    buttons.forEach((item) => item.classList.toggle('selected', Number(item.dataset.value) === value));
    card.querySelector('.current-rating').innerHTML = `你当前的评分：<strong>${labels[value]}</strong>`;
    toast(result.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
});

Promise.all([api('/api/auth/me'), api('/api/restaurants')]).then(([auth, restaurants]) => {
  if (!auth.user || auth.user.role !== 'user') {
    loginRequired.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }
  document.querySelector('#rateUser').textContent = auth.user.username;
  render(restaurants.restaurants);
}).catch((error) => toast(error.message, true));
