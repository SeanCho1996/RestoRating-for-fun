const { hashPassword, randomToken, tokenHash } = require('./security');
const { sendPasswordResetEmail } = require('./password-reset-mailer');

const GENERIC_MESSAGE = '如果该邮箱对应一个已验证账号，我们会发送密码重置邮件。';

async function handlePasswordReset({ req, res, url, store, sessions, readJson, json, baseUrl, isProduction }) {
  if (req.method === 'POST' && url.pathname === '/api/auth/password-reset/request') {
    const email = String((await readJson(req)).email || '').trim().toLowerCase();
    const user = store.data.users.find((item) => item.email === email && item.verified);
    let preview;

    if (user && (!user.passwordResetLastSentAt || Date.now() - user.passwordResetLastSentAt >= 60_000)) {
      const token = randomToken();
      const resetUrl = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
      await store.mutate(() => {
        user.passwordResetTokenHash = tokenHash(token);
        user.passwordResetExpiresAt = Date.now() + 60 * 60 * 1000;
        user.passwordResetLastSentAt = Date.now();
      });

      try {
        const delivery = await sendPasswordResetEmail({ to: user.email, username: user.username, resetUrl });
        preview = delivery.preview;
      } catch (error) {
        console.error('发送密码重置邮件失败：', error);
        await store.mutate(() => {
          delete user.passwordResetTokenHash;
          delete user.passwordResetExpiresAt;
          delete user.passwordResetLastSentAt;
        });
      }
    }

    json(res, 200, { message: GENERIC_MESSAGE, ...(preview && !isProduction ? { previewUrl: preview } : {}) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/password-reset/confirm') {
    const body = await readJson(req);
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 128) {
      throw Object.assign(new Error('新密码应为 8 至 128 个字符'), { status: 400 });
    }

    const hash = tokenHash(String(body.token || ''));
    const user = store.data.users.find((item) => item.passwordResetTokenHash === hash);
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < Date.now()) {
      throw Object.assign(new Error('重置链接无效或已过期，请重新申请'), { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await store.mutate(() => {
      user.passwordHash = passwordHash;
      user.passwordChangedAt = new Date().toISOString();
      delete user.passwordResetTokenHash;
      delete user.passwordResetExpiresAt;
      delete user.passwordResetLastSentAt;
    });

    for (const [sessionId, session] of sessions) {
      if (session.userId === user.id) sessions.delete(sessionId);
    }

    json(res, 200, { message: '密码已重置，请使用新密码登录。' });
    return true;
  }

  return false;
}

module.exports = { handlePasswordReset };
