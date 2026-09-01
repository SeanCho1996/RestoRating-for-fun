function parseMultipart(buffer, contentType, maxBytes = 5 * 1024 * 1024) {
  if (buffer.length > maxBytes) throw Object.assign(new Error('图片不能超过 5MB'), { status: 413 });
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw Object.assign(new Error('上传格式不正确'), { status: 400 });
  const boundary = `--${match[1] || match[2]}`;
  const raw = buffer.toString('latin1');
  const fields = {};
  const files = {};

  for (const part of raw.split(boundary).slice(1, -1)) {
    const clean = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const divider = clean.indexOf('\r\n\r\n');
    if (divider < 0) continue;
    const headers = clean.slice(0, divider);
    const body = clean.slice(divider + 4);
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
    if (!disposition) continue;
    const name = disposition[1];
    if (disposition[2] !== undefined) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || 'application/octet-stream';
      files[name] = { filename: disposition[2], type, data: Buffer.from(body, 'latin1') };
    } else {
      fields[name] = Buffer.from(body, 'latin1').toString('utf8');
    }
  }
  return { fields, files };
}

module.exports = { parseMultipart };
