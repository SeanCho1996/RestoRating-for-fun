const labels = { 1: '拉完了', 2: 'NPC', 3: '人上人', 4: '顶级', 5: '夯' };
const list = document.querySelector('#rateList');
const loginRequired = document.querySelector('#rateLoginRequired');
const emptyState = document.querySelector('#rateEmpty');
let selectedCard = null;
let autoScrollFrame = null;
let autoScrollSpeed = 0;

function runAutoScroll() {
  if (!autoScrollSpeed) { autoScrollFrame = null; return; }
  window.scrollBy(0, autoScrollSpeed);
  autoScrollFrame = requestAnimationFrame(runAutoScroll);
}

function updateAutoScroll(pointerY) {
  const threshold = Math.min(140, window.innerHeight * 0.2);
  let nextSpeed = 0;
  if (pointerY < threshold) nextSpeed = -Math.ceil(((threshold - pointerY) / threshold) * 22);
  else if (pointerY > window.innerHeight - threshold) nextSpeed = Math.ceil(((pointerY - (window.innerHeight - threshold)) / threshold) * 22);
  autoScrollSpeed = nextSpeed;
  if (autoScrollSpeed && autoScrollFrame === null) autoScrollFrame = requestAnimationFrame(runAutoScroll);
  if (!autoScrollSpeed && autoScrollFrame !== null) { cancelAnimationFrame(autoScrollFrame); autoScrollFrame = null; }
}

function stopAutoScroll() {
  autoScrollSpeed = 0;
  if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = null;
}


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

function cardMarkup(restaurant) {
  const current = restaurant.ownRating ? `你的排名：${labels[restaurant.ownRating]}` : '拖动到下方等级';
  return `
    <article class="drag-card" draggable="true" tabindex="0" role="button" data-id="${restaurant.id}" data-rating="${restaurant.ownRating || ''}" aria-label="${escapeHtml(restaurant.name)}，${current}">
      <img src="${restaurant.thumbnailUrl || restaurant.photoUrl}" loading="lazy" decoding="async" width="480" height="320" alt="">
      <div class="drag-card-info"><strong>${escapeHtml(restaurant.name)}</strong><span>${current}</span></div>
    </article>`;
}

function render(restaurants) {
  emptyState.classList.toggle('hidden', restaurants.length > 0);
  if (!restaurants.length) { list.innerHTML = ''; return; }

  const unrated = restaurants.filter((restaurant) => !restaurant.ownRating);
  const rows = [5, 4, 3, 2, 1].map((value) => {
    const cards = restaurants.filter((restaurant) => restaurant.ownRating === value).map(cardMarkup).join('');
    return `
      <section class="drag-row" data-value="${value}">
        <h2 class="drag-label">${labels[value]}</h2>
        <div class="drag-dropzone" data-value="${value}" tabindex="0" aria-label="${labels[value]}等级，拖放或选择餐厅后点击这里">
          ${cards}<span class="drop-empty ${cards ? 'hidden' : ''}">拖到这里</span>
        </div>
      </section>`;
  }).join('');

  list.innerHTML = `
    <section class="unrated-section">
      <h2>待排名饭馆</h2>
      <div class="unrated-pool" id="unratedPool">
        ${unrated.map(cardMarkup).join('')}<span class="pool-empty ${unrated.length ? 'hidden' : ''}">所有饭馆都已排名</span>
      </div>
      <p class="drag-help">电脑可直接拖动，靠近页面上下边缘会自动滚动；手机可先点击饭馆，再点击对应等级。</p>
    </section>
    <div class="drag-board">${rows}</div>`;
}

function refreshEmptyStates() {
  const pool = document.querySelector('#unratedPool');
  pool?.querySelector('.pool-empty')?.classList.toggle('hidden', Boolean(pool.querySelector('.drag-card')));
  document.querySelectorAll('.drag-dropzone').forEach((zone) => {
    zone.querySelector('.drop-empty')?.classList.toggle('hidden', Boolean(zone.querySelector('.drag-card')));
  });
}

function selectCard(card) {
  selectedCard?.classList.remove('selected');
  selectedCard = selectedCard === card ? null : card;
  selectedCard?.classList.add('selected');
}

async function updateRating(card, value) {
  if (!card || card.classList.contains('saving') || Number(card.dataset.rating) === value) {
    selectCard(card);
    return;
  }

  const previousParent = card.parentElement;
  const previousRating = card.dataset.rating;
  const target = document.querySelector(`.drag-dropzone[data-value="${value}"]`);
  card.classList.add('saving');
  target.append(card);
  refreshEmptyStates();

  try {
    await api(`/api/restaurants/${card.dataset.id}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    card.dataset.rating = String(value);
    card.querySelector('.drag-card-info span').textContent = `你的排名：${labels[value]}`;
    card.setAttribute('aria-label', `${card.querySelector('strong').textContent}，你的排名：${labels[value]}`);
    toast(`已更新为「${labels[value]}」`);
  } catch (error) {
    previousParent.append(card);
    card.dataset.rating = previousRating;
    toast(error.message, true);
  } finally {
    card.classList.remove('saving', 'selected');
    selectedCard = null;
    refreshEmptyStates();
  }
}

list.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.drag-card');
  if (!card) return;
  selectedCard?.classList.remove('selected');
  selectedCard = card;
  card.classList.add('selected');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.id);
});

document.addEventListener('dragover', (event) => {
  if (selectedCard) updateAutoScroll(event.clientY);
});
document.addEventListener('drop', stopAutoScroll);
window.addEventListener('blur', stopAutoScroll);

list.addEventListener('dragover', (event) => {
  const zone = event.target.closest('.drag-dropzone');
  if (!zone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drag-over').forEach((item) => item.classList.remove('drag-over'));
  zone.classList.add('drag-over');
});

list.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('.drag-dropzone');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
});

list.addEventListener('drop', (event) => {
  const zone = event.target.closest('.drag-dropzone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('drag-over');
  const id = event.dataTransfer.getData('text/plain');
  updateRating(document.querySelector(`.drag-card[data-id="${CSS.escape(id)}"]`), Number(zone.dataset.value));
});

list.addEventListener('dragend', () => {
  stopAutoScroll();
  document.querySelectorAll('.drag-over').forEach((item) => item.classList.remove('drag-over'));
});

list.addEventListener('click', (event) => {
  const card = event.target.closest('.drag-card');
  if (card) { selectCard(card); return; }
  const zone = event.target.closest('.drag-dropzone');
  if (zone && selectedCard) updateRating(selectedCard, Number(zone.dataset.value));
});

list.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('.drag-card');
  const zone = event.target.closest('.drag-dropzone');
  if (card) { event.preventDefault(); selectCard(card); }
  else if (zone && selectedCard) { event.preventDefault(); updateRating(selectedCard, Number(zone.dataset.value)); }
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
