# Rudder Cloud

**Rudder Cloud** is a self-hosted server management panel, in the spirit of CloudPanel
but with a broader feature set: site provisioning, a Git-based deploy pipeline
(pull → build → restart, Docker Compose aware), a built-in file manager, database
backups, deploy hooks and GitHub App push webhooks, a web terminal, and full
user/role-based access control — all from a single dashboard on your own server.

It ships as one Next.js application (no separate backend service to run or deploy)
and installs itself onto a plain Ubuntu/Debian box with a single script.

## Features

- **Site wizard** — provision WordPress, PHP, Node.js, static, Python, or reverse-proxy
  sites through a guided form. Handles the Nginx vhost, SSL (via Certbot), the site's
  own Linux user, and — for Node.js/Python — a dedicated systemd service.
- **Process management** — start/stop/restart Node.js and Python sites, with automatic
  restart on crash and live log tailing (`journalctl`) in the UI.
- **Port viewer** — see every listening TCP port on the server (plus Docker container
  ports when Docker is present), matched against the sites you manage, with free-port
  suggestions for new deployments.
- **Deploy pipeline** — connect a Node.js/Python/reverse-proxy/Docker site to a
  repository (GitHub App, or any git address with a per-site SSH deploy key) and the
  panel runs `pull → deploy command → restart`: the deploy command is yours (e.g.
  `npm ci && npm run build`), the restart is systemd, `docker compose up -d --build`,
  PM2 (root daemon) or a custom script. Triggered manually, by polling, by a per-site
  **deploy hook URL** (one `POST` from any CI) or instantly by the GitHub App's
  **push webhook**.
- **Real process status** — systemd / `docker compose ps` / pm2 state, memory usage,
  and whether anything is actually listening on the proxy target (no more "Active"
  while visitors get a 502). Compose sites get up/down/restart/rebuild/pull controls
  and live `docker compose logs`.
- **File manager** — browse, edit (Monaco editor), upload/download, zip, and manage a
  site's own directory, plus one-click `.env` setup from `.env.example`. Path
  traversal and symlink escapes are blocked at the filesystem layer.
- **Database backups** — detects PostgreSQL, MySQL/MariaDB (including WordPress'
  `wp-config.php`), and MongoDB automatically; runs scheduled, compressed dumps with
  configurable retention and optional upload to S3-compatible storage.
- **SSL with a DNS pre-check** — before calling certbot the panel resolves the domain
  and tells you whether it points at this server (Cloudflare proxying is recognised),
  instead of surfacing a raw ACME failure minutes later. Cloudflare real-visitor-IP
  ranges can be installed into Nginx from Settings.
- **Web terminal** — a real PTY in the browser (xterm.js + node-pty), running as the
  unprivileged panel user, restricted to super admins.
- **Users, roles & audit log** — invite team members as `MEMBER`s and grant them
  per-site permissions (view, edit files, restart, delete, manage backups, manage
  deploy keys and hooks, terminal); `SUPER_ADMIN`s have full access. Every sensitive
  action is recorded in an audit log.

## Site types supported

| Type | What it provisions |
|---|---|
| WordPress | Nginx vhost, PHP-FPM, MySQL/MariaDB database, WordPress install |
| PHP | Nginx vhost, PHP-FPM |
| Node.js | Nginx reverse proxy, dedicated systemd service |
| Python | Nginx reverse proxy, dedicated systemd service |
| Static | Nginx vhost serving a directory |
| Reverse proxy | Nginx reverse proxy to an arbitrary upstream URL (+ site folder for git/compose) |
| Docker | Nginx reverse proxy to a port published by a Docker Compose project in the site folder |

All types optionally get a domain, `www` alias, and SSL certificate via Certbot.

## Requirements

- A fresh Ubuntu or Debian server (apt-based; other distros are not supported)
- Root access (the installer asks for confirmation before using it)
- Outbound internet access (for package installation and, if used, GitHub/S3)

Everything else — Node.js 20+, PostgreSQL, Nginx, Certbot, MySQL/MariaDB, PHP-FPM,
build tools for `node-pty` — is checked and installed automatically by `doctor.sh`.

## Quick install

Once a release is published (see [Releasing](#releasing) below), a server can be
bootstrapped with a single command, in the same spirit as CloudPanel's installer:

```bash
curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh -o /usr/local/bin/rudder-cloud-install
HASH=$(curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh.sha256 | awk '{print $1}')
echo "${HASH}  /usr/local/bin/rudder-cloud-install" | sha256sum -c && chmod +x /usr/local/bin/rudder-cloud-install
sudo /usr/local/bin/rudder-cloud-install
```

This downloads the bootstrap script, verifies its checksum, then clones the project
into `/opt/sunucu-paneli-src` and hands off to `install.sh`. To pin a specific
version instead of the latest release:

```bash
sudo GIT_REF=v1.0.0 /usr/local/bin/rudder-cloud-install
```

## Manual install

```bash
git clone https://github.com/chtsngn/rudder-cloud.git
cd rudder-cloud
sudo bash install.sh
```

`install.sh` runs `doctor.sh` first (checks/installs dependencies, creates the
unprivileged `panel` system user and PostgreSQL role), then builds the panel, runs
database migrations, creates the initial super admin account, writes the Nginx vhost,
and starts the `panel.service` systemd unit. Pass `--yes` to auto-confirm dependency
installation.

## Updating

When the panel sees a newer GitHub release, it can update itself with one click
from the Settings page: the release tag is checked out in the source clone on the
server and `install.sh --yes` is re-run in the background (in a systemd unit
independent of the panel service), with live progress shown in the panel. To do the
same by hand:

```bash
cd /opt/sunucu-paneli-src        # or wherever you ran install.sh from
sudo git fetch --tags && sudo git checkout tags/vX.Y.Z
sudo bash install.sh --yes
```

`install.sh` records the clone location as `PANEL_SRC_DIR` in the panel's `.env`;
the in-panel updater relies on it. Log: `/var/log/panel-update/update.log`.

## First login

Open `http://<server-ip>:24428` in a browser. The super admin username and
one-time-printed password are also saved to `/root/.panel-credentials` on the server.

## Releasing

Tagging a version publishes it as a GitHub Release with a stamped `bootstrap.sh` and
its SHA-256 checksum, via `.github/workflows/release.yml`:

```bash
git tag v1.0.0
git push --tags
```

## Development

```bash
cd panel
npm install
npm run db:migrate:dev   # applies Prisma migrations against a local Postgres
npm run dev              # starts the custom server (server.mjs) on :3000
```

The app is a single Next.js (App Router) project — API routes live under
`src/app/api/**`, there is no separate backend process. `npm run build` / `npm run
lint` should be clean before committing.

## Security model

- The panel process runs as an unprivileged, `nologin` system user (`panel`), never
  as root.
- That user has passwordless `sudo` for exactly one script
  (`panel/scripts/provision-site.sh`), invoked with argument arrays (no shell
  interpolation) — nothing else is granted broader sudo access.
- Session cookies carry only a user ID; roles and permissions are read fresh from the
  database on every request, so a demoted or deleted user loses access immediately.
- Secrets (S3 credentials, GitHub App keys) are encrypted at rest with AES-256-GCM; SSH
  deploy keys stay on disk (0600) and deploy-hook tokens are stored only as SHA-256
  hashes — neither ever appears in the database in the clear.

## Documentation

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture and
design-decision log (in Turkish).

A Turkish version of this document is available at [`README.tr.md`](README.tr.md).

## License

[MIT](LICENSE)
