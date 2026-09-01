const net = require('node:net');
const tls = require('node:tls');

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function waitForResponse(socket, expected) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => done(new Error('SMTP 响应超时')), 12000);
    const done = (error) => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      error ? reject(error) : resolve(buffer);
    };
    const onError = (error) => done(error);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines.at(-1) || '';
      if (/^\d{3} /.test(last)) {
        if (!expected.includes(Number(last.slice(0, 3)))) done(new Error(`SMTP 错误：${last}`));
        else done();
      }
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function command(socket, text, expected) {
  const response = waitForResponse(socket, expected);
  socket.write(`${text}\r\n`);
  return response;
}

async function sendVerificationEmail({ to, username, verificationUrl }) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`[开发模式] ${to} 的邮箱验证链接：${verificationUrl}`);
    return { preview: verificationUrl };
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== 'false';
  if (!secure) throw new Error('为保护邮箱密码，本应用仅支持 SMTPS；请设置 SMTP_SECURE=true 并使用 465 端口');
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
  const html = `<!doctype html><html lang="zh-CN"><body style="font-family:sans-serif;color:#18221d"><h2>欢迎加入 Newmarket 食评</h2><p>${escapeHtml(username)}，你好！</p><p>请点击下面的按钮验证你的邮箱：</p><p><a style="display:inline-block;padding:12px 20px;background:#ef6c35;color:white;text-decoration:none;border-radius:8px" href="${escapeHtml(verificationUrl)}">验证邮箱</a></p><p>链接将在 24 小时后失效。如果这不是你的操作，可以忽略此邮件。</p></body></html>`;
  const message = [
    `From: ${encodeHeader(fromName)} <${fromAddress}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader('验证你的 Newmarket 食评邮箱')}`,
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

module.exports = { sendVerificationEmail };
