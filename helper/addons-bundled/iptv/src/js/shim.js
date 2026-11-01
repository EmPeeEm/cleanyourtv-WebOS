/* ---------- what the launcher's script gave Live TV, for the page of the iptv add-on ----------
   This page is shown by the launcher in a frame (app/src/js/addons.js, LIVE in live.js there). The launcher tells it what to do with
   messages ({cytv: 'init' | 'enter' | 'guide' | 'resume' | 'key'}); the page tells the launcher to close it ({cytvAddon: 'close'}). */
var API = '';
var Q = {};
location.search
  .replace(/^\?/, '')
  .split('&')
  .forEach(function (p) {
    var i = p.indexOf('=');
    if (i > 0) Q[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
  });
var LOC = Q.loc || undefined; /* the launcher's date and time language */
var CLOCK = Q.clock || '';
function $(id) {
  return document.getElementById(id);
}
function api(p, body) {
  return fetch(API + p, body ? { method: 'POST', body: JSON.stringify(body) } : {}).then(function (x) {
    return x.json();
  });
}
function perfMark() {}
var OLDGPU = (function () {
  var m = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
  return !!m && +m[1] < 79;
})();
function setHtml(el, h) {
  if (!OLDGPU || !el.parentNode) {
    el.innerHTML = h;
    return el;
  }
  var n = el.cloneNode(false);
  n.innerHTML = h;
  el.parentNode.replaceChild(n, el);
  return n;
}
function clockOpts() {
  var o = { hour: 'numeric', minute: '2-digit' };
  if (CLOCK === '24') o.hourCycle = 'h23';
  else if (CLOCK === '12') {
    o.hourCycle = 'h12';
    o.hour = 'numeric';
  }
  return o;
}
function hsl2rgb(h, s, l) {
  var a = s * Math.min(l, 1 - l);
  function f(n) {
    var k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  }
  return [f(0), f(8), f(4)];
}
function hashHue(id) {
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
/* the time of the last key: Live TV keeps the pointer from taking the selection back for a moment after one */
var lastKey = 0;
setLang(Q.lang || '');
