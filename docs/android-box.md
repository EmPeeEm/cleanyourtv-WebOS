# Opening an app on an Android box

Some apps work better on an Android TV box than on the TV, Plex for example. With this option, opening such an app from the
launcher switches the TV to the HDMI input the box is connected to and starts the app on the box, over the network (ADB). Nothing
opens on the TV itself.

!!! note "Status"
    There is no switch for it in the manager app yet: it is set up with one call to the service (below). The service does not
    include `adb`, see [What you need](#what-you-need).

## What you need

1. **The box** has *USB debugging* (or *Network debugging*) switched on in its developer options, and a fixed address on your
   network (give it a reserved address in your router).
2. **An `adb` program that runs on the TV**: a Linux build for 32-bit ARM. Copy it to
   `/media/developer/cleanyourtv/adb/adb` on the TV and make it executable (`chmod 755`). If there is none there, the service
   uses an `adb` on the `PATH`.
3. **The app on the box**, and its package name. For Plex on Android TV it is `com.plexapp.android`. (On the box,
   `adb shell pm list packages | grep -i plex` shows the names that contain "plex".)
4. **The app's id on the TV**: the launcher's tile for it. For LG's Plex it is `plex`
   (`curl -s http://127.0.0.1:8765/api/apps` lists the ids).

## Setting it up

Over SSH on the TV (or any script that runs there):

```sh
curl -s -X POST http://127.0.0.1:8765/api/androidbox -d '{
  "host": "192.168.1.50",
  "port": 5555,
  "input": "com.webos.app.hdmi2",
  "apps": { "plex": "com.plexapp.android" }
}'
```

- `host`: the box's address (`port` is 5555 unless you changed it).
- `input`: the TV's app for the HDMI input the box is on (`com.webos.app.hdmi1`, `hdmi2`, ...).
- `apps`: the TV's app id on the left, the Android package on the right. Add as many as you like (up to 20).

Then check the connection:

```sh
curl -s -X POST http://127.0.0.1:8765/api/androidbox/test
```

The first time, the box shows a question *Allow USB debugging from this computer?* Accept it (tick *Always allow*) and run the test
again. A good answer is `{"ok":true, ... "model":"<the box's model>"}`.

To switch it off, send an empty host: `curl -s -X POST http://127.0.0.1:8765/api/androidbox -d '{"host":""}'`.
`GET /api/androidbox` shows the settings, whether `adb` was found, and what the last start did.

## What happens when you open the app

1. The TV switches to the HDMI input at once.
2. The service connects to the box, wakes it, and starts the app by its launcher entry. This takes a few seconds, and the app opens
   on the box.

If the box cannot be reached, has not allowed the TV yet, or does not have the app, the TV has still switched to the input, and
`GET /api/androidbox` says what went wrong (`last.step` and `last.error`). The same is in the service log, in a line that starts
with `androidbox:` (Share log includes it). The app does **not** open on the TV in that case.

## Good to know

- The key that the box allowed is kept on the TV in `/media/developer/cleanyourtv/adb/.android/`. Anyone who can use the service
  as root can use it; the box's address is not given to the launcher.
- ADB gives full control of the box. Switch network debugging off on the box when you do not use this.
- Only the apps you list move to the box; every other app opens on the TV as before.
- Opening the content of a film or episode (instead of the app) is not part of this: the launcher has no Plex library.
