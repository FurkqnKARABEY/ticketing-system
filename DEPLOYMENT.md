# Ticketing System Deployment

This folder deploys only the ticketing system services. Do not run commands from other app folders.

## Services

- `ticketing-frontend`: Vite/React build served by nginx on internal port `80`.
- `ticketing-backend`: Express/TypeScript API on internal port `3001`.
- Both services join the existing external Docker network `n8n_default`.
- No backend host port is published. Traefik routes traffic by Docker labels.
- Docker logs are capped at `10m` with `3` files per service.

## Domains And DNS

Create DNS `A` records pointing to this VPS public IPv4 address:

- `tickets.perraro.cloud`
- `api-tickets.perraro.cloud`

If IPv6 is used on this VPS, also create matching `AAAA` records.

## Required Environment

Create `/docker/apps/ticketing-system/.env.production` from `.env.production.example`.
Keep real values only on the VPS and never commit them.

Required values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `CORS_ORIGINS=https://tickets.perraro.cloud`
- `INTAKE_SECRET`
- `OPENPHONE_API_KEY`
- `OPENPHONE_PHONE_NUMBER_ID`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_NAME`
- `SMTP_FROM_EMAIL`
- `SUPABASE_ATTACHMENTS_BUCKET`

Admin bootstrap variables are needed only when running the admin creation or reset scripts.

## File And Attachment Storage

Do not store permanent binary files on this VPS.

Current app behavior:

- Backend uploads outbound and OpenPhone attachment binaries to Supabase Storage using `SUPABASE_ATTACHMENTS_BUCKET`.
- Existing n8n workflow documentation describes Google Drive storage for intake media, recordings, voicemail, email attachments, and website uploads.
- Supabase tables should store metadata and external URLs, not local permanent binary files.

Temporary local directory:

- `/var/tmp/ticketing-system`

Cleanup strategy:

- Run `./cleanup-temp.sh` from this folder to delete temp files older than 24 hours.
- Suggested cron entry:

```cron
17 * * * * cd /docker/apps/ticketing-system && TEMP_DIR=/var/tmp/ticketing-system MAX_AGE_MINUTES=1440 ./cleanup-temp.sh >/dev/null 2>&1
```

## Preflight Commands

Run after `.env.production` is created:

```sh
docker compose config
```

This validates the compose file without starting containers.

## Production Start Command

After DNS and environment values are ready:

```sh
docker compose up -d --build
```

Do not run `docker compose down` against existing apps. This compose file affects only the ticketing system when run from `/docker/apps/ticketing-system`.

## Optional Admin Setup

After the services are running and `.env.production` contains the admin placeholders replaced with real values:

```sh
docker compose run --rm ticketing-backend npm run create-admin
```

For password reset:

```sh
docker compose run --rm ticketing-backend npm run reset-admin-password
```
