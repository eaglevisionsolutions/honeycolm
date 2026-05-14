# WHAT_EXISTS — Honeycolm Codebase Registry

**Last updated:** 2026-03-19 (Task 19 — Member Account Dashboard)

This file is read by every agent before writing new code to avoid duplication and collisions.

---

## Database Tables (all created in Task 1 migration)

| Table                  | Purpose                                              |
|------------------------|------------------------------------------------------|
| `users`                | Member accounts (role, home_region, email_verified)  |
| `regions`              | ca (default) and us regions                          |
| `wallets`              | One wallet per user per region (deposit + bonus)     |
| `wallet_transactions`  | Immutable ledger; one row per balance mutation       |
| `products`             | Admin-managed prize catalog                          |
| `product_images`       | One-to-many images per product                       |
| `swarms`               | Draw events; status lifecycle draft→full→draw_complete|
| `combs`                | One row per Comb purchased; bucket_source per comb   |
| `draws`                | Draw results with Random.org tamper-proof evidence   |
| `email_notifications`  | Queued email log                                     |
| `admin_staff`          | Separate auth table for admin panel staff            |
| `platform_settings`    | Key/value runtime config                             |
| `withdrawal_requests`  | Member withdrawal requests against deposit balance   |

---

## PHP Classes

### Models (`app/Models/`)

| Class                    | Table                 | Key Methods                                                                     | Task |
|--------------------------|-----------------------|---------------------------------------------------------------------------------|------|
| `BaseModel`              | —                     | findById, findAll, insert, update, delete, exists, query, queryOne               | 1    |
| `UserModel`              | users                 | findByEmail, emailExists, updatePassword, deactivate, findByRegion               | 2    |
| `RegionModel`            | regions               | findActive, findDefault                                                           | 2    |
| `WalletModel`            | wallets               | createForUser, findByUserId, deductWithLock, creditDeposit, creditBonus          | 5    |
| `WalletTransactionModel` | wallet_transactions   | record, findByWalletId, findByStripePaymentId                                     | 5    |
| `WithdrawalRequestModel` | withdrawal_requests   | findPendingByUserId, updateStatus (+ inherited insert, findById)                   | 6    |
| `AdminStaffModel`        | admin_staff           | findByEmail, create, updateLastLogin                                              | 3    |
| `ProductModel`           | products              | findWithImages, findAllPaginated, incrementTimesUsed                              | 8    |
| `ProductImageModel`      | product_images        | insertForProduct, deleteById                                                      | 8    |
| `SwarmModel`             | swarms                | findActive, findWithProductAndImages, incrementCombsSold, transitionStatus, findAllAdmin, findActiveById | 9 |
| `CombModel`              | combs                 | countByUserAndSwarm, getNextCombNumbers, insertBatch, findBySwarm, findByUserAndSwarm, getWinnerComb | 9 |
| `DrawModel`              | draws                 | findBySwarmId, getWinnerComb                                                      | 10   |
| `EmailNotificationModel` | email_notifications   | findPending, markSent, markFailed                                                 | 11   |
| `PlatformSettingModel`   | platform_settings     | getValue, updateValue                                                             | 10   |

### Services (`app/Services/`)

| Class              | Purpose                                                          | Key Methods                                                                  | Task |
|--------------------|------------------------------------------------------------------|------------------------------------------------------------------------------|------|
| `AuthService`      | Member registration and login, JWT issuance                       | register, login, refresh, logout                                              | 2    |
| `AdminAuthService` | Admin staff login, admin JWT issuance                             | login, logout                                                                 | 3    |
| `WalletService`    | Two-bucket wallet mutations, transaction logging                  | getBalance, deduct, creditDeposit, creditBonus, refund, getTransactionHistory | 5    |
| `StripeService`    | Stripe Checkout session creation, webhook processing, withdrawals | createCheckoutSession, handleWebhook, requestWithdrawal                       | 6    |
| `ProductService`   | Product CRUD, image upload                                        | findAll, findById, create, update, uploadImage, deleteImage                   | 8    |
| `SwarmService`     | Swarm lifecycle, Comb purchase, odds, admin CRUD                  | create, publish, cancel, update, purchaseCombs, getActiveSwarms, getSwarmDetail, getOdds, getAdminSwarms, getAdminSwarmDetail | 9 |
| `DrawService`      | Random.org draw execution, draw results, shipping status          | performDraw, getAdminDraws, adminShow, markShipped                            | 10   |
| `EmailService`     | Email queue processing and sending                                | queue, send, processQueue                                                     | 11   |
| `RefundService`    | Swarm refund logic, expired swarm processing                      | refundSwarm, processExpiredSwarms                                             | 12   |

### Controllers (`app/Controllers/`)

| Class                    | Routes Handled               | Auth                 | Task |
|--------------------------|------------------------------|----------------------|------|
| `BaseController`         | — (abstract)                 | —                    | 1    |
| `AuthController`         | POST /auth/*                 | Public               | 2    |
| `AdminAuthController`    | POST /admin/auth/*           | Public / AdminAuth   | 3    |
| `RegionController`       | GET /regions                 | Public               | 2    |
| `WalletController`       | GET /wallet, /wallet/transactions | AuthMiddleware  | 5    |
| `PaymentController`      | POST /payment/*              | AuthMiddleware / Public (webhook) | 6 |
| `ProductController`      | /admin/products/*            | AdminAuthMiddleware  | 8    |
| `SwarmController`        | GET /swarms, GET /swarms/{id}, POST /swarms/{id}/combs, GET /swarms/{id}/odds | Public / AuthMiddleware | 9 |
| `AdminSwarmController`   | /admin/swarms/*              | AdminAuthMiddleware  | 9    |
| `DrawController`         | GET /swarms/{id}/result, /admin/draws/* | Public / AdminAuthMiddleware | 10 |
| `AccountController`      | GET/PUT /account/*           | AuthMiddleware       | 19   |
| `NotificationController` | GET /admin/notifications     | AdminAuthMiddleware  | 11   |

### Middleware (`app/Middleware/`)

| Class                 | Purpose                                               | Task |
|-----------------------|-------------------------------------------------------|------|
| `CorsMiddleware`      | CORS headers; must run before all routes              | 1    |
| `AuthMiddleware`      | Validates member Bearer JWT; sets `$payload` static   | 2    |
| `AdminAuthMiddleware` | Validates admin Bearer JWT; sets `$staff` static      | 3    |
| `RegionMiddleware`    | Validates and injects region from URL prefix          | 13   |

### Exceptions (`app/Exceptions/Exceptions.php`)

| Class               | HTTP Code | Usage                                   |
|---------------------|-----------|-----------------------------------------|
| `AppException`      | —         | Base exception                          |
| `DatabaseException` | 500       | DB-level failures                       |
| `ValidationException` | 422     | Input validation; carries `$errors` array |
| `AuthException`     | 401       | Missing or invalid JWT                  |
| `ForbiddenException` | 403      | Insufficient role                       |
| `NotFoundException` | 404       | Record not found                        |

---

## Routes (`api/v1/index.php`)

### Public Routes (no auth required)

| Method | Path                        | Controller Method                             |
|--------|-----------------------------|-----------------------------------------------|
| POST   | /auth/login                 | AuthController::login                         |
| POST   | /auth/register              | AuthController::register                      |
| POST   | /auth/refresh               | AuthController::refresh                       |
| POST   | /auth/logout                | AuthController::logout                        |
| POST   | /admin/auth/login           | AdminAuthController::login                    |
| GET    | /regions                    | RegionController::index                       |
| GET    | /swarms                     | SwarmController::index                        |
| GET    | /swarms/{id}                | SwarmController::show                         |
| GET    | /swarms/{id}/odds           | SwarmController::odds                         |
| GET    | /swarms/{id}/result         | DrawController::publicResult                  |
| POST   | /payment/webhook            | PaymentController::webhook                    |

### Member-Protected Routes (AuthMiddleware)

| Method | Path                        | Controller Method                             |
|--------|-----------------------------|-----------------------------------------------|
| POST   | /swarms/{id}/combs          | SwarmController::purchaseCombs                |
| GET    | /account/swarms             | AccountController::mySwarms                   |
| GET    | /account/wins               | AccountController::myWins                     |
| GET    | /account/profile            | AccountController::profile                    |
| PUT    | /account/profile            | AccountController::updateProfile              |
| PUT    | /account/password           | AccountController::updatePassword             |
| GET    | /wallet                     | WalletController::balance                     |
| GET    | /wallet/transactions        | WalletController::transactions                |
| POST   | /payment/checkout           | PaymentController::checkout                   |
| POST   | /payment/withdrawal         | PaymentController::requestWithdrawal          |

### Admin-Protected Routes (AdminAuthMiddleware)

| Method | Path                           | Controller Method                             |
|--------|--------------------------------|-----------------------------------------------|
| POST   | /admin/auth/logout             | AdminAuthController::logout                   |
| GET    | /admin/products                | ProductController::index                      |
| GET    | /admin/products/{id}           | ProductController::show                       |
| POST   | /admin/products                | ProductController::store                      |
| PUT    | /admin/products/{id}           | ProductController::update                     |
| POST   | /admin/products/{id}/images    | ProductController::addImage                   |
| DELETE | /admin/products/{id}/images/{imageId} | ProductController::deleteImage         |
| GET    | /admin/swarms                  | AdminSwarmController::index                   |
| GET    | /admin/swarms/{id}             | AdminSwarmController::show                    |
| POST   | /admin/swarms                  | AdminSwarmController::store                   |
| PUT    | /admin/swarms/{id}             | AdminSwarmController::update                  |
| POST   | /admin/swarms/{id}/publish     | AdminSwarmController::publish                 |
| POST   | /admin/swarms/{id}/cancel      | AdminSwarmController::cancel                  |
| GET    | /admin/draws                   | DrawController::adminIndex                    |
| GET    | /admin/draws/{swarmId}         | DrawController::adminShow                     |
| PUT    | /admin/draws/{swarmId}/shipped | DrawController::markShipped                   |
| GET    | /admin/notifications           | NotificationController::index                 |

---

## Tests (`tests/Unit/`)

| Test Class                  | Service Under Test   | Tests                                            | Task |
|-----------------------------|----------------------|--------------------------------------------------|------|
| `AuthServiceTest`           | AuthService          | register, login, token refresh                   | 2    |
| `AdminAuthServiceTest`      | AdminAuthService     | admin login, invalid credentials                 | 3    |
| `MemberAuthServiceTest`     | AuthService          | member registration with region                  | 2    |
| `WalletServiceTest`         | WalletService        | deduct bonus-first, refund to source, credit      | 5    |
| `ProductServiceTest`        | ProductService       | CRUD, validation                                  | 8    |
| `RegionMiddlewareTest`      | RegionMiddleware     | region parsing, rejection                         | 13   |
| `StripeServiceTest`         | StripeService        | checkout session, webhook handling                | 6    |
| `SwarmServiceTest`          | SwarmService         | purchaseCombs, fill detection, odds, limits, region lock | 9 |
| `DrawServiceTest`           | DrawService          | draw execution, result retrieval                  | 10   |
| `EmailServiceTest`          | EmailService         | queue, send, processQueue                         | 11   |
| `RefundServiceTest`         | RefundService        | refund logic, expired swarm processing            | 12   |

---

## Frontend — Member Site

### HTML (`public/`)

| File            | Purpose                                               | Task |
|-----------------|-------------------------------------------------------|------|
| `index.html`    | SPA shell — nav, trust bar, #app-root, footer, all JS | 14   |
| `offline.html`  | Offline fallback page served by service worker         | 14   |

### CSS (`public/css/`)

| File       | Purpose                                                          | Task |
|------------|------------------------------------------------------------------|------|
| `app.css`  | Full member-site design system — tokens, nav, footer, trust bar, hero, swarm cards, filters, page layouts, responsive breakpoints | 14   |

### JS Namespace Bootstrap (`public/js/app.js`)

| Export        | Purpose                                                   | Task |
|---------------|-----------------------------------------------------------|------|
| `App.init()`  | Boots SyncService, registers SW, inits RegionSwitcher, runs route controller | 14 |
| `App._initRouteController()` | URL-path-based controller dispatch              | 14   |

### JS Services (`public/js/services/`)

| Class                  | Purpose                                                     | Task |
|------------------------|-------------------------------------------------------------|------|
| `ApiService`           | Singleton HTTP client; attaches JWT, handles offline queue   | 14   |
| `SyncService`          | IndexedDB sync queue; replays failed writes when back online | 14   |
| `AuthService`          | JWT storage, login/logout, auth state checks                 | 14   |

### JS Utils (`public/js/utils/`)

| Class                  | Purpose                                                     | Task |
|------------------------|-------------------------------------------------------------|------|
| `Validator`            | Client-side form validation                                  | 14   |
| `ServiceWorkerUtil`    | SW registration helper                                       | 14   |

### JS Components (`public/js/components/`)

| Class              | Purpose                                                         | Task |
|--------------------|-----------------------------------------------------------------|------|
| `SwarmCard`        | Reusable swarm card with progress bar, odds, countdown          | 15   |
| `CountdownTimer`   | Countdown timer; auto-discovers `[data-countdown]` elements     | 15   |
| `RegionSwitcher`   | Region dropdown in nav; swaps /ca/ ↔ /us/ prefix               | 14   |

### JS Controllers (`public/js/controllers/`)

| Class                        | Route                    | Renders Into     | Task |
|------------------------------|--------------------------|------------------|------|
| `BaseController`             | — (abstract)             | —                | 14   |
| `HomeController`             | `/`, `/ca`               | `#app-root`      | 15   |
| `ActiveSwarmsController`     | `/ca/swarms`             | `#app-root`      | 16   |
| `SwarmDetailController`      | `/ca/swarms/{id}`        | `#app-root`      | 17   |
| `HowItWorksController`       | `/ca/how-it-works`       | `#app-root`      | 18   |
| `PastWinnersController`      | `/ca/past-winners`       | `#app-root`      | 18   |
| `FaqController`              | `/ca/faq`                | `#app-root`      | 18   |
| `AccountDashboardController` | `/ca/account`            | `#app-root`      | 19   | Tabs: My Swarms, Win History, Account Settings. Auth guard. IndexedDB offline cache. |
| `NectarWalletController`     | `/ca/wallet`             | `#app-root`      | 20   |

### Service Worker (`public/sw/sw.js`)

| Strategy       | Scope         | Purpose                                          | Task |
|----------------|---------------|--------------------------------------------------|------|
| Cache First    | Static assets | JS, CSS, images — versioned cache                | 14   |
| Network First  | `/api/v1/*`   | API calls — cached fallback when offline         | 14   |
| Network First  | Navigation    | HTML pages — falls back to `/offline.html`       | 14   |

---

## Frontend — Admin Panel

### HTML (`public/admin/`)

| File           | Purpose                                              | Task |
|----------------|------------------------------------------------------|------|
| `index.html`   | Admin SPA shell — sidebar, header, #admin-app-root   | 21   |
| `login.html`   | Standalone admin login page                           | 21   |

### CSS (`public/admin/css/`)

| File         | Purpose                                                      | Task |
|--------------|--------------------------------------------------------------|------|
| `admin.css`  | Admin design system — sidebar, header, cards, tables, forms  | 21   |

### Admin JS (`public/admin/js/`)

| File       | Purpose                                                       | Task |
|------------|---------------------------------------------------------------|------|
| `auth.js`  | Admin JWT storage, login/logout, auth guard redirect          | 21   |
| `shell.js` | Admin shell init — sidebar nav, header, logout handler        | 21   |

### Admin JS Controllers (`public/admin/js/controllers/`)

| Class                          | Route / Page         | Task |
|--------------------------------|----------------------|------|
| `DashboardController`          | Admin dashboard      | 22   |
| `SwarmManagementController`    | Swarm list, create, detail | 23 |
| `ProductManagementController`  | Product catalog      | 24   |
| `MemberManagementController`   | Member list, detail  | 25   |
| `WithdrawalController`         | Withdrawal management | 26   |
| `DrawController`               | Draw log, shipping   | 26   |
| `FinanceController`            | Finance overview     | 26   |
| `SettingsController`           | Platform settings    | 27   |

### Member Pages (SPA Controllers)

| Class                    | Route / Page         | Task |
|--------------------------|----------------------|------|
| `LoginController`        | /ca/login, /ca/register | 14   |
| `HomeController`         | /ca/                 | 15   |
| `ActiveSwarmsController` | /ca/swarms           | 16   |
| `SwarmDetailController`  | /ca/swarms/{id}      | 17   |
| `HowItWorksController`   | /ca/how-it-works     | 18   |
| `PastWinnersController`  | /ca/past-winners     | 18   |
| `FaqController`          | /ca/faq              | 18   |
| `AccountDashboardController` | /ca/account      | 19   |
| `NectarWalletController` | /ca/wallet           | 20   |

### Utility Classes (JS)

| Class              | Purpose                                              | Task |
|--------------------|------------------------------------------------------|------|
| `App.Utils.SEO`    | Dynamically set meta tags, page title, canonical URL | 28   |

---

## Scripts (`scripts/`)

| File                          | Purpose                                              | Schedule / Usage          |
|-------------------------------|------------------------------------------------------|---------------------------|
| `process-email-queue.php`     | Cron: processes pending email_notifications           | `*/5 * * * *`             |
| `process-expired-swarms.php`  | Cron: refunds expired unfilled swarms                 | `*/15 * * * *`            |
| `seed-admin.php`              | CLI: creates admin staff account                      | `php scripts/seed-admin.php <name> <email> <password>` |
| `validate-api-contract.sh`    | Validates JS API calls match docs/api.md              | Manual / CI               |
| `validate-backend.sh`         | Backend validation checks                             | Manual / CI               |
| `validate-frontend.sh`        | Frontend validation checks                            | Manual / CI               |

---

## Configuration

| File                     | Purpose                                              |
|--------------------------|------------------------------------------------------|
| `app/Config/Database.php`| PDO singleton via `Database::connection()`           |
| `app/Config/Env.php`     | `.env` loader via `Env::get(key, default)`           |
| `api/v1/index.php`       | Route dispatcher; applies auth middleware per route  |
| `composer.json`          | PSR-4 autoload: `App\` → `app/`, `Tests\` → `tests/` |
| `phpunit.xml`            | PHPUnit 11; bootstrap=tests/bootstrap.php            |
| `docker-compose.yml`     | Docker services: app (PHP-FPM), nginx, MySQL, phpMyAdmin |
| `docker/nginx/default.conf` | Nginx: SPA fallback, API proxy to PHP-FPM, static asset caching |
| `docker/entrypoint.sh`   | Container entrypoint: waits for MySQL, starts PHP-FPM |
