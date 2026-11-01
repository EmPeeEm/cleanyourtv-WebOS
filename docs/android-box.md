# Opening an app on an Android box

Some apps work better on an Android TV box than on the TV, Plex for example. With this option, opening such an app from the
launcher switches the TV to the HDMI input the box is connected to and starts the app on the box, over the network (ADB). Nothing
opens on the TV itself. It was written for the NVIDIA Shield; any Android box with classic _network debugging_ should work.

No `adb` program is needed: the service speaks the protocol itself (`helper/addons-bundled/androidbox/adbclient.js`).

## What you need

1. **Network debugging on the box.** On the Shield: _Settings > Device Preferences > About_, tap _Build_ seven times, then
   _Developer options > Network debugging_ (or _USB debugging_ and _Network debugging_) on. Give the box a reserved address in your
   router. Android 11 and newer boxes that only offer _Wireless debugging_ (with a pairing code) are not supported.
2. **The app on the box**, and its package name. For Plex on Android TV it is `com.plexapp.android`.
3. **The app's id on the TV**: the launcher's tile for it. For LG's Plex it is `plex`.

## Setting it up

In the manager app, choose **Android box > Set up from your phone**. Scan the code with the phone (same Wi-Fi), fill in the address
of the box, the HDMI input it is on, and the apps that should open on it (Plex is filled in for you), then tap **Save**. Back on the
TV, choose **Test the connection**.

The first time, the box shows a question _Allow USB debugging from this computer?_ Accept it (tick _Always allow_) within 30
seconds. A good test shows `Connected: <the box's model>`.

**Switch off** in the same screen sends the apps back to the TV.

Without the manager app, over SSH on the TV:

```sh
curl -s -X POST http://127.0.0.1:8765/api/androidbox -d '{
  "host": "192.168.1.50",
  "port": 5555,
  "input": "com.webos.app.hdmi2",
  "apps": { "plex": "com.plexapp.android" }
}'
curl -s -X POST http://127.0.0.1:8765/api/androidbox/test
```

`apps` has the TV's app id on the left and the Android package on the right (up to 20). An empty host switches it off.
`GET /api/androidbox` shows the settings, whether the key is ready, and what the last start did.

## Choosing which apps open on the box

Only the apps you choose move to the box; every other app opens on the TV as before.

- **On the TV:** in the manager, **Android box > Choose apps** lists the TV's apps. OK moves an app to the box or back to the TV. The
  usual Android package is filled in for well-known apps (Plex, Netflix, YouTube, Disney+, Prime Video, Spotify, Twitch, Kodi, Jellyfin).
  For another app the TV asks for its package: type it on your phone.
- **On your phone:** the setup page lists the TV's apps with a tick box. Tick the apps that open on the box and check or type their
  package. With nothing ticked, the box stays set up and every app opens on the TV.

## What happens when you open the app

1. The TV switches to the HDMI input at once.
2. The service connects to the box, wakes it, and starts the app by its launcher entry. This takes a few seconds, and the app opens
   on the box.

If the box cannot be reached, has not allowed the TV yet, or does not have the app, the TV has still switched to the input, and the
manager screen (_Last start_) and `GET /api/androidbox` say what went wrong (`last.step` and `last.error`). The same is in the
service log, in a line that starts with `androidbox:` (Share log includes it). The app does **not** open on the TV in that case.

## Good to know

- The TV's key is made the first time, in `/media/developer/cleanyourtv/adb/adbkey` (readable by root only). The box remembers it
  once you tick _Always allow_. On an old TV whose Node cannot make keys, copy `~/.android/adbkey` from a computer that has `adb`
  to that place.
- The phone page uses port 8793 for at most ten minutes, with a 6-digit code, and is not encrypted (see [Security](security.md)).
- ADB gives full control of the box. Switch network debugging off on the box when you do not use this.
- Only the apps you list move to the box; every other app opens on the TV as before.
- Opening the content of a film or episode (instead of the app) is not part of this: the launcher has no Plex library.
