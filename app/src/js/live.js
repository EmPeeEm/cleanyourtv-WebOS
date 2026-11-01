/* ---------- Live TV ----------
   Live TV is the page of the bundled iptv add-on (helper/addons-bundled/iptv): it runs in the frame of addons.js, over Home. This
   object keeps the calls the rest of the launcher makes (enter, exit, key, resume, toggleGuide) and passes them on. */
var LIVE_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><rect width="130" height="130" fill="#ef4f5f"/><rect x="25" y="36" width="80" height="54" rx="13" fill="none" stroke="#fff" stroke-width="8"/><path d="M58 52 L58 74 L77 63 Z" fill="#fff"/><path d="M48 104 H82" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>'
  );
var LIVE = {
  get on() {
    return ADDON.on && ADDON.id === 'iptv';
  },
  enter: function (guide) {
    if (LIVE.on) {
      if (guide) LIVE.toggleGuide();
      return;
    }
    var q = '?lang=' + encodeURIComponent(cfg.lang || '') + '&clock=' + encodeURIComponent(cfg.clock || '') + '&loc=' + encodeURIComponent(LOC || '');
    if (guide) q += '&guide=1';
    ADDON.open({ addon: 'iptv', page: '/addon/iptv/page/index.html' + q });
  },
  exit: function () {
    if (LIVE.on) ADDON.close();
  },
  resume: function () {
    ADDON.send({ cytv: 'resume' });
  },
  toggleGuide: function () {
    ADDON.send({ cytv: 'guide' });
  },
  key: function (e) {
    ADDON.key(e);
  },
};
