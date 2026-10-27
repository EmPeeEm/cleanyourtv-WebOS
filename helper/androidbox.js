// Open an app on an Android box instead of on the TV. For each app listed in the settings (the TV's app id, e.g. "plex"), launching it
// from the launcher switches the TV to the HDMI input the box is on and starts the box's app over ADB (network, port 5555).
//   GET  /api/androidbox        the settings, whether an adb program was found, and what the last start did
//   POST /api/androidbox        {host, port, input, apps: {<TV app id>: <Android package>}} saves the settings; an empty host switches it off
//   POST /api/androidbox/test   connects to the box and asks for its model, without switching the input
// The settings are kept in config.json (androidBox), apart from the launcher's own keys. The box must have network debugging on; the first
// connection makes it ask once to allow this TV (the key is kept in the service folder, adb/.android). The service does not ship adb: it
// uses the program at <service folder>/adb/adb, or an adb on the PATH. No shell is involved: every value is checked and passed as an
// argument of its own.
const fs = require('fs'),
  path = require('path');
const P = require('./paths'),
  web = require('./web'),
  exec = require('./exec');

const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9][A-Za-z0-9.\-]{0,62})$/;
const APP = /^[\w.\-]{1,100}$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;
const INPUT = /^com\.webos\.app\.hdmi\d{1,2}$/;
const MAX_APPS = 20;
const ADB_DIR = () => path.join(P.D, 'adb');
const ADB_FILE = () => path.join(ADB_DIR(), 'adb');

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

function create(ctx) {
  const { config, luna } = ctx;
  let last = null; // what the last start did: {at, app, ok, step, error}
  let busy = 0; // the time a start began; a second tap meanwhile is ignored

  const settings = () => clean(config.get().androidBox);

  // the adb program: ours in the service folder, else one on the PATH
  async function adbProgram() {
    if (fs.existsSync(ADB_FILE())) return ADB_FILE();
    const r = await exec.sh('command -v adb', 4000);
    return r.ok && r.out.trim() ? r.out.trim().split('\n')[0] : '';
  }
  async function adb(bin, args, ms) {
    try {
      fs.mkdirSync(ADB_DIR());
    } catch (_) {}
    // HOME decides where adb keeps the key the box has allowed (adb/.android/adbkey)
    return exec.run(bin, args, { timeout: ms || 8000, env: Object.assign({}, P.ENV, { HOME: ADB_DIR() }) });
  }
  const failure = (step, error) => ({ ok: false, step, error });

  // connect, then run one shell command on the box; resolves {ok, step, error, out}
  async function onBox(cfg, command) {
    const bin = await adbProgram();
    if (!bin) return failure('adb', 'adb was not found: put it at ' + ADB_FILE());
    const serial = cfg.host + ':' + cfg.port;
    const c = await adb(bin, ['connect', serial], 8000);
    const said = (c.out + c.err).trim();
    if (!c.ok || !/connected to/i.test(said)) return failure('connect', said || c.error || 'no answer from ' + serial);
    const r = await adb(bin, ['-s', serial, 'shell', command], 10000);
    const text = (r.out + r.err).trim();
    if (/unauthorized/i.test(text)) return failure('authorize', 'the box has not allowed this TV yet: accept the prompt on the box');
    if (!r.ok) return failure('shell', text || r.error);
    return { ok: true, step: 'shell', error: '', out: text };
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
    if (Date.now() - busy < 15000) return { returnValue: true, androidBox: 'busy' };
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
    const bin = await adbProgram();
    return { configured: !!settings(), settings: settings(), adb: { found: !!bin, path: bin || ADB_FILE() }, last };
  }

  function save(b) {
    const next = clean(b);
    config.update('androidbox', c => {
      if (next) c.androidBox = next;
      else delete c.androidBox;
    });
    return status();
  }

  async function test() {
    const cfg = settings();
    if (!cfg) return { ok: false, step: 'settings', error: 'the box is not set up' };
    const r = await onBox(cfg, 'getprop ro.product.model');
    return { ok: r.ok, step: r.step, error: r.error, model: r.ok ? r.out.split('\n')[0] : '' };
  }

  async function handle(req, res, u, body) {
    if (u === '/api/androidbox' && req.method === 'POST') return web.json(res, await save(await body(req)));
    if (u === '/api/androidbox') return web.json(res, await status());
    if (u === '/api/androidbox/test' && req.method === 'POST') return web.json(res, await test());
    web.notFound(res);
  }

  return { name: 'androidbox', paths: ['/api/androidbox', '/api/androidbox/test'], handle, handles, open };
}

module.exports = { create, clean };
