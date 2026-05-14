# Server Reference — Honeycolm

> Connection details and server layout for the Honeycolm staging/production environment.
> Sensitive credentials (passwords, keys) are in `.env.staging.local` — not here.

---

## SSH Access

| Key | Value |
|-----|-------|
| Host | `your-server-ip-or-hostname` |
| User | `root` |
| Key  | `~/.ssh/id_rsa` |
| Connect | `ssh root@your-server-ip` |

---

## URLs

| Environment | URL |
|-------------|-----|
| Staging / Dev | `https://dev.honeycolm.ca` |
| Production | `https://honeycolm.ca` |

---

## App Directory

| Item | Path |
|------|------|
| App root | `/var/www/honeycolm` |
| Public web root | `/var/www/honeycolm/public` |
| Migrations | `/var/www/honeycolm/migrations` |
| Logs | `/var/www/honeycolm/storage/logs` |
| Uploads | `/var/www/honeycolm/uploads` |

---

## Server Stack

| Component | Detail |
|-----------|--------|
| OS | Ubuntu 22.04 |
| PHP | 8.4 — `/usr/bin/php8.4` |
| Web server | Nginx |
| Nginx config | `/etc/nginx/sites-available/honeycolm` |
| Database | MySQL 8.4 — `localhost:3306` |
| Database name | `honeycolm` |
| Database user | `honeycolm_user` |
| Database password | see `.env.staging.local` |

---

## Deployment

| Step | Command / Detail |
|------|-----------------|
| Push code | `git push origin development` |
| Server pulls | `cd /var/www/honeycolm && git pull origin development` |
| Run migrations | `bash scripts/migrate-staging.sh` (from local) |
| Clear cache | `php artisan cache:clear` or equivalent |

> How does code get from git to the server?
> [ ] Git hook (auto-pull on push)
> [ ] Manual `git pull` via SSH
> [ ] Other: ___________

---

## Database Credentials

Stored in `.env.staging.local` (gitignored — never committed).
Also set as environment variables on the server at:
`/var/www/honeycolm/.env` or via the hosting panel.

---

## Cron Jobs

| Job | Schedule | Command |
|-----|----------|---------|
| Process expired swarms | Every 5 min | `php /var/www/honeycolm/scripts/process-expired-swarms.php` |
| Email queue | Every 2 min | `php /var/www/honeycolm/scripts/process-email-queue.php` |

Add to crontab (`crontab -e` on the server):
```
*/5 * * * * php /var/www/honeycolm/scripts/process-expired-swarms.php >> /var/www/honeycolm/storage/logs/cron.log 2>&1
*/2 * * * * php /var/www/honeycolm/scripts/process-email-queue.php >> /var/www/honeycolm/storage/logs/cron.log 2>&1
```

---

## Log Locations

| Log | Path |
|-----|------|
| App errors | `/var/www/honeycolm/storage/logs/app.log` |
| Cron output | `/var/www/honeycolm/storage/logs/cron.log` |
| Nginx access | `/var/log/nginx/honeycolm-access.log` |
| Nginx errors | `/var/log/nginx/honeycolm-error.log` |
| MySQL errors | `/var/log/mysql/error.log` |

---

## Useful Server Commands

```bash
# SSH in
ssh root@your-server-ip

# Pull latest code
cd /var/www/honeycolm && git pull origin development

# Run migrations
php scripts/migration-runner.php

# Tail app log
tail -f /var/www/honeycolm/storage/logs/app.log

# Restart Nginx
systemctl restart nginx

# Restart PHP-FPM
systemctl restart php8.4-fpm

# Check MySQL
systemctl status mysql
```
