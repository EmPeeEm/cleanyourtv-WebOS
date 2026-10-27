// Open an app on an Android box instead of on the TV. For each app listed in the settings (the TV's app id, e.g. "plex"), launching it
// from the launcher switches the TV to the HDMI input the box is on and starts the box's app over ADB (network, port 5555).
//   GET  /api/androidbox        the settings, whether the key exists, what the last start did, and the phone page's state
//   POST /api/androidbox        {host, port, input, apps: {<TV app id>: <Android package>}} saves the settings; an empty host switches it off
//   POST /api/androidbox/test   connects to the box and asks for its model, without switching the input
//   POST /api/androidbox/pair   {stop?} opens (or closes) the phone page on the LAN, port 8793, with a code shown on the TV
// The settings are kept in config.json (androidBox), apart from the launcher's own keys. The box must have network debugging on; the first
// connection makes it ask once to allow this TV (the key is made on the TV and kept in the service folder, adb/adbkey). The talking to
// the box is adbclient.js: no adb program is needed. Every value is checked before it is used.
const http = require('http'),
  path = require('path');
const P = require('./paths'),
  web = require('./web'),
  i18n = require('./i18n'),
  nc = require('./netcompat'),
  adbclient = require('./adbclient'),
  page = require('./androidboxpage');

const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9][A-Za-z0-9.\-]{0,62})$/;
const APP = /^[\w.\-]{1,100}$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;
const INPUT = /^com\.webos\.app\.hdmi\d{1,2}$/;
const MAX_APPS = 20;
const PAIR_PORT = 8793, // after the Cards page (8792)
  PAIR_MS = 10 * 60 * 1000;
const KEY_FILE = () => path.join(P.D, 'adb', 'adbkey'); // the key the box allows; a key copied from a computer (~/.android/adbkey) works too

// the settings as they may be stored: only what is valid, or null when the box is not set up
function clean(b) {
  const o = b && typeof b === 'object' ? b : {};
  const host = typeof o.host === 'string' ? o.host.trim() : '';
  if (!HOST.test(host)) return null;
  const port = Math.round(Number(o.port) || 5555);
  if (!INPUT.test(o.input || '')) return null;
  const apps = {};
  const src = o.apps && typeof o.apps === 'object' && !Array.isArray(o.apps) ? o.apps : {};
  Object.keys(src)
    .slice(0, MAX_APPS)
    .forEach(id => {
      if (APP.test(id) && typeof src[id] === 'string' && PACKAGE.test(src[id])) apps[id] = src[id];
    });
  if (!Object.keys(apps).length) return null;
  return { host, port: port > 0 && port < 65536 ? port : 5555, input: o.input, apps };
}

// what is wrong with a request that is not valid, for the person typing it
function why(o) {
  if (!HOST.test(typeof o.host === 'string' ? o.host.trim() : '')) return 'The address of the box is not valid.';
  if (!INPUT.test(o.input || '')) return 'Choose the HDMI input the box is on.';
  return 'Add at least one app with its Android package, for example ' + page.PLEX + '.';
}

function create(ctx) {
  const { config, luna } = ctx;
  let savedAt = 0; // when the settings last changed, for the manager to see that the phone saved
  let last = null; // what the last start did: {at, app, ok, step, error}
  let busy = 0; // the time a start began; a second tap meanwhile is ignored

  const settings = () => clean(config.get().androidBox);

  const failure = (step, error) => ({ ok: false, step, error });

  // connect and run one shell command on the box; resolves {ok, step, error, out}
  async function onBox(cfg, command) {
    let key;
    try {
      key = await adbclient.ensureKey(KEY_FILE());
    } catch (e) {
      return failure('key', e.message);
    }
    return adbclient.run({ host: cfg.host, port: cfg.port, command, key, authMs: Number(process.env.CYTV_ADB_AUTH_MS) || 30000 });
  }

  // the TV's own input app is launched, like a pinned input (apps.js)
  const switchInput = cfg => luna('luna://com.webos.applicationManager/launch', { id: cfg.input, params: {} });

  async function startOnBox(cfg, id) {
    const pkg = cfg.apps[id];
    // wake the box, then start the app by its launcher entry (no need to know the activity name)
    const r = await onBox(cfg, 'input keyevent KEYCODE_WAKEUP; monkey -p ' + pkg + ' -c android.intent.category.LAUNCHER 1');
    let res = r;
    if (r.ok && /No activities found|monkey aborted/i.test(r.out)) res = failure('launch', pkg + ' is not installed on the box');
    last = { at: Date.now(), app: id, ok: res.ok, step: res.step, error: res.error };
    console.log('androidbox: ' + id + ' -> ' + pkg + (res.ok ? ' started' : ' failed at ' + res.step + ': ' + res.error));
    return res;
  }

  const handles = id => !!(settings() && settings().apps[id]);

  // switch the input now; the app is started on the box in the background (adb takes seconds), and the result is in /api/androidbox
  async function open(id) {
    const cfg = settings();
    if (!cfg || !cfg.apps[id]) return null;
    if (busy && Date.now() - busy < 60000) return { returnValue: true, androidBox: 'busy' }; // the box may be waiting for its owner to answer
    busy = Date.now();
    const sw = await switchInput(cfg);
    startOnBox(cfg, id)
      .catch(e => console.error('androidbox: ' + ((e && e.stack) || e)))
      .then(() => {
        busy = 0;
      });
    return { returnValue: sw.returnValue !== false, androidBox: 'starting' };
  }

  async function status() {
    return {
      configured: !!settings(),
      settings: settings(),
      key: { ready: adbclient.keyExists(KEY_FILE()), path: KEY_FILE() },
      last,
      pairing: !!pair,
      savedAt,
    };
  }

  async function save(b) {
    const o = b && typeof b === 'object' ? b : {};
    const off = typeof o.host === 'string' && !o.host.trim();
    const next = off ? null : clean(o);
    if (!off && !next) return { error: why(o) };
    config.update('androidbox', c => {
      if (next) c.androidBox = next;
      else delete c.androidBox;
    });
    savedAt = Date.now();
    return status();
  }

  async function test() {
    const cfg = settings();
    if (!cfg) return { ok: false, step: 'settings', error: 'the box is not set up' };
    const r = await onBox(cfg, 'getprop ro.product.model');
    return { ok: r.ok, step: r.step, error: r.error, model: r.ok ? r.out.split('\n')[0] : '' };
  }

  // ---- the phone page: LAN, short-lived, the code shown on the TV in every request (header x-code) ----
  let pair = null;
  function startPair() {
    stopPair();
    const code = String(nc.randomInt(100000, 1000000));
    let bad = 0;
    const srv = http.createServer((req, res) => phone(req, res, code, () => ++bad));
    pair = { code, srv, url: 'http://' + web.lanIp() + ':' + PAIR_PORT, timer: setTimeout(stopPair, PAIR_MS) };
    const out = { url: pair.url, code, qr: pair.url + '/#' + code, seconds: PAIR_MS / 1000 };
    return new Promise(resolve => {
      srv.on('error', e => {
        stopPair();
        resolve({ error: 'the phone page could not start: ' + e.message });
      });
      srv.listen(PAIR_PORT, '0.0.0.0', () => resolve(out));
    });
  }
  // while the page is used it stays open (up to an hour after it was opened)
  function touch() {
    if (!pair) return;
    clearTimeout(pair.timer);
    const until = Math.min(Date.now() + PAIR_MS, (pair.opened || (pair.opened = Date.now())) + 3600 * 1000);
    pair.timer = setTimeout(stopPair, until - Date.now());
  }
  function stopPair() {
    if (!pair) return;
    clearTimeout(pair.timer);
    try {
      pair.srv.close();
      if (pair.srv.closeIdleConnections) pair.srv.closeIdleConnections(); // Node 18.2 and newer
    } catch (_) {}
    pair = null;
  }
  async function installedApps() {
    const a = ctx.feature && ctx.feature('apps');
    const list = a ? await a.apps() : [];
    return list.filter(x => !x.input && !x.sys).map(x => ({ id: x.id, title: x.title }));
  }
  async function phone(req, res, code, wrong) {
    // a page that was closed (or replaced by a newer one) answers nothing, also on a connection a phone kept open
    if (!pair || pair.code !== code) {
      res.writeHead(410, { 'cache-control': 'no-store' });
      return res.end();
    }
    const u = req.url.split('?')[0],
      json = (o, c) => {
        res.writeHead(c || 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(o));
      };
    if (req.method === 'GET' && u === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(page.phonePage(i18n.lang(req, config.get().lang)));
    }
    if (u.indexOf('/api/') !== 0) return web.notFound(res);
    if (req.headers['x-code'] !== code) {
      if (wrong() >= 8) stopPair();
      return json({ error: 'wrong code' }, 403);
    }
    touch();
    if (u === '/api/state') return json({ settings: settings(), apps: await installedApps() });
    if (u === '/api/save' && req.method === 'POST') {
      const r = await save(await web.body(req, 65536));
      return json(r.error ? { error: i18n.tr(i18n.lang(req, config.get().lang), r.error) } : { ok: true, settings: r.settings });
    }
    json({ error: 'not found' }, 404);
  }

  async function handle(req, res, u, body) {
    if (u === '/api/androidbox' && req.method === 'POST') {
      const r = await save(await body(req));
      return web.json(res, r, r.error ? 400 : 200);
    }
    if (u === '/api/androidbox') return web.json(res, await status());
    if (u === '/api/androidbox/test' && req.method === 'POST') return web.json(res, await test());
    if (u === '/api/androidbox/pair' && req.method === 'POST') {
      const b = await body(req);
      return web.json(res, b.stop ? (stopPair(), {}) : await startPair());
    }
    web.notFound(res);
  }

  return { name: 'androidbox', paths: ['/api/androidbox', '/api/androidbox/test', '/api/androidbox/pair'], handle, handles, open };
}

module.exports = { create, clean };
