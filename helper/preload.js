// Preloaded apps (issue 105): LG starts some apps in the background at boot (YouTube, Netflix, the web browser) so they open faster.
// On a TV with little memory that costs more than it saves. options.closePreloaded in config.json lists app ids to close once, a
// while after boot (and when the list is saved). An app that is in front is never closed. Nothing is changed on disk: the TV
// starts them again at its next boot, and the list closes them again.
const AM = 'luna://com.webos.applicationManager/';
const DELAY = 90000; // after boot, once the apps have finished starting
const SAFE = /^com\.(cleanyourtv\.|webos\.app\.(home|hdmi|livetv|tvhotkey))/; // never Home, inputs, Live TV or our own apps

// the ids from a request: strings that look like app ids, once each
const clean = list =>
  (Array.isArray(list) ? list : []).filter(
    (id, i, a) => typeof id === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(id) && !SAFE.test(id) && a.indexOf(id) === i
  );

function create(ctx) {
  const { luna, config } = ctx;
  async function apply() {
    const ids = clean((config.options() || {}).closePreloaded);
    if (!ids.length) return { closed: [] };
    const r = await luna(AM + 'running', {});
    if (!Array.isArray(r.running)) return { closed: [], error: r.errorText || 'the app manager did not answer' };
    const fg = await luna(AM + 'getForegroundAppInfo', {});
    const front = fg && fg.appId;
    const closed = [];
    for (const id of ids) {
      if (id === front || !r.running.some(x => x && (x.id || x.appId) === id)) continue;
      let c = await luna(AM + 'closeByAppId', { id });
      if (c.returnValue !== true) c = await luna(AM + 'close', { id });
      if (c.returnValue === true) closed.push(id);
    }
    if (closed.length) console.log('preload: closed ' + closed.join(', '));
    return { closed };
  }
  const start = () => {
    const t = setTimeout(() => apply().catch(e => console.error('preload: ' + e.message)), DELAY);
    if (t.unref) t.unref();
  };
  return { name: 'preload', start, apply };
}

module.exports = { create, clean };
