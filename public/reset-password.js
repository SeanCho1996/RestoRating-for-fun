const form = document.querySelector('#resetPasswordForm');
const token = new URLSearchParams(location.search).get('token') || '';
history.replaceState({}, '', '/reset-password.html');

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = message;
  document.querySelector('#resetToast').append(item);
  setTimeout(() => item.remove(), 4000);
}

if (!token) {
  form.classList.add('hidden');
  document.querySelector('#resetDescription').textContent = '重置链接无效或缺少令牌，请重新申请。';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  if (password !== data.get('confirmation')) return toast('两次输入的密码不一致', true);

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '正在重置…';
  try {
    const response = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '重置失败，请重新申请');
    document.querySelector('.reset-panel').innerHTML = `<div class="reset-success"><h2>密码已重置</h2><p>请使用新密码重新登录。</p><a class="btn btn-primary" href="/">返回首页登录</a></div>`;
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
    button.textContent = '确认重置密码';
  }
});
