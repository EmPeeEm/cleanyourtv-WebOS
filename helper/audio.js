// Real-time audio volume status: subscribes to com.webos.service.audio/master/getVolume and serves
// instant updates to the launcher via long-polling (GET /api/audio/volume?since=N) and triggers
// system-wide volume OSD via notify overlay.
const { spawn } = require('child_process');
const web = require('./web');
const luna = require('./luna');

function create(ctx) {
  let seq = 1;
  let status = { volume: 10, mute: false, output: 'tv_speaker', max: 100, seq: 1 };
  let initialized = false;
  let running = false;
  const waiters = [];
  let lastNotifyAt = 0;
  let lastLaunchAt = 0;
  let currentTheme = '';
  let proc = null;

  function getPayload() {
    if (!currentTheme) {
      const opts = (ctx.config && ctx.config.options()) || {};
      currentTheme = opts.volumeTheme || 'apple-pro';
    }
    return {
      volume: status.volume,
      mute: status.mute,
      output: status.output,
      max: status.max,
      seq: status.seq,
      theme: currentTheme,
    };
  }

  function notifyWaiters() {
    if (!waiters.length) return;
    lastNotifyAt = Date.now();
    const payload = getPayload();
    const list = waiters.splice(0, waiters.length);
    for (const w of list) {
      clearTimeout(w.timer);
      try {
        if (!w.res.finished) web.json(w.res, payload);
      } catch (_) {}
    }
  }

  function syncStockVolumeOSD(theme) {
    if (theme) currentTheme = theme;
    else {
      const opts = (ctx.config && ctx.config.options()) || {};
      currentTheme = opts.volumeTheme || 'apple-pro';
    }
    const isSystem = currentTheme === 'system';
    luna('luna://com.webos.service.config/setConfigs', {
      configs: { 'com.webos.surfacemanager.volumeOSD': isSystem },
    }).catch(() => {});
    status.seq++;
    notifyWaiters();
  }

  function showVolumeOSD(st) {
    if (!currentTheme) {
      const opts = (ctx.config && ctx.config.options()) || {};
      currentTheme = opts.volumeTheme || 'apple-pro';
    }
    if (currentTheme === 'system') return;

    const now = Date.now();
    // If notify app has a pending waiter or polled very recently, stream over socket without SAM launch
    if (waiters.length > 0 || now - lastNotifyAt < 1200) return;
    if (now - lastLaunchAt < 1500) return;
    lastLaunchAt = now;

    const notify = ctx.feature('notify');
    const params = {
      kind: 'volume',
      volume: st.volume,
      mute: st.mute,
      output: st.output,
      max: st.max,
      theme: currentTheme,
      seq: st.seq,
      seconds: 2,
    };
    if (notify && notify.show) {
      notify.show(params, true);
    } else {
      luna('luna://com.webos.applicationManager/launch', {
        id: 'com.cleanyourtv.notify',
        params: params,
      }).catch(() => {});
    }
  }

  function start() {
    const opts = (ctx.config && ctx.config.options()) || {};
    currentTheme = opts.volumeTheme || 'apple-pro';
    syncStockVolumeOSD(currentTheme);
    if (running) return;
    running = true;
    function run() {
      try {
        proc = spawn('luna-send', ['-i', 'luna://com.webos.service.audio/master/getVolume', '{"subscribe":true}']);
      } catch (e) {
        return;
      }
      let buf = '';
      proc.stdout.on('data', data => {
        buf += data.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const l = line.trim();
          if (!l || l.indexOf('{') < 0) continue;
          try {
            const j = JSON.parse(l);
            const v = j.volumeStatus || j;
            if (v && (typeof v.volume === 'number' || typeof v.muteStatus === 'boolean')) {
              const newVol = typeof v.volume === 'number' ? v.volume : status.volume;
              const newMute = typeof v.muteStatus === 'boolean' ? v.muteStatus : status.mute;
              const newOutput = String(v.soundOutput || status.output || 'tv_speaker');
              const newMax = typeof v.maxVolume === 'number' ? v.maxVolume : 100;
              const changed = !initialized || newVol !== status.volume || newMute !== status.mute || newOutput !== status.output;

              status = {
                volume: newVol,
                mute: newMute,
                output: newOutput,
                max: newMax,
                seq: ++seq,
              };
              notifyWaiters();
              if (initialized && changed) {
                showVolumeOSD(status);
              }
              initialized = true;
            }
          } catch (_) {}
        }
      });
      proc.on('error', () => {});
      proc.on('close', () => {
        if (!running) return;
        const t = setTimeout(run, 3000);
        if (t && t.unref) t.unref();
      });
    }
    run();
  }

  function stop() {
    running = false;
    if (proc) {
      try {
        proc.kill();
      } catch (_) {}
      proc = null;
    }
  }

  return {
    name: 'audio',
    paths: ['/api/audio/volume'],
    start,
    stop,
    syncStockVolumeOSD,
    handle(req, res, u) {
      const q = req.url.split('?')[1] || '';
      if (/[?&]client=notify\b/.test(q)) lastNotifyAt = Date.now();
      const m = /[?&]since=(\d+)/.exec('?' + q);
      const since = m ? parseInt(m[1], 10) : 0;
      const payload = getPayload();
      if (status.seq > since) {
        return web.json(res, payload);
      }
      const item = { res, timer: null };
      item.timer = setTimeout(() => {
        const idx = waiters.indexOf(item);
        if (idx >= 0) waiters.splice(idx, 1);
        try {
          if (!res.finished) web.json(res, getPayload());
        } catch (_) {}
      }, 25000);
      res.on('close', () => {
        clearTimeout(item.timer);
        const idx = waiters.indexOf(item);
        if (idx >= 0) waiters.splice(idx, 1);
      });
      waiters.push(item);
    },
  };
}

module.exports = { create };
