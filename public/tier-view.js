(function () {
  const tiers = [
    { value: 5, label: '夯', className: 'tier-five' },
    { value: 4, label: '顶级', className: 'tier-four' },
    { value: 3, label: '人上人', className: 'tier-three' },
    { value: 2, label: 'NPC', className: 'tier-two' },
    { value: 1, label: '拉完了', className: 'tier-one' },
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function restaurantTile(restaurant, user) {
    const average = restaurant.stats?.average;
    const adminActions = user.role === 'admin' ? `
      <div class="admin-actions tier-admin-actions">
        <button class="icon-button" data-edit title="编辑餐厅" aria-label="编辑${escapeHtml(restaurant.name)}">✎</button>
        <button class="icon-button delete" data-delete title="删除餐厅" aria-label="删除${escapeHtml(restaurant.name)}">×</button>
      </div>` : '';

    return `
      <article class="restaurant-card tier-restaurant" data-id="${restaurant.id}" data-map-url="${escapeHtml(restaurant.googleMapsUrl)}" tabindex="0" role="link" title="在 Google 地图中查看">
        <div class="tier-photo-wrap">
          <img class="card-photo" src="${restaurant.thumbnailUrl || restaurant.photoUrl}" loading="lazy" decoding="async" width="480" height="320" alt="${escapeHtml(restaurant.name)}的照片">
          ${adminActions}
        </div>
        <div class="tier-restaurant-info">
          <h3>${escapeHtml(restaurant.name)}</h3>
          <p>${average === null ? '暂无评分' : `<strong>${average.toFixed(1)}</strong><span> / 5 · ${restaurant.stats.count} 人</span>`}</p>
          <span class="map-hint">Google 地图 ↗</span>
        </div>
      </article>`;
  }

  window.renderTierView = function renderTierView(state) {
    const grid = document.querySelector('#restaurantGrid');
    const emptyState = document.querySelector('#emptyState');
    if (!grid || !emptyState) return;

    grid.className = 'tier-board';
    emptyState.classList.toggle('hidden', state.restaurants.length > 0);

    if (!state.restaurants.length) {
      grid.innerHTML = '';
      return;
    }

    if (!state.user) {
      grid.innerHTML = `
        <div class="tier-login-required">
          <h3>登录后查看餐厅排名</h3>
          <p>登录后可以查看所有餐厅的平均评分与排名。</p>
          <button class="btn btn-primary" data-action="login">登录</button>
        </div>`;
      return;
    }

    const grouped = Object.fromEntries(tiers.map((tier) => [tier.value, []]));
    const unrated = [];
    for (const restaurant of state.restaurants) {
      if (restaurant.stats?.average === null || restaurant.stats?.average === undefined) {
        unrated.push(restaurant);
      } else {
        const tierValue = Math.max(1, Math.min(5, Math.round(restaurant.stats.average)));
        grouped[tierValue].push(restaurant);
      }
    }

    for (const restaurants of Object.values(grouped)) {
      restaurants.sort((left, right) => right.stats.average - left.stats.average || left.name.localeCompare(right.name, 'zh-CN'));
    }

    const rows = tiers.map((tier) => `
      <section class="tier-row ${tier.className}" aria-label="${tier.label}餐厅">
        <h3 class="tier-label">${tier.label}</h3>
        <div class="tier-restaurants">
          ${grouped[tier.value].length ? grouped[tier.value].map((restaurant) => restaurantTile(restaurant, state.user)).join('') : '<span class="tier-empty">暂无餐厅</span>'}
        </div>
      </section>`).join('');

    const unratedRow = unrated.length ? `
      <section class="tier-row tier-unrated" aria-label="待评分餐厅">
        <h3 class="tier-label">待评分</h3>
        <div class="tier-restaurants">${unrated.map((restaurant) => restaurantTile(restaurant, state.user)).join('')}</div>
      </section>` : '';

    grid.innerHTML = rows + unratedRow;
  };
})();
