// Add-ons (concept: docs/development/addons.md): a folder in P.ADDONS with an addon.json, loaded by the service at start.
//   GET  /api/addons                    {addons: [{id, name, version, kind, enabled, status, error, tile}]}
//   GET  /api/addons/<id>               the same for one add-on
//   POST /api/addons/<id>/enable {enabled}   stored in config.json (addons.<id>.enabled); takes effect at the next start
//   ANY  /api/addons/<id>/<path>        answered by the add-on's own service.js
// An add-on of kind "service" is Node code that runs as root in this process, so it gets a small ctx of its own (its folder, its data
// folder, its settings, fetch, a log line) and nothing else, and an add-on that fails to load or throws is switched off for this run
// without touching the rest of the service. DISABLE-ADDONS in the CleanYourTV folder (or the file ADDONS/DISABLE) loads none.
// Installing from a catalog is not here yet; today an add-on is a folder put into P.ADDONS.
const fs = require('fs'),
  path = require('path');
const P = require('./paths'),
  nc = require('./netcompat'),
  web = require('./web'),
  version = require('./version');

const KINDS = ['page', 'service'];
const PERMISSIONS = ['net.fetch', 'config.own', 'notify', 'key.guide'];
const ID = /^[a-z][a-z0-9-]{1,31}$/;
const safeRel = f => typeof f === 'string' && f.length > 0 && f.length < 120 && !/^[\\/]|\.\.|[\0\\]/.test(f);

// The manifest as the loader will use it, or {error}. serviceVersion: the running service's version, for minService.
function check(m, serviceVersion) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { error: 'addon.json is not an object' };
  if (!ID.test(m.id || '')) return { error: 'id must be lower-case letters, digits and hyphens (2 to 32), starting with a letter' };
  if (typeof m.name !== 'string' || !m.name || m.name.length > 60) return { error: 'name is missing or too long' };
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) return { error: 'version must look like 1.0.0' };
  if (KINDS.indexOf(m.kind) < 0) return { error: 'kind must be "page" or "service"' };
  const entry = m.entry && typeof m.entry === 'object' ? m.entry : {};
  if (m.kind === 'service' && !safeRel(entry.service)) return { error: 'a service add-on needs entry.service (a file in its folder)' };
  if (entry.page !== undefined && !safeRel(entry.page)) return { error: 'entry.page is not a path inside the folder' };
  const perms = Array.isArray(m.permissions) ? m.permissions : [];
  const bad = perms.filter(p => PERMISSIONS.indexOf(p) < 0);
  if (bad.length) return { error: 'unknown permission: ' + String(bad[0]).slice(0, 40) };
  if (m.minService && serviceVersion && version.cmp(serviceVersion, m.minService) < 0)
    return { error: 'needs service ' + m.minService + ' or newer (this is ' + serviceVersion + ')' };
  const t = entry.tile && typeof entry.tile === 'object' ? entry.tile : null;
  return {
    manifest: {
      id: m.id,
      name: m.name,
      version: m.version,
      kind: m.kind,
      entry: { service: entry.service, page: entry.page },
      permissions: perms,
      tile: t ? { label: String(t.label || m.name).slice(0, 40), icon: String(t.icon || '').slice(0, 30), placement: t.placement === 'topbar' ? 'topbar' : 'home' } : null,
    },
  };
}

function create(ctx) {
  const { config } = ctx;
  const list = []; // {id, dir, manifest, enabled, status, error, mod}
  const readJson = f => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {
      return null;
    }
  };
  const settingsOf = id => ((config.get().addons || {})[id] || {}).settings || {};
  const enabledOf = id => ((config.get().addons || {})[id] || {}).enabled !== false;

  // the ctx an add-on gets: its folders, its settings, fetch and a log line; not exec, luna or the other parts of the service
  function addonCtx(a) {
    const dataDir = path.join(P.ADDON_DATA, a.id);
    nc.mkdirp(dataDir);
    const perms = a.manifest.permissions;
    const c = {
      id: a.id,
      dir: a.dir,
      dataDir,
      log: m => console.log('addon ' + a.id + ': ' + String(m).slice(0, 300)),
      settings: {
        get: () => Object.assign({}, settingsOf(a.id)),
        set: obj =>
          config.update('addon:' + a.id, cfg => {
            cfg.addons = cfg.addons || {};
            cfg.addons[a.id] = Object.assign({}, cfg.addons[a.id], { settings: Object.assign({}, (cfg.addons[a.id] || {}).settings, obj) });
          }),
      },
    };
    if (perms.indexOf('net.fetch') >= 0) c.fetch = require('./fetch');
    if (perms.indexOf('notify') >= 0 && ctx.feature('notify')) c.notify = body => ctx.feature('notify').show(body);
    return c;
  }

  function load() {
    list.length = 0;
    let names = [];
    try {
      names = fs.readdirSync(P.ADDONS).sort();
    } catch (_) {
      return; // no add-ons folder: nothing installed
    }
    const off = fs.existsSync(path.join(path.dirname(P.ADDONS), 'DISABLE-ADDONS')) || fs.existsSync(path.join(P.ADDONS, 'DISABLE'));
    const seen = {};
    for (const n of names) {
      const dir = path.join(P.ADDONS, n);
      let isDir = false;
      try {
        isDir = fs.statSync(dir).isDirectory();
      } catch (_) {}
      if (!isDir) continue;
      const a = { id: n, dir, manifest: null, enabled: false, status: 'failed', error: '', mod: null };
      list.push(a);
      const r = check(readJson(path.join(dir, 'addon.json')), ctx.version);
      if (r.error) {
        a.error = r.error;
        continue;
      }
      a.manifest = r.manifest;
      if (a.manifest.id !== n) {
        a.error = 'the folder name must be the id (' + a.manifest.id + ')';
        a.manifest = null;
        continue;
      }
      if (seen[a.id]) continue;
      seen[a.id] = true;
      a.enabled = enabledOf(a.id);
      if (off) {
        a.status = 'paused';
        a.error = 'DISABLE-ADDONS is present';
      } else if (!a.enabled) a.status = 'off';
      else if (a.manifest.kind === 'page') a.status = 'running';
      else {
        try {
          a.mod = require(path.join(dir, a.manifest.entry.service)).create(addonCtx(a));
          a.status = 'running';
        } catch (e) {
          a.status = 'failed';
          a.error = String((e && e.message) || e).slice(0, 200);
          console.error('addon ' + a.id + ' failed to load: ' + ((e && e.stack) || e));
        }
      }
    }
  }

  const info = a => ({
    id: a.id,
    name: a.manifest ? a.manifest.name : a.id,
    version: a.manifest ? a.manifest.version : '',
    kind: a.manifest ? a.manifest.kind : '',
    enabled: a.enabled,
    status: a.status,
    error: a.error,
    tile: a.manifest ? a.manifest.tile : null,
  });

  async function handle(req, res, u, body) {
    if (u === '/api/addons') return web.json(res, { addons: list.map(info) });
    const m = /^\/api\/addons\/([a-z][a-z0-9-]*)(\/.*)?$/.exec(u);
    const a = m && list.filter(x => x.id === m[1])[0];
    if (!a) return web.notFound(res);
    if (!m[2]) return web.json(res, info(a));
    if (m[2] === '/enable' && req.method === 'POST') {
      const b = await body(req);
      if (typeof b.enabled !== 'boolean') return web.json(res, { error: 'enabled must be true or false' }, 400);
      config.update('addon:' + a.id, cfg => {
        cfg.addons = cfg.addons || {};
        cfg.addons[a.id] = Object.assign({}, cfg.addons[a.id], { enabled: b.enabled });
      });
      return web.json(res, { id: a.id, enabled: b.enabled, restartNeeded: b.enabled !== a.enabled });
    }
    if (a.status !== 'running' || !a.mod || typeof a.mod.handle !== 'function') return web.notFound(res);
    try {
      return await a.mod.handle(req, res, m[2], body);
    } catch (e) {
      console.error('addon ' + a.id + ': ' + u + ': ' + ((e && e.stack) || e));
      if (!res.headersSent) web.json(res, { error: 'the add-on failed: ' + String((e && e.message) || e).slice(0, 200) }, 500);
      else res.end();
    }
  }

  function start() {
    load();
    for (const a of list)
      if (a.status === 'running' && a.mod && typeof a.mod.start === 'function') {
        try {
          a.mod.start();
        } catch (e) {
          a.status = 'failed';
          a.error = String((e && e.message) || e).slice(0, 200);
          console.error('addon ' + a.id + ' failed to start: ' + ((e && e.stack) || e));
        }
      }
  }

  return { name: 'addons', prefix: '/api/addons', handle, start, load, list: () => list.map(info) };
}

module.exports = { create, check, KINDS, PERMISSIONS };
