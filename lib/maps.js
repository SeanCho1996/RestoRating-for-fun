function normalizeGoogleMapsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw Object.assign(new Error('请输入 Google 地图链接'), { status: 400 });
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Google 地图链接格式不正确'), { status: 400 });
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const googleHost = /(^|\.)google\.(com|co\.nz)$/.test(host);
  const googleMapsPath = url.pathname === '/maps' || url.pathname.startsWith('/maps/');
  const shortMapsLink = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'));

  if (url.protocol !== 'https:' || (!shortMapsLink && !(googleHost && googleMapsPath))) {
    throw Object.assign(new Error('请使用有效的 Google Maps HTTPS 链接'), { status: 400 });
  }

  return url.toString();
}

function mapUrlForRestaurant(restaurant) {
  if (restaurant.googleMapsUrl) return restaurant.googleMapsUrl;
  const query = encodeURIComponent(`${restaurant.name} Newmarket Auckland`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

module.exports = { normalizeGoogleMapsUrl, mapUrlForRestaurant };
