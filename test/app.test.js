const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('完整权限、验证邮箱、餐厅与评分流程', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'resto-rating-test-'));
  process.env.DATA_FILE = path.join(temporaryRoot, 'database.json');
  process.env.ADMIN_EMAIL = 'admin@campus.test';
  process.env.ADMIN_PASSWORD = 'very-secure-admin-password';
  process.env.BASE_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'development';
  delete process.env.SMTP_HOST;

  const { createApp } = require('../server');
  const server = await createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  async function request(route, { cookie, ...options } = {}) {
    const response = await fetch(`${base}${route}`, { ...options, headers: { ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const body = await response.json();
    return { response, body, cookie: response.headers.getSetCookie?.()[0]?.split(';')[0] };
  }

  const adminLogin = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@campus.test', password: 'very-secure-admin-password' }),
  });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, 'admin');
  const adminCookie = adminLogin.cookie;

  const form = new FormData();
  form.set('name', '测试食堂');
  form.set('googleMapsUrl', 'https://www.google.com/maps/place/Test+Restaurant');
  form.set('photo', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'canteen.png');
  const created = await request('/api/restaurants', { method: 'POST', cookie: adminCookie, body: form });
  assert.equal(created.response.status, 201);
  const restaurantId = created.body.restaurant.id;

  const rejectedRegistration = await request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '校外用户', email: 'person@example.com', password: 'password123' }),
  });
  assert.equal(rejectedRegistration.response.status, 400);

  const registration = await request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '小明', email: 'ming@aucklanduni.ac.nz', password: 'password123' }),
  });
  assert.equal(registration.response.status, 201);
  assert.ok(registration.body.previewUrl);

  const earlyLogin = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ming@aucklanduni.ac.nz', password: 'password123' }),
  });
  assert.equal(earlyLogin.response.status, 403);

  const previewUrl = new URL(registration.body.previewUrl);
  const verification = await fetch(`${base}${previewUrl.pathname}${previewUrl.search}`, { redirect: 'manual' });
  assert.equal(verification.status, 302);

  const resetRequest = await request('/api/auth/password-reset/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ming@aucklanduni.ac.nz' }),
  });
  assert.equal(resetRequest.response.status, 200);
  assert.ok(resetRequest.body.previewUrl);
  const resetToken = new URL(resetRequest.body.previewUrl).searchParams.get('token');
  const resetConfirmation = await request('/api/auth/password-reset/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: 'new-password123' }),
  });
  assert.equal(resetConfirmation.response.status, 200);
  const reusedToken = await request('/api/auth/password-reset/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: 'another-password123' }),
  });
  assert.equal(reusedToken.response.status, 400, '重置令牌只能使用一次');


  const oldPasswordLogin = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ming@aucklanduni.ac.nz', password: 'password123' }),
  });
  assert.equal(oldPasswordLogin.response.status, 401, '重置后旧密码必须失效');

  const userLogin = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ming@aucklanduni.ac.nz', password: 'new-password123' }),
  });
  assert.equal(userLogin.response.status, 200);
  const userCookie = userLogin.cookie;

  const beforeRating = await request('/api/restaurants', { cookie: userCookie });
  assert.notEqual(beforeRating.body.restaurants[0].stats, null, '登录后应显示统计');
  assert.equal(beforeRating.body.restaurants[0].stats.average, null, '无人评分时平均分为空');

  const rating = await request(`/api/restaurants/${restaurantId}/rating`, {
    method: 'POST', cookie: userCookie, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 5 }),
  });
  assert.equal(rating.response.status, 200);
  assert.equal(rating.body.restaurant.stats.average, 5);
  assert.equal(rating.body.restaurant.ownRating, 5);

  const changed = await request(`/api/restaurants/${restaurantId}/rating`, {
    method: 'POST', cookie: userCookie, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 2 }),
  });
  assert.equal(changed.body.restaurant.stats.average, 2);
  assert.equal(changed.body.restaurant.stats.count, 1, '修改评分不应新增一条评分');

  const forbiddenCreate = new FormData();
  forbiddenCreate.set('name', '越权餐厅');
  forbiddenCreate.set('photo', new Blob(['x'], { type: 'image/png' }), 'x.png');
  const forbidden = await request('/api/restaurants', { method: 'POST', cookie: userCookie, body: forbiddenCreate });
  assert.equal(forbidden.response.status, 403);

  const deleted = await request(`/api/restaurants/${restaurantId}`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(deleted.response.status, 200);
  const finalList = await request('/api/restaurants', { cookie: adminCookie });
  assert.equal(finalList.body.restaurants.length, 0);
});
