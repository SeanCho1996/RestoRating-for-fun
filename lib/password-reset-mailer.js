const tls = require('node:tls');

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function waitForResponse(socket, expected) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => finish(new Error('SMTP 响应超时')), 12000);
    const finish = (error) => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      error ? reject(error) : resolve(buffer);
    };
    const onError = (error) => finish(error);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const last = buffer.split('\r\n').filter(Boolean).at(-1) || '';
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        finish(expected.includes(code) ? null : new Error(`SMTP 错误：${last}`));
      }
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function command(socket, value, expected) {
  const response = waitForResponse(socket, expected);
  socket.write(`${value}\r\n`);
  return response;
}

async function sendPasswordResetEmail({ to, username, resetUrl }) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`[开发模式] ${to} 的密码重置链接：${resetUrl}`);
    return { preview: resetUrl };
  }

  const port = Number(process.env.SMTP_PORT || 465);
  if (process.env.SMTP_SECURE === 'false') throw new Error('密码重置邮件仅支持加密 SMTPS');
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  await waitForResponse(socket, [220]);
  await command(socket, `EHLO ${process.env.SMTP_HELO || 'localhost'}`, [250]);
  if (process.env.SMTP_USER) {
    await command(socket, 'AUTH LOGIN', [334]);
    await command(socket, Buffer.from(process.env.SMTP_USER).toString('base64'), [334]);
    await command(socket, Buffer.from(process.env.SMTP_PASS || '').toString('base64'), [235]);
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Newmarket 食评';
  if (!fromAddress) throw new Error('缺少 SMTP_FROM 配置');
  const html = `<!doctype html><html lang="zh-CN"><body style="font-family:sans-serif;color:#18221d"><h2>重置 Newmarket 食评密码</h2><p>${escapeHtml(username)}，你好！</p><p>我们收到了重置你账号密码的请求。请点击下面的按钮设置新密码：</p><p><a style="display:inline-block;padding:12px 20px;background:#d95f32;color:white;text-decoration:none;border-radius:8px" href="${escapeHtml(resetUrl)}">重置密码</a></p><p>链接将在 1 小时后失效，并且只能使用一次。如果这不是你的操作，请忽略此邮件，你的密码不会改变。</p></body></html>`;
  const message = [
    `From: ${encodeHeader(fromName)} <${fromAddress}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader('重置你的 Newmarket 食评密码')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
  ].join('\r\n').replace(/\r\n\./g, '\r\n..');

  await command(socket, `MAIL FROM:<${fromAddress}>`, [250]);
  await command(socket, `RCPT TO:<${to}>`, [250, 251]);
  await command(socket, 'DATA', [354]);
  await command(socket, `${message}\r\n.`, [250]);
  await command(socket, 'QUIT', [221]);
  socket.end();
  return {};
}

module.exports = { sendPasswordResetEmail };
