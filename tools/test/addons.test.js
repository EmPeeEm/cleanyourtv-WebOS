// Add-ons (addons.js): the manifest check, the loader (a good one, a broken one, one that is off, DISABLE-ADDONS) and the routes.
const fs = require('fs'),
  path = require('path');
const { ok, call, req, run, tmp } = require('./lib');

run(async () => {
  // paths.js reads these when it first loads (with the loader below)
  process.env.CYTV_ADDONS = path.join(tmp, 'addons');
  process.env.CYTV_ADDON_DATA = path.join(tmp, 'addon-data');
  const addons = req('addons');
  const good = { id: 'demo', name: 'Demo', version: '1.0.0', kind: 'service', entry: { service: 'service.js' }, permissions: ['net.fetch'] };
  ok(addons.check(good, '1.6.11').manifest.id === 'demo', 'a good manifest is accepted');
  const bad = (patch, re, name) => {
    const r = addons.check(Object.assign({}, good, patch), '1.6.11');
    ok(r.error && re.test(r.error), name + ': ' + (r.error || 'accepted'));
  };
  bad({ id: 'Bad Id' }, /id must/, 'an id with capitals or spaces is refused');
  bad({ kind: 'root' }, /kind/, 'an unknown kind is refused');
  bad({ entry: { service: '../x.js' } }, /entry\.service/, 'a service file outside the folder is refused');
  bad({ entry: { service: 'a.js', page: '/etc/passwd' } }, /entry\.page/, 'an absolute page path is refused');
  bad({ permissions: ['exec'] }, /unknown permission/, 'a permission that does not exist is refused');
  bad({ minService: '9.0.0' }, /needs service 9\.0\.0/, 'a newer service is asked for');
  ok(addons.check(null).error && addons.check([]).error, 'a manifest that is not an object is refused');

  // folders: demo (works), broken (throws at load), later (off), wrongname (id differs from the folder), plain file
  const dir = path.join(tmp, 'addons');
  fs.mkdirSync(dir);
  const put = (name, manifest, code) => {
    const d = path.join(dir, name);
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'addon.json'), JSON.stringify(manifest));
    if (code) fs.writeFileSync(path.join(d, 'service.js'), code);
  };
  const svc = id => ({ id, name: id, version: '1.0.0', kind: 'service', entry: { service: 'service.js' }, permissions: [] });
  put(
    'demo',
    svc('demo'),
    "exports.create = c => ({ handle: (req, res, p) => { res.writeHead(200); res.end(JSON.stringify({ p, id: c.id, hasExec: !!c.exec, hasFetch: !!c.fetch })); } });"
  );
  put('broken', svc('broken'), "exports.create = () => { throw new Error('boom'); };");
  put('later', svc('later'), "exports.create = () => ({ handle: (q, r) => r.end('{}') });");
  put('wrongname', svc('other'), '');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');

  const cfg = req('config').memory({ addons: { later: { enabled: false } } });
  const a = addons.create({ config: cfg, version: '1.6.11', feature: () => null });
  a.start();
  const by = id => a.list().filter(x => x.id === id)[0];
  ok(by('demo').status === 'running' && by('demo').enabled, 'a good add-on runs');
  ok(by('broken').status === 'failed' && /boom/.test(by('broken').error), 'an add-on that throws is failed, the others still load: ' + by('broken').error);
  ok(by('later').status === 'off', 'an add-on switched off in config.json is not loaded');
  ok(by('wrongname').status === 'failed' && /folder name/.test(by('wrongname').error), 'the folder name must be the id');
  ok(!by('notes.txt'), 'a plain file in the folder is ignored');

  let r = await call(a, '/api/addons');
  ok(r.code === 200 && r.j.addons.length === 4, 'GET /api/addons lists them');
  r = await call(a, '/api/addons/demo/hello');
  const j = r.j;
  ok(j.p === '/hello' && j.id === 'demo' && j.hasExec === false && j.hasFetch === false, 'a request reaches the add-on; it gets no exec, and no fetch without the permission');
  r = await call(a, '/api/addons/broken/x');
  ok(r.code === 404, 'a failed add-on answers nothing');
  r = await call(a, '/api/addons/nope');
  ok(r.code === 404, 'an unknown add-on is not found');
  r = await call(a, '/api/addons/later/enable', 'POST', { enabled: true });
  ok(
    r.j.restartNeeded === true && cfg.get().addons.later.enabled === true,
    'switching on is stored and asks for a restart of the service'
  );
  r = await call(a, '/api/addons/later/enable', 'POST', { enabled: 'yes' });
  ok(r.code === 400, 'enabled must be a boolean');

  fs.writeFileSync(path.join(path.dirname(dir), 'DISABLE-ADDONS'), '');
  a.load();
  ok(a.list().every(x => x.status === 'paused' || x.status === 'failed') && by('demo').status === 'paused', 'DISABLE-ADDONS loads none');
});
