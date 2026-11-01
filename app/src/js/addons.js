/* ---------- add-ons (helper/addons.js): topbar entries and the page host ----------
   A page add-on is a web page the service serves (/addon/<id>/...). It opens full screen in a frame over Home; Back (also pressed
   inside the frame: the helper script /addon/sdk.js reports it) closes it. The entries come from GET /api/addons and are not part of
   the saved layout. */
var addonBar = [];
var ADDON = {
  on: false,
  id: '',
  load: function () {
    api('/api/addons').then(
      function (x) {
        var bar = [];
        ((x && x.addons) || []).forEach(function (a) {
          if (a.status === 'running' && a.page && a.tile && a.tile.placement === 'topbar')
            bar.push({ label: a.tile.label || a.name, icon: a.tile.icon || 'addon', action: 'addon', addon: a.id, page: a.page, fixed: true });
        });
        var sig = JSON.stringify(bar);
        if (sig === JSON.stringify(addonBar)) return;
        addonBar = bar;
        rebuild();
      },
      function () {}
    );
  },
  open: function (o) {
    if (ADDON.on || !o || !o.page) return;
    var host = document.createElement('div');
    host.id = 'addonhost';
    var f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.setAttribute('allow', 'autoplay');
    f.src = API + o.page;
    f.onload = function () {
      try {
        f.contentWindow.focus();
      } catch (e) {}
    };
    host.appendChild(f);
    document.body.appendChild(host);
    ADDON.on = true;
    ADDON.id = o.addon;
    logLine('addon open ' + o.addon);
  },
  close: function () {
    var h = $('addonhost');
    if (h && h.parentNode) h.parentNode.removeChild(h);
    ADDON.on = false;
    ADDON.id = '';
  },
  key: function (e) {
    if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) {
      e.preventDefault();
      ADDON.close();
    }
  },
};
/* a page reports Back through the helper script */
window.addEventListener('message', function (ev) {
  var d = ev.data;
  if (ADDON.on && d && d.cytvAddon === 'close' && d.id === ADDON.id) ADDON.close();
});
