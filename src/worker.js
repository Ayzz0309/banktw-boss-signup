const ALLOWED_FIELDS = [
  'gameId', 'job', 'level', 'snow', 'bdmg', 'ignore', 'totaldmg', 'mainstat',
  'prevScore', 'currScore', 'activeTime', 'note', 'contact', 'arrangeTeam', 'screenshot'
];
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4MB safety cap (fields + screenshot)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === '/api/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      if (pathname === '/api/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      if (pathname === '/api/profile' && request.method === 'GET') {
        return await handleProfile(request, env);
      }
      if (pathname === '/api/save' && request.method === 'POST') {
        return await handleSave(request, env);
      }
      if (pathname === '/api/admin/list' && request.method === 'POST') {
        return await handleAdminList(request, env);
      }
    } catch (e) {
      return json({ error: '伺服器發生錯誤，請稍後再試' }, 500);
    }

    // Anything that isn't an API route: let static asset serving handle it
    // (this only runs for paths that didn't already match a file, since
    // matched assets are served before the Worker is invoked at all).
    return env.ASSETS.fetch(request);
  }
};

// ---------- helpers ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password + ':banktw-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

async function hmac(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufferToHex(sigBuffer);
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function fromBase64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

async function createToken(id, env) {
  const payloadStr = JSON.stringify({ id, ts: Date.now() });
  const payloadB64 = toBase64(payloadStr);
  const sig = await hmac(payloadB64, env.SESSION_SECRET);
  return payloadB64 + '.' + sig;
}

async function verifyToken(token, env) {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return null;
  const payloadB64 = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = await hmac(payloadB64, env.SESSION_SECRET);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(fromBase64(payloadB64));
    return payload.id || null;
  } catch (e) {
    return null;
  }
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// ---------- route handlers ----------

async function handleRegister(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '請求格式錯誤' }, 400); }

  const id = (body.id || '').trim();
  const password = body.password || '';
  if (!id || !password) return json({ error: '請輸入 ID 與密碼' }, 400);
  if (id.length > 40) return json({ error: 'ID 太長了，請縮短一點' }, 400);
  if (password.length < 4) return json({ error: '密碼至少需要 4 個字元' }, 400);

  const key = 'account:' + id;
  const existing = await env.BANKTW_KV.get(key);
  if (existing) return json({ error: '這個 ID 已經被註冊了，請直接登入或換一個 ID' }, 409);

  const pwHash = await hashPassword(password);
  await env.BANKTW_KV.put(key, JSON.stringify({ pwHash, createdAt: Date.now() }));

  const token = await createToken(id, env);
  return json({ ok: true, token, id });
}

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '請求格式錯誤' }, 400); }

  const id = (body.id || '').trim();
  const password = body.password || '';
  if (!id || !password) return json({ error: '請輸入 ID 與密碼' }, 400);

  const raw = await env.BANKTW_KV.get('account:' + id);
  if (!raw) return json({ error: '找不到這個 ID，請先註冊' }, 404);

  const account = JSON.parse(raw);
  const pwHash = await hashPassword(password);
  if (pwHash !== account.pwHash) return json({ error: '密碼錯誤' }, 401);

  const token = await createToken(id, env);
  return json({ ok: true, token, id });
}

async function handleProfile(request, env) {
  const token = getBearerToken(request);
  const id = await verifyToken(token, env);
  if (!id) return json({ error: '請重新登入' }, 401);

  const raw = await env.BANKTW_KV.get('chardata:' + id);
  const data = raw ? JSON.parse(raw) : null;
  return json({ ok: true, data });
}

async function handleSave(request, env) {
  const token = getBearerToken(request);
  const id = await verifyToken(token, env);
  if (!id) return json({ error: '請重新登入' }, 401);

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: '資料太大了，截圖請壓縮到 3MB 以下再上傳' }, 413);
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) { return json({ error: '請求格式錯誤' }, 400); }

  const clean = {};
  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) clean[field] = payload[field];
  }
  clean.updatedAt = Date.now();

  await env.BANKTW_KV.put('chardata:' + id, JSON.stringify(clean));
  return json({ ok: true, updatedAt: clean.updatedAt });
}

async function handleAdminList(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '請求格式錯誤' }, 400); }

  if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
    return json({ error: '密碼錯誤' }, 401);
  }

  const list = await env.BANKTW_KV.list({ prefix: 'chardata:' });
  const members = [];
  for (const entry of list.keys) {
    const raw = await env.BANKTW_KV.get(entry.name);
    if (!raw) continue;
    const data = JSON.parse(raw);
    members.push(Object.assign({ id: entry.name.replace(/^chardata:/, '') }, data));
  }
  members.sort((a, b) => (Number(b.currScore) || 0) - (Number(a.currScore) || 0));

  return json({ ok: true, members });
}
