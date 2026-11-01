# Add-ons (first step)

Status: the loader exists; nothing is installed from a catalog yet, no feature is an add-on yet, and the launcher and manager do not
show add-ons. The plan (kinds, IPTV as the first add-on, trust rules, phases) is a concept draft (not in the repository yet).

An add-on is a folder in `/media/developer/cleanyourtv/addons/<id>/` with an `addon.json`. `helper/addons.js` reads it when the
service starts.

```json
{
  "id": "demo",
  "name": "Demo",
  "version": "1.0.0",
  "minService": "1.6.11",
  "kind": "service",
  "entry": { "service": "service.js", "page": "page/index.html" },
  "permissions": ["net.fetch"]
}
```

- `kind` is `page` (no code in the service) or `service` (a Node module, which runs as root in the service: install only what you
  trust). The folder name must be the `id`.
- `service.js` exports `create(ctx)` and returns `{ handle(req, res, path, body), start() }`. `path` is what follows
  `/api/addons/<id>`. `ctx` has `id`, `dir`, `dataDir` (`addon-data/<id>/`, for what it stores), `log(line)`, `settings.get()` and
  `settings.set(obj)` (kept in `config.json` under `addons.<id>.settings`, logged as `addon:<id>`), and, with the permission,
  `fetch` (`net.fetch`) and `notify(body)` (`notify`). It gets no `exec` and no `luna`. The service must run on Node.js 8.12 (see `AGENTS.md`).
- An add-on that fails to load, or throws while answering, is marked `failed` (with the error) and the rest of the service carries on.

## API

| Request | Reply |
|---|---|
| `GET /api/addons` | `{addons: [{id, name, version, kind, enabled, status, error, tile}]}`; `status` is `running`, `off`, `paused` or `failed` |
| `GET /api/addons/<id>` | the same for one add-on |
| `POST /api/addons/<id>/enable {enabled}` | stored in `config.json`; `restartNeeded` is true when the state changes (an add-on is loaded at start only) |
| `/api/addons/<id>/...` | answered by the add-on's `service.js` |

## Switching them off

Create `/media/developer/cleanyourtv/DISABLE-ADDONS` (or `addons/DISABLE`) and restart the service: no add-on loads and each shows
as `paused`. Remove the add-on's folder to remove it; its data stays in `addon-data/<id>/`.
