import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { claimEvent, closeStore, getSettings, initializeStore, saveSettings } from './store.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const cookieName = 'arg_admin';
const env = (name) => process.env[name] || '';
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '1mb', verify(req, _res, body) { if (req.path === '/webhook') req.rawBody = Buffer.from(body); } }));

function equal(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function signature(value) { return crypto.createHmac('sha256', env('SESSION_SECRET')).update(value).digest('base64url'); }
function authenticated(req) {
  if (!env('SESSION_SECRET')) return false;
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('='); return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
  const [value, sig] = (cookies[cookieName] || '').split('.');
  return value === 'admin' && sig && equal(sig, signature(value));
}
function auth(req, res, next) { if (!authenticated(req)) return res.redirect('/login'); next(); }
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const list = (value) => String(value || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 50);

function page(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ARG Relay</title><style>
  :root{color-scheme:dark;--bg:#0b0c10;--panel:#14161c;--line:#292c35;--muted:#a4a8b2;--text:#f4f4f5;--red:#ef4444;--green:#34d399}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% -10%,#401418 0,transparent 35%),var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:950px;margin:auto;padding:36px 20px 70px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}.mark{width:38px;height:38px;border:1px solid #71333a;border-radius:12px;display:grid;place-items:center;color:#ff777e;background:#241216;font-weight:800}.brand b{letter-spacing:.1em;font-size:13px}.brand span{display:block;color:var(--muted);font-size:12px;letter-spacing:0}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px}h1{font-size:clamp(25px,4vw,34px);line-height:1.1;margin:0 0 8px}p{color:var(--muted);margin:0}.card{background:linear-gradient(145deg,#171920,#111319);border:1px solid var(--line);border-radius:16px;padding:22px;margin:16px 0;box-shadow:0 18px 45px #0002}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:7px;margin:12px 0}label{font-size:13px;font-weight:650;color:#e8e8eb}input,textarea{font:inherit;color:var(--text);background:#0d0f14;border:1px solid #343742;border-radius:9px;padding:11px 12px;outline:none}input:focus,textarea:focus{border-color:#b64b53;box-shadow:0 0 0 3px #b91c1c22}textarea{min-height:112px;resize:vertical}small,.hint{color:var(--muted);font-size:12px}.row{display:flex;align-items:center;justify-content:space-between;gap:16px}.toggle{display:flex;align-items:center;gap:10px}.toggle input{accent-color:var(--red);width:18px;height:18px}.button{border:0;border-radius:9px;background:linear-gradient(135deg,#f0525c,#bc1e2b);color:white;padding:11px 16px;font-weight:750;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}.secondary{background:#242730;border:1px solid #3a3d47;color:#eee}.status{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12px;white-space:nowrap}.dot{width:8px;height:8px;border-radius:50%;background:#777}.dot.on{background:var(--green);box-shadow:0 0 12px #34d39988}.notice{border-left:3px solid #c94a54;padding:12px 14px;background:#211316;border-radius:0 8px 8px 0;color:#e3c3c5;font-size:13px}.error{color:#ff8a8a;margin:8px 0}.footer{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.pill{display:inline-block;padding:3px 8px;border-radius:6px;background:#252832;color:#d6d7dc;font-size:12px}.signin{max-width:420px;margin:10vh auto}.toggle input{cursor:pointer}@media(max-width:700px){main{padding:24px 14px}.grid{grid-template-columns:1fr}.card{padding:17px}.top{align-items:center}}
  </style></head><body><main><div class="brand"><div class="mark">AR</div><div><b>ARG RELAY</b><span>Instagram automation control</span></div></div>${content}</main></body></html>`;
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/login', (_req, res) => res.type('html').send(page('Sign in', `<section class="card signin"><h1>Sign in</h1><p>Open your ARG automation settings.</p><form method="post" action="/login"><div class="field"><label for="password">Admin password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="button">Continue</button></form></section>`)));
app.post('/login', (req, res) => {
  if (!env('ADMIN_PASSWORD') || !env('SESSION_SECRET')) return res.status(503).send('Set ADMIN_PASSWORD and SESSION_SECRET in your hosting environment first.');
  if (!equal(req.body.password || '', env('ADMIN_PASSWORD'))) return res.status(401).type('html').send(page('Sign in', `<section class="card signin"><h1>Sign in</h1><p>Open your ARG automation settings.</p><div class="error">That password didn’t match. Try again.</div><form method="post" action="/login"><div class="field"><label for="password">Admin password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="button">Continue</button></form></section>`));
  const val = 'admin'; const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${val}.${signature(val)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`); res.redirect('/');
});
app.post('/logout', auth, (_req, res) => { res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`); res.redirect('/login'); });

app.get('/', auth, async (_req, res, next) => {
  try {
    const s = await getSettings();
    const connected = Boolean(env('META_IG_USER_ID') && env('META_IG_ACCESS_TOKEN') && env('META_APP_SECRET'));
    const status = s.enabled ? '<span class="status"><i class="dot on"></i>Automation enabled</span>' : '<span class="status"><i class="dot"></i>Paused</span>';
    const callback = `${esc(env('APP_BASE_URL') || 'https://your-service.onrender.com')}/webhook`;
    const content = `<div class="top"><div><h1>Campaign settings</h1><p>Edit these settings for each new ARG. Your Meta credentials remain private in the host settings.</p></div>${status}</div>
    <div class="notice">Meta connection: <b>${connected ? 'credentials are configured' : 'not configured yet'}</b>. Keep replies paused until the API setup is complete.</div>
    <form method="post" action="/settings">
    <section class="card"><div class="row"><div><h2 style="font-size:18px;margin:0 0 4px">Campaign</h2><small>Set the current project and where participants should go.</small></div><label class="toggle"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}><span>Enable replies</span></label></div>
    <div class="grid"><div class="field"><label for="campaignName">Campaign name</label><input id="campaignName" name="campaignName" value="${esc(s.campaignName)}" maxlength="100" required></div><div class="field"><label for="discordInvite">Discord invite link</label><input id="discordInvite" name="discordInvite" type="url" value="${esc(s.discordInvite)}" maxlength="500" required></div></div></section>
    <section class="card"><h2 style="font-size:18px;margin:0 0 4px">Direct messages</h2><small>Reply when someone DMs your account using one of these words.</small><div class="field"><label for="dmKeywords">DM trigger words</label><textarea id="dmKeywords" name="dmKeywords">${esc(s.dmKeywords.join('\n'))}</textarea><small>One per line. Leave blank to reply to any new text DM.</small></div><div class="field"><label for="dmReply">Automatic DM reply</label><textarea id="dmReply" name="dmReply" required>${esc(s.dmReply)}</textarea><small>Placeholders: <code>{campaign}</code> and <code>{discord_link}</code>.</small></div></section>
    <section class="card"><h2 style="font-size:18px;margin:0 0 4px">Post and Reel comments</h2><small>Send a private reply to a matching comment. Instagram permits one private reply per comment.</small><div class="field"><label for="commentKeywords">Comment trigger words</label><textarea id="commentKeywords" name="commentKeywords">${esc(s.commentKeywords.join('\n'))}</textarea><small>One per line. Leave blank to reply to any comment.</small></div><div class="field"><label for="commentReply">Private reply (sent as a DM)</label><textarea id="commentReply" name="commentReply" required>${esc(s.commentReply)}</textarea><small>Include the invite and joining instructions in this message. Placeholders: <code>{campaign}</code> and <code>{discord_link}</code>.</small></div></section>
    <section class="card"><h2 style="font-size:18px;margin:0 0 4px">Meta webhook</h2><p>Use this callback URL in your Meta developer app. Subscribe to the Instagram <code>messages</code> and <code>comments</code> fields.</p><div class="field"><label for="callback">Callback URL</label><input id="callback" value="${callback}" readonly onclick="this.select()"></div><div class="hint">Webhook verification token is the value of <code>META_VERIFY_TOKEN</code> in your hosting environment.</div></section>
    <div class="row"><span class="hint">Saving updates the live campaign settings.</span><button class="button" type="submit">Save campaign</button></div></form>
    <div class="footer"><span class="hint">Service check: <a href="/health" style="color:#ff8b91">/health</a></span><form method="post" action="/logout"><button class="button secondary">Sign out</button></form></div>`;
    res.type('html').send(page('Campaign settings', content));
  } catch (error) { next(error); }
});

app.post('/settings', auth, async (req, res, next) => {
  try {
    const settings = {
      campaignName: String(req.body.campaignName || '').trim().slice(0, 100),
      enabled: req.body.enabled === 'on',
      discordInvite: String(req.body.discordInvite || '').trim().slice(0, 500),
      dmKeywords: list(req.body.dmKeywords), commentKeywords: list(req.body.commentKeywords),
      dmReply: String(req.body.dmReply || '').slice(0, 2000),
      commentReply: String(req.body.commentReply || '').slice(0, 2000), ignoreOwnMessages: true
    };
    if (!settings.campaignName || !/^https:\/\//i.test(settings.discordInvite) || !settings.dmReply || !settings.commentReply) return res.status(400).send('Campaign name, HTTPS invite link, and both replies are required.');
    await saveSettings(settings); res.redirect('/');
  } catch (error) { next(error); }
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']; const challenge = req.query['hub.challenge']; const verify = req.query['hub.verify_token'];
  if (env('META_VERIFY_TOKEN') && mode === 'subscribe' && equal(verify || '', env('META_VERIFY_TOKEN'))) return res.status(200).send(String(challenge || ''));
  return res.sendStatus(403);
});

function verifyWebhook(req, res, next) {
  const secret = env('META_APP_SECRET'); const raw = req.rawBody;
  if (!secret || !raw) return res.sendStatus(401);
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (!equal(req.get('x-hub-signature-256') || '', expected)) return res.sendStatus(401);
  next();
}
function replyText(template, settings) { return template.replaceAll('{campaign}', settings.campaignName).replaceAll('{discord_link}', settings.discordInvite); }
function matches(text, keywords) { return Boolean(text) && (!keywords.length || keywords.some((word) => text.toLocaleLowerCase().includes(word.toLocaleLowerCase()))); }

async function callMeta(body) {
  const version = env('META_GRAPH_API_VERSION') || 'v27.0';
  const access = env('META_IG_ACCESS_TOKEN');
  const igUserId = env('META_IG_USER_ID');
  if (!access || !igUserId) throw new Error('Instagram account ID or access token is not configured.');
  const response = await fetch(`https://graph.instagram.com/${version}/${igUserId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Meta Send API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
async function handleDm(event) {
  const message = event.message;
  if (!message?.text || message.is_echo || message.is_self || !event.sender?.id) return;
  const settings = await getSettings(); if (!settings.enabled || !matches(message.text, settings.dmKeywords)) return;
  const id = message.mid || `${event.sender.id}:${event.timestamp}:${message.text}`;
  if (!(await claimEvent(`dm:${id}`))) return;
  await callMeta({ recipient: { id: event.sender.id }, message: { text: replyText(settings.dmReply, settings) } });
}
async function handleComment(value) {
  if (!value.id || !value.text || !value.from?.id) return;
  const settings = await getSettings(); if (!settings.enabled || !matches(value.text, settings.commentKeywords)) return;
  if (env('META_IG_USER_ID') && settings.ignoreOwnMessages && value.from.id === env('META_IG_USER_ID')) return;
  if (!(await claimEvent(`comment:${value.id}`))) return;
  await callMeta({ recipient: { comment_id: value.id }, message: { text: replyText(settings.commentReply, settings) } });
}
app.post('/webhook', verifyWebhook, (req, res) => {
  res.sendStatus(200);
  const payload = req.body;
  if (payload?.object !== 'instagram') return;
  const tasks = [];
  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) tasks.push(() => handleDm(event));
    for (const change of entry.changes || []) if (change.field === 'comments') tasks.push(() => handleComment(change.value || {}));
  }
  void (async () => { for (const task of tasks) { try { await task(); } catch (error) { console.error('[webhook]', error.message); } } })();
});

app.use((error, _req, res, _next) => { console.error('[server]', error.message); res.status(500).send('Something went wrong. Check the service logs.'); });
await initializeStore();
const server = app.listen(port, () => console.log(`ARG Relay listening on ${port}`));
async function shutdown() { server.close(async () => { await closeStore(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
