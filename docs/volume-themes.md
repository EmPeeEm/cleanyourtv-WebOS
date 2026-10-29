# Volume Bar Themes

CleanYourTV includes a system-wide custom volume OSD (On-Screen Display) that overlays over all apps, inputs, HDMI sources and live TV without taking remote or mouse focus.

Users can choose their preferred volume bar design directly on the TV in **CleanYourTV Settings > Volume bar**, or keep the TV's native volume bar ("System default").

---

## Supported Themes

1. **Apple TV Pro (`apple-pro`)**
   - Vertical slender pill (62px x 280px) docked to the right bezel.
   - White liquid fill with inverted difference-blended speaker icon and numeric volume.
   - Inspired by tvOS 17 / 18.

2. **Apple Dynamic Island (`dynamic-island`)**
   - Horizontal capsule (66px x 520px) at top center.
   - Integrated speaker glyph, sound output label, 14px thick level bar, and numeric readout.

3. **Bang & Olufsen Dial (`bo-dial`)**
   - Circular radial gauge (150px x 150px) docked on the right bezel.
   - Frosted acrylic dial with responsive stroke-dasharray arc and prominent central numeric readout.

4. **System default (`system`)**
   - Native LG webOS volume OSD. Disables the custom overlay and re-enables webOS surface-manager volume HUD.

---

## How to Add a New Theme (Contributor Guide)

Adding a new volume theme is straightforward and requires only 3 steps:

### Step 1: Register your theme in `notify/app/index.html`

In `notify/app/index.html`, locate the `VOLUME_THEMES` object and add your theme:

```javascript
VOLUME_THEMES['my-theme'] = {
  name: 'My New Theme',
  render: function (s) {
    // s: { volume: 0-100, pct: 0-100, mute: boolean, output: string, device: string, icon: string }
    var val = s.mute ? 0 : s.pct;
    return '<div class="vol-my-theme' + (s.mute ? ' mute' : '') + '">' +
      '<div class="my-device">' + s.device + '</div>' +
      '<div class="my-bar"><div class="my-fill" style="width:' + val + '%;"></div></div>' +
      '<div class="my-num">' + (s.mute ? 'MUTE' : s.volume) + '</div>' +
    '</div>';
  },
  // Optional: provide update(el, s) for 60fps in-place DOM updates during rapid volume holding
  update: function (el, s) {
    var val = s.mute ? 0 : s.pct;
    if (s.mute) el.classList.add('mute');
    else el.classList.remove('mute');
    var fill = el.querySelector('.my-fill');
    if (fill) fill.style.width = val + '%';
    var num = el.querySelector('.my-num');
    if (num) num.textContent = s.mute ? 'MUTE' : String(s.volume);
    var dev = el.querySelector('.my-device');
    if (dev && dev.textContent !== s.device) dev.textContent = s.device;
  }
};
```

### Step 2: Add scoped CSS rules in `notify/app/index.html`

Add your styles inside `<style>` in `notify/app/index.html`:

```css
.vol-my-theme {
  position: absolute;
  right: 50px;
  top: 50%;
  transform: translateY(-50%) translateX(100px);
  opacity: 0;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
}
#vol-card.on .vol-my-theme {
  transform: translateY(-50%) translateX(0);
  opacity: 1;
}
```

> **Rules for CSS in webOS:**
> - Never use CSS `gap` on flex containers. Use sibling margins (`* + *` or `margin-left/right`) instead.
> - Avoid features newer than Chromium 68 (no `aspect-ratio`, no `inset`, no `:is()` / `:where()`).

### Step 3: Add to the TV Settings Menu in `manager/src/js/menu.js`

In `manager/src/js/menu.js`, locate `view === 'volumebar'` and add your theme to the `themes` list:

```javascript
{ id: 'my-theme', label: tr('My New Theme'), sub: tr('Short description of theme') }
```

Also add your theme name to `function volumeSub(theme)` in `manager/src/js/menu.js`.

After updating, run:
```sh
node tools/build-pages.js
node tools/i18n.js --sync
```
and provide translations in `i18n/*.json` for the new strings.

---

## Technical Details

- **Overlay Window:** `com.cleanyourtv.notify` runs as a transparent `topui` web window.
- **Input Neutrality:** Calls `setInputRegion([{x:0,y:0,width:0,height:0}])` and `setKeyMask([])` so all remote and pointer events pass straight through to whatever app or video is currently playing.
- **Audio Service:** `helper/audio.js` subscribes to `com.webos.service.audio/master/getVolume` and notifies the overlay via `notify.show({ kind: 'volume', ... })`.
- **System Fallback:** Setting `volumeTheme` to `'system'` executes:
  `luna://com.webos.service.config/setConfigs '{"configs":{"com.webos.surfacemanager.volumeOSD":true}}'`
  restoring the factory LG volume graphics.

