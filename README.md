# Rudder Cloud

**Rudder Cloud** is a self-hosted server management panel, in the spirit of CloudPanel
but with a broader feature set: site provisioning, Git-based deployments, a built-in
file manager, database backups, GitHub key management, a web terminal, and full
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
- **Git-based deployments** — point a Node.js/Python site at a Git repo and branch;
  pull manually or on an interval, then restart via systemd, Docker Compose, PM2, or a
  custom script — only when the deployed commit actually changed.
- **File manager** — browse, edit (Monaco editor), upload/download, zip, and manage a
  site's own directory, plus one-click `.env` setup from `.env.example`. Path
  traversal and symlink escapes are blocked at the filesystem layer.
- **Database backups** — detects PostgreSQL, MySQL/MariaDB (including WordPress'
  `wp-config.php`), and MongoDB automatically; runs scheduled, compressed dumps with
  configurable retention and optional upload to S3-compatible storage.
- **GitHub key management** — generate a read-only deploy key for a site (for
  `git pull`) or an Actions key (for CI to SSH into the server), without ever storing
  a private key in the database.
- **Web terminal** — a real PTY in the browser (xterm.js + node-pty), running as the
  unprivileged panel user, restricted to super admins.
- **Users, roles & audit log** — invite team members as `MEMBER`s and grant them
  per-site permissions (view, edit files, restart, delete, manage backups, manage
  deploy keys); `SUPER_ADMIN`s have full access. Every sensitive action is recorded
  in an audit log.

## Site types supported

| Type | What it provisions |
|---|---|
| WordPress | Nginx vhost, PHP-FPM, MySQL/MariaDB database, WordPress install |
| PHP | Nginx vhost, PHP-FPM |
| Node.js | Nginx reverse proxy, dedicated systemd service |
| Python | Nginx reverse proxy, dedicated systemd service |
| Static | Nginx vhost serving a directory |
| Reverse proxy | Nginx reverse proxy to an arbitrary upstream URL |

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
- Secrets (S3 credentials) are encrypted at rest with AES-256-GCM; deploy/Actions
  private keys are never written to the database.

## Documentation

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture and
design-decision log (in Turkish).

A Turkish version of this document is available at [`README.tr.md`](README.tr.md).

## License

[MIT](LICENSE)
