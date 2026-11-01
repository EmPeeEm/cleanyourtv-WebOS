# Add-ons

An add-on is a feature that is loaded, installed and removed on its own. Live TV is the first: it ships in the package as the
bundled add-on `iptv` (`helper/addons-bundled/iptv/`) and still answers `/api/live/...`, so the launcher and the manager did not
change for it. Other add-ons come from a catalog in this repository and are installed from the manager (**Add-ons**).

What is done, and what is not:

- Done: the loader, pages served by the service and shown over Home, installing and removing from the catalog (every file checked
  against its SHA-256), the manager's Add-ons screen, Live TV's service part as a bundled add-on.
- Not done: Live TV's player and guide still run inside the launcher page (`app/src/js/live.js`); they are not a page add-on yet.
  Moving them needs a test of the page frame on a webOS 5 TV (Chromium 68), which has not been done. Voice, wallpapers and the
  Android box are still parts of the service.
- Not tried on a TV: the frame, the Back key inside it, and installing. The tests cover the service and a browser test of the page
  and its Back key was run in a desktop Chromium.

## Where they are

| Place | What |
|---|---|
| `helper/addons-bundled/<id>/` (the package; `addons-bundled/` beside the service files on the TV) | Add-ons that ship with CleanYourTV. Cannot be removed. May keep answering old API paths (`routes`) and take their on/off switch from an existing option (`enabledOption`). |
| `/media/developer/cleanyourtv/addons/<id>/` | Installed from the catalog, or put there by hand. |
| `/media/developer/cleanyourtv/addon-data/<id>/` | What an add-on stores; kept when it is removed. |
| `addons/catalog/<id>/` and `addons/index.json` (this repository) | The catalog. `node tools/addon-index.js` writes the index with a SHA-256 for every file; a test fails when it is out of date. |

## The manifest

```json
{
  "id": "bigclock",
  "name": "Big clock",
  "version": "1.0.0",
  "minService": "1.6.11",
  "kind": "page",
  "description": "A full-screen clock.",
  "entry": { "page": "index.html" },
  "permissions": [],
  "tile": { "label": "Clock", "icon": "addon", "placement": "topbar" }
}
```

- `kind` is `page` (a web page, no code in the service) or `service` (Node code that runs as root in the service; also needs
  `entry.service`). The folder name is the `id`.
- `service.js` exports `create(ctx)` and returns `{ handle(req, res, path, body), start() }`; `path` is what follows
  `/api/addons/<id>`. `ctx` has `id`, `dir`, `dataDir`, `log(line)`, `settings.get()`/`settings.set(obj)` (in `config.json` under
  `addons.<id>.settings`, logged as `addon:<id>`) and, with the permission, `fetch` (`net.fetch`) and `notify(body)` (`notify`).
  It has no `exec` or `luna`. This is a convention, not a sandbox: the code runs in the service, which is why a service add-on is
  only installed from the catalog, where every file is pinned by hash and reviewed. The service must run on Node.js 8.12.
- `routes` and `enabledOption` are for bundled add-ons only.

## Pages

A page add-on is served at `http://127.0.0.1:8765/addon/<id>/...` while it runs, with a content security policy that lets it load
only its own files (and pictures and media from anywhere) and talk only to the service. The launcher shows `entry.page` in a
full-screen frame when its topbar entry is chosen. Include `/addon/sdk.js` in the page: **Back** (also inside the frame) closes it,
and `CYTV.api(path, body)` calls `/api/addons/<id>/<path>`. Write the page in ES5 (Chromium 68, webOS 5).

The service accepts a page's requests (their origin is the service itself) only from the loopback address, only for `/addon/...`
and for `/api/addons/<id>/...` with that add-on's own page as the Referer. Install and remove are not open to pages.

## API

| Request | Reply |
|---|---|
| `GET /api/addons` | `{addons: [{id, name, version, kind, description, permissions, enabled, status, error, bundled, tile, page}], paused}`; `status` is `running`, `off`, `paused` or `failed` |
| `GET /api/addons/catalog` | `{addons: [{id, name, version, description, kind, permissions, installed, bundled, update}], error}` |
| `POST /api/addons/install {id}` | Downloads each file named in the index, refuses the whole install if one does not match its hash, then moves the folder in. `{id, version, restartNeeded}` |
| `POST /api/addons/remove {id}` | Deletes an installed add-on. `restartNeeded` when its service part was loaded. |
| `POST /api/addons/<id>/enable {enabled}` | Stored in `config.json` (or, for an add-on with `enabledOption`, in that option). A page add-on follows at once, a service add-on at the next start. |
| `/api/addons/<id>/...` | Answered by the add-on's `service.js`. |
| `GET /addon/<id>/<file>`, `GET /addon/sdk.js` | The page and the helper script. |

## Adding a catalog add-on

1. Put it in `addons/catalog/<id>/` with an `addon.json`.
2. `node tools/addon-index.js`, and commit the new `addons/index.json`.
3. Once merged, it is offered in the manager (the catalog is read from the repository's `main` branch, or the branch named in
   `/media/developer/cleanyourtv/source`).

## Recovery

Create `/media/developer/cleanyourtv/DISABLE-ADDONS` (or `addons/DISABLE`) and restart the service: no add-on loads, each shows as
`paused`. Live TV is then off as well. Remove the file to get it back.
