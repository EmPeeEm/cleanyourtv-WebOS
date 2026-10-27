// Opening an app on an Android box (androidbox.js): the settings are checked, launching switches the input and starts the app over adb,
// and every way it can fail is reported. adb is a stand-in script that records its arguments and answers from files.
const fs = require('fs'),
  path = require('path');
const { ok, call, sleep, req, memoryConfig, tmp, run } = require('./lib');

run(async () => {
  const D = process.env.CYTV_DIR;
  const adbDir = path.join(D, 'adb');
  const calls = path.join(tmp, 'adb-calls.txt');
  const reply = path.join(tmp, 'adb-reply'); // a file per kind of call: connect, shell
  fs.mkdirSync(adbDir);
  fs.mkdirSync(reply);
  const say = (kind, text) => fs.writeFileSync(path.join(reply, kind), text);
  const seen = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : []);
  const forget = () => fs.existsSync(calls) && fs.unlinkSync(calls);
  // the stand-in: logs "HOME=<home> <args>", then prints what the test left for the call
  fs.writeFileSync(
    path.join(adbDir, 'adb'),
    [
      '#!/bin/sh',
      'echo "HOME=$HOME $*" >> ' + calls,
      'case "$1" in',
      '  connect) cat ' + reply + '/connect ;;',
      '  -s) cat ' + reply + '/shell ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  say('connect', 'connected to 192.168.1.50:5555\n');
  say('shell', 'Events injected: 1\n## Network stats: elapsed time=5ms\n');

  const good = { host: '192.168.1.50', port: 5555, input: 'com.webos.app.hdmi2', apps: { plex: 'com.plexapp.android' } };
  const mod = req('androidbox');

  // ---- the settings ----
  ok(JSON.stringify(mod.clean(good)) === JSON.stringify(good), 'valid settings are kept as they are');
  ok(mod.clean(Object.assign({}, good, { port: undefined })).port === 5555, 'the port defaults to 5555');
  ok(mod.clean(Object.assign({}, good, { port: 70000 })).port === 5555, 'a port out of range falls back to 5555');
  ok(mod.clean(Object.assign({}, good, { host: '1.2.3.4; reboot' })) === null, 'a host with shell characters is refused');
  ok(mod.clean(Object.assign({}, good, { host: '' })) === null, 'no host: the box is switched off');
  ok(mod.clean(Object.assign({}, good, { input: 'netflix' })) === null, 'only an HDMI input app is accepted');
  ok(
    mod.clean(Object.assign({}, good, { apps: { plex: 'com.x; id' } })) === null,
    'a package with shell characters is dropped, and without apps there is no box'
  );
  ok(
    JSON.stringify(mod.clean(Object.assign({}, good, { apps: { plex: 'com.plexapp.android', bad: 'nodots', 'a b': 'com.a.b' } })).apps) ===
      JSON.stringify({ plex: 'com.plexapp.android' }),
    'invalid apps are dropped, valid ones stay'
  );

  // ---- the feature ----
  const conf = memoryConfig({});
  const launched = [];
  let lunaOk = true;
  const luna = async (uri, payload) => {
    launched.push(uri.split('/').pop() + ' ' + JSON.stringify(payload));
    return { returnValue: lunaOk };
  };
  const f = mod.create({ config: conf, luna });

  ok(f.handles('plex') === false && (await f.open('plex')) === null, 'nothing is set up: the app opens on the TV as before');
  let r = await call(f, '/api/androidbox');
  ok(r.j.configured === false && r.j.adb.found === true, 'status: not set up, adb found in the service folder');

  r = await call(f, '/api/androidbox', 'POST', good);
  ok(r.j.configured === true && conf.get().androidBox.host === '192.168.1.50', 'saving keeps the settings in config.json');
  ok(f.handles('plex') && !f.handles('netflix'), 'only the listed apps move to the box');

  // ---- a start that works ----
  const o = await f.open('plex');
  ok(o && o.returnValue === true && o.androidBox === 'starting', 'launching answers at once');
  ok(
    launched.length === 1 && launched[0] === 'launch {"id":"com.webos.app.hdmi2","params":{}}',
    'the TV switches to the HDMI input first: ' + launched[0]
  );
  await sleep(800);
  let c = seen();
  ok(c.length === 2 && /^HOME=\S+\/adb connect 192\.168\.1\.50:5555$/.test(c[0]), 'adb connects to the box: ' + c[0]);
  ok(
    /-s 192\.168\.1\.50:5555 shell input keyevent KEYCODE_WAKEUP; monkey -p com\.plexapp\.android -c android\.intent\.category\.LAUNCHER 1$/.test(
      c[1]
    ),
    'the box wakes and the app starts by its launcher entry: ' + c[1]
  );
  ok(c[0].indexOf('HOME=' + adbDir) === 0, 'adb keeps its key in the service folder');
  r = await call(f, '/api/androidbox');
  ok(r.j.last && r.j.last.ok === true && r.j.last.app === 'plex', 'the result of the start is in the status');

  // ---- a second tap while one is running ----
  forget();
  const a = await f.open('plex');
  ok(a.androidBox === 'busy' || a.androidBox === 'starting', 'a quick second tap does not start a second one at the same time');
  await sleep(800);

  // ---- ways it fails ----
  async function fails(name, setup, step, text) {
    forget();
    setup();
    await sleep(0);
    launched.length = 0;
    await f.open('plex');
    await sleep(800);
    const st = (await call(f, '/api/androidbox')).j.last;
    ok(st && st.ok === false && st.step === step && st.error.indexOf(text) >= 0, name + ' -> ' + step + ': ' + (st && st.error));
    ok(launched.length === 1, name + ': the input was switched anyway');
  }
  await fails('the box does not answer', () => say('connect', 'failed to connect to 192.168.1.50:5555\n'), 'connect', 'failed to connect');
  say('connect', 'connected to 192.168.1.50:5555\n');
  await fails('the box has not allowed the TV', () => say('shell', 'error: device unauthorized.\n'), 'authorize', 'accept the prompt');
  await fails('Plex is not installed', () => say('shell', '** No activities found to run, monkey aborted.\n'), 'launch', 'not installed');
  say('shell', 'Events injected: 1\n');

  // ---- no adb at all ----
  fs.renameSync(path.join(adbDir, 'adb'), path.join(adbDir, 'adb.off'));
  const noPath = path.join(tmp, 'empty');
  fs.mkdirSync(noPath);
  const P = req('paths');
  const oldPath = P.ENV.PATH;
  P.ENV.PATH = noPath;
  await sleep(0);
  forget();
  await f.open('plex');
  await sleep(500);
  const miss = (await call(f, '/api/androidbox')).j;
  ok(
    miss.adb.found === false && miss.last.step === 'adb' && /put it at/.test(miss.last.error),
    'without adb the status says where to put it'
  );
  P.ENV.PATH = oldPath;
  fs.renameSync(path.join(adbDir, 'adb.off'), path.join(adbDir, 'adb'));

  // ---- the test button ----
  say('shell', 'Shield TV\n');
  const t = await call(f, '/api/androidbox/test', 'POST', {});
  ok(t.j.ok === true && t.j.model === 'Shield TV', 'the test asks the box for its model');
  ok((await call(f, '/api/androidbox/test', 'POST', {})).code !== 404, 'the test route exists');

  // ---- switching it off ----
  r = await call(f, '/api/androidbox', 'POST', { host: '' });
  ok(
    r.j.configured === false && conf.get().androidBox === undefined && !f.handles('plex'),
    'an empty host switches the box off and removes it'
  );
});
