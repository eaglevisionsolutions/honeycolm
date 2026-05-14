# Server Deployment Guide

This project deploys via git push. There is no local Docker or Coolify setup required.

---

## Workflow

```
1. Write code locally (RALPH agents)
2. git push origin development
3. Server auto-deploys (via your server's git hook or Coolify)
4. Run migrations against staging DB via SSH
```

---

## SSH Migration Setup (one-time)

Copy the SSH credentials template and fill it in:

```bash
cp .env.staging.local.example .env.staging.local
```

Edit `.env.staging.local`:

```
STAGING_SSH_HOST=your-server-ip-or-hostname
STAGING_SSH_USER=root
STAGING_SSH_KEY=~/.ssh/id_rsa
STAGING_APP_DIR=/var/www/html
```

Then after each push:

```bash
bash scripts/migrate-staging.sh
```

RALPH runs this automatically after each task push when `.env.staging.local` exists.

---

## Server Environment Variables

Set these on your server (via Coolify dashboard, `.env`, or hosting panel):

```
APP_ENV=staging
APP_NAME=YourAppName
APP_URL=https://staging.yourdomain.com
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=your_db
DB_USERNAME=your_user
DB_PASSWORD=your_password
JWT_SECRET=       ← openssl rand -hex 32
```

If using Stripe:
```
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Branch → Environment Mapping

| Branch | URL | Purpose |
|--------|-----|---------|
| `development` | `staging.yourdomain.com` | Active development / testing |
| `master` | `yourdomain.com` | Production — manual deploy only |

---

## Running Migrations Manually

SSH into your server and run:

```bash
cd /var/www/html
php scripts/migration-runner.php
```

Or from your local machine (with `.env.staging.local` configured):

```bash
bash scripts/migrate-staging.sh
```
