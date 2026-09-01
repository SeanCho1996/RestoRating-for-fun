const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Store } = require('./lib/store');
const { hashPassword, verifyPassword, randomToken, tokenHash } = require('./lib/security');
const { parseMultipart } = require('./lib/multipart');
const { sendVerificationEmail } = require('./lib/mailer');
const { normalizeGoogleMapsUrl, mapUrlForRestaurant } = require('./lib/maps');
const { handlePasswordReset } = require('./lib/password-reset-routes');
const { optimizeUploadedImage } = require('./lib/image-processor');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 35774);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const isProduction = process.env.NODE_ENV === 'production';
const store = new Store(process.env.DATA_FILE || path.join(ROOT, 'data', 'database.json'));
const sessions = new Map();
const RATING_LABELS = { 1: '拉完了', 2: 'NPC', 3: '人上人', 4: '顶级', 5: '夯' };
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

async function readBody(req, max = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, '请求内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buffer = await readBody(req);
  try { return JSON.parse(buffer.toString('utf8') || '{}'); }
  catch { fail(400, '请求格式不正确'); }
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, role: user.role, verified: user.verified };
}

function currentUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  const session = sid && sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    if (sid) sessions.delete(sid);
    return null;
  }
  return store.data.users.find((user) => user.id === session.userId) || null;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) fail(401, '请先登录');
  return user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') fail(403, '只有管理员可以执行此操作');
  return user;
}

function ensureSameOrigin(req) {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (origin && origin !== new URL(BASE_URL).origin) fail(403, '请求来源不受信任');
}

function restaurantView(restaurant, user) {
  const ratings = store.data.ratings.filter((rating) => rating.restaurantId === restaurant.id);
  const own = user ? ratings.find((rating) => rating.userId === user.id) : null;
  const canSeeStats = Boolean(user);
  const average = ratings.length ? ratings.reduce((sum, item) => sum + item.value, 0) / ratings.length : null;
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((value) => [value, ratings.filter((item) => item.value === value).length]));
  return {
    id: restaurant.id,
    name: restaurant.name,
    thumbnailUrl: restaurant.thumbnailUrl || restaurant.photoUrl,
    photoUrl: restaurant.photoUrl,
    googleMapsUrl: mapUrlForRestaurant(restaurant),
    createdAt: restaurant.createdAt,
    ownRating: own?.value || null,
    stats: canSeeStats ? { average: average === null ? null : Number(average.toFixed(2)), count: ratings.length, distribution } : null,
  };
}

async function saveImage(file) {
  if (!file?.data?.length) fail(400, '请选择餐厅照片');
  const extension = IMAGE_TYPES[file.type];
  if (!extension) fail(400, '照片仅支持 JPG、PNG、WebP 或 GIF 格式');
  if (file.data.length > 5 * 1024 * 1024) fail(413, '图片不能超过 5MB');
  try {
    return await optimizeUploadedImage(file.data, extension, path.join(ROOT, 'uploads'));
  } catch (error) {
    console.error('图片处理失败：', error);
    fail(400, '图片无法处理，请尝试其他照片');
  }
}

async function deleteImage(photoUrl) {
  if (!photoUrl?.startsWith('/uploads/')) return;
  const filename = path.basename(photoUrl);
  await fs.unlink(path.join(ROOT, 'uploads', filename)).catch((error) => {
    if (error.code !== 'ENOENT') console.error('删除旧图片失败：', error);
  });
}

async function handleApi(req, res, url) {
  ensureSameOrigin(req);

  if (await handlePasswordReset({ req, res, url, store, sessions, readJson, json, baseUrl: BASE_URL, isProduction })) return;

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = currentUser(req);
    return json(res, 200, { user: user ? publicUser(user) : null, ratingLabels: RATING_LABELS });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (username.length < 2 || username.length > 30) fail(400, '昵称应为 2 至 30 个字符');
    if (!/^[a-z0-9._%+-]+@aucklanduni[.]ac[.]nz$/.test(email)) fail(400, '仅支持 @aucklanduni.ac.nz 奥大学生邮箱注册');
    if (password.length < 8 || password.length > 128) fail(400, '密码至少需要 8 个字符');
    if (store.data.users.some((user) => user.email === email)) fail(409, '该邮箱已注册');
    const token = randomToken();
    const user = {
      id: crypto.randomUUID(), username, email, passwordHash: await hashPassword(password), role: 'user', verified: false,
      verificationTokenHash: tokenHash(token), verificationExpiresAt: Date.now() + 24 * 60 * 60 * 1000, createdAt: new Date().toISOString(),
    };
    await store.mutate((data) => data.users.push(user));
    const verificationUrl = `${BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
    try {
      const delivery = await sendVerificationEmail({ to: email, username, verificationUrl });
      return json(res, 201, { message: '注册成功！验证邮件已发送，请在 24 小时内查收并验证。', ...(delivery.preview && !isProduction ? { previewUrl: delivery.preview } : {}) });
    } catch (error) {
      console.error('发送验证邮件失败：', error);
      return json(res, 201, { message: '账号已创建，但验证邮件暂时发送失败。请稍后使用“重发验证邮件”。' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/verify') {
    const hash = tokenHash(url.searchParams.get('token') || '');
    const user = store.data.users.find((item) => item.verificationTokenHash === hash);
    if (!user || user.verificationExpiresAt < Date.now()) {
      res.writeHead(302, { Location: '/?verification=invalid' }); return res.end();
    }
    await store.mutate(() => {
      user.verified = true;
      delete user.verificationTokenHash;
      delete user.verificationExpiresAt;
    });
    res.writeHead(302, { Location: '/?verification=success' }); return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/resend') {
    const email = String((await readJson(req)).email || '').trim().toLowerCase();
    const user = store.data.users.find((item) => item.email === email);
    let preview;
    if (user && !user.verified) {
      const token = randomToken();
      await store.mutate(() => {
        user.verificationTokenHash = tokenHash(token);
        user.verificationExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
      });
      const result = await sendVerificationEmail({ to: email, username: user.username, verificationUrl: `${BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}` }).catch((error) => console.error(error));
      preview = result?.preview;
    }
    return json(res, 200, { message: '如果该邮箱已注册且尚未验证，我们会发送一封新邮件。', ...(preview && !isProduction ? { previewUrl: preview } : {}) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const user = store.data.users.find((item) => item.email === email);
    if (!user || !(await verifyPassword(String(body.password || ''), user.passwordHash))) fail(401, '邮箱或密码不正确');
    if (!user.verified) fail(403, '请先验证邮箱后再登录');
    const sid = randomToken();
    sessions.set(sid, { userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${isProduction ? '; Secure' : ''}` });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) sessions.delete(sid);
    return json(res, 200, { message: '已退出登录' }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (req.method === 'GET' && url.pathname === '/api/restaurants') {
    const user = currentUser(req);
    return json(res, 200, { restaurants: store.data.restaurants.map((item) => restaurantView(item, user)), ratingLabels: RATING_LABELS });
  }

  if (req.method === 'POST' && url.pathname === '/api/restaurants') {
    const admin = requireAdmin(req);
    const body = await readBody(req, 5.5 * 1024 * 1024);
    const { fields, files } = parseMultipart(body, req.headers['content-type'], 5.5 * 1024 * 1024);
    const name = String(fields.name || '').trim();
    if (name.length < 2 || name.length > 80) fail(400, '餐厅名称应为 2 至 80 个字符');
    const googleMapsUrl = normalizeGoogleMapsUrl(fields.googleMapsUrl);
    const image = await saveImage(files.photo);
    const restaurant = { id: crypto.randomUUID(), name, ...image, googleMapsUrl, createdBy: admin.id, createdAt: new Date().toISOString() };
    await store.mutate((data) => data.restaurants.push(restaurant));
    return json(res, 201, { restaurant: restaurantView(restaurant, admin) });
  }

  const restaurantMatch = url.pathname.match(/^\/api\/restaurants\/([a-f0-9-]+)$/i);
  if (restaurantMatch && req.method === 'PUT') {
    const admin = requireAdmin(req);
    const restaurant = store.data.restaurants.find((item) => item.id === restaurantMatch[1]);
    if (!restaurant) fail(404, '找不到该餐厅');
    const body = await readBody(req, 5.5 * 1024 * 1024);
    const { fields, files } = parseMultipart(body, req.headers['content-type'], 5.5 * 1024 * 1024);
    const name = String(fields.name || '').trim();
    if (name.length < 2 || name.length > 80) fail(400, '餐厅名称应为 2 至 80 个字符');
    const googleMapsUrl = normalizeGoogleMapsUrl(fields.googleMapsUrl);
    const oldImage = { photoUrl: restaurant.photoUrl, thumbnailUrl: restaurant.thumbnailUrl };
    const newImage = files.photo?.data?.length ? await saveImage(files.photo) : oldImage;
    await store.mutate(() => { restaurant.name = name; restaurant.photoUrl = newImage.photoUrl; restaurant.thumbnailUrl = newImage.thumbnailUrl; restaurant.googleMapsUrl = googleMapsUrl; restaurant.updatedAt = new Date().toISOString(); });
    if (newImage.photoUrl !== oldImage.photoUrl) await Promise.all([deleteImage(oldImage.photoUrl), deleteImage(oldImage.thumbnailUrl)]);
    return json(res, 200, { restaurant: restaurantView(restaurant, admin) });
  }

  if (restaurantMatch && req.method === 'DELETE') {
    requireAdmin(req);
    const index = store.data.restaurants.findIndex((item) => item.id === restaurantMatch[1]);
    if (index < 0) fail(404, '找不到该餐厅');
    const restaurant = store.data.restaurants[index];
    await store.mutate((data) => {
      data.restaurants.splice(index, 1);
      data.ratings = data.ratings.filter((rating) => rating.restaurantId !== restaurant.id);
    });
    await deleteImage(restaurant.photoUrl);
    await deleteImage(restaurant.thumbnailUrl);
    return json(res, 200, { message: '餐厅已删除' });
  }

  const ratingMatch = url.pathname.match(/^\/api\/restaurants\/([a-f0-9-]+)\/rating$/i);
  if (ratingMatch && req.method === 'POST') {
    const user = requireUser(req);
    if (user.role !== 'user') fail(403, '管理员不能参与评分');
    const restaurant = store.data.restaurants.find((item) => item.id === ratingMatch[1]);
    if (!restaurant) fail(404, '找不到该餐厅');
    const value = Number((await readJson(req)).value);
    if (!Number.isInteger(value) || value < 1 || value > 5) fail(400, '请选择有效的评分');
    await store.mutate((data) => {
      const existing = data.ratings.find((rating) => rating.restaurantId === restaurant.id && rating.userId === user.id);
      if (existing) { existing.value = value; existing.updatedAt = new Date().toISOString(); }
      else data.ratings.push({ id: crypto.randomUUID(), restaurantId: restaurant.id, userId: user.id, value, createdAt: new Date().toISOString() });
    });
    return json(res, 200, { message: '评分已保存', restaurant: restaurantView(restaurant, user) });
  }

  fail(404, '接口不存在');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon' };

async function serveStatic(res, pathname) {
  const base = pathname.startsWith('/uploads/') ? path.join(ROOT, 'uploads') : path.join(ROOT, 'public');
  const relative = pathname.startsWith('/uploads/') ? pathname.slice('/uploads/'.length) : (pathname === '/' ? 'index.html' : pathname.slice(1));
  const filePath = path.resolve(base, relative);
  if (!filePath.startsWith(`${path.resolve(base)}${path.sep}`)) fail(403, '禁止访问');
  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const cacheControl = pathname.startsWith('/uploads/')
      ? 'public, max-age=31536000, immutable'
      : extension === '.html'
        ? 'no-cache'
        : 'public, max-age=300, stale-while-revalidate=86400';
    res.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream', 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') fail(404, '页面不存在');
    throw error;
  }
}

async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) {
    console.warn('提示：未设置 ADMIN_EMAIL 和 ADMIN_PASSWORD，管理员账号尚未初始化。');
    return;
  }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD 至少需要 10 个字符');
  const existing = store.data.users.find((user) => user.email === email);
  if (existing) {
    if (existing.role !== 'admin') await store.mutate(() => { existing.role = 'admin'; existing.verified = true; });
    return;
  }
  await store.mutate(async (data) => data.users.push({
    id: crypto.randomUUID(), username: process.env.ADMIN_NAME || '管理员', email, passwordHash: await hashPassword(password), role: 'admin', verified: true, createdAt: new Date().toISOString(),
  }));
  console.log(`管理员账号已创建：${email}`);
}

async function createApp() {
  await store.init();
  await seedAdmin();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE_URL);
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(res, decodeURIComponent(url.pathname));
    } catch (error) {
      console.error(error.status ? `${error.status} ${error.message}` : error);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : '服务器暂时出错，请稍后再试' });
      else res.end();
    }
  });
}

if (require.main === module) {
  createApp().then((server) => server.listen(PORT, HOST, () => console.log(`Newmarket 食评已启动：${BASE_URL}`))).catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { createApp, store, RATING_LABELS };
