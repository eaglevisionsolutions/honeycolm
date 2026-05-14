# Eagle Vision PWA Scaffold

A complete, production-ready starting point for every Eagle Vision Solutions PWA project.
Includes the full RALPH multi-agent build system and the chat-driven project workflow.

---

## What's included

```
.claude/agents/       11 subagents (brand-researcher, mockup-coordinator, pwa-planner,
                      pwa-backend, pwa-frontend, visual-verifier, doc-writer,
                      payment-gateway, db-migration, security-review, seo-meta)
app/                  PHP 8.4 OOP base — Config, Controllers, Models, Services,
                      Middleware, Exceptions
api/v1/index.php      API router with JWT auth middleware wired up
public/               index.html, app.css, app.js, Service Worker, offline.html
                      + ES6 base classes: ApiService, AuthService, SyncService,
                        BaseController, Validator, ServiceWorkerUtil
migrations/           Migration base class + users table migration
scripts/              migration-runner.php, migrate-staging.sh, validation scripts
tests/                PHPUnit bootstrap + AuthService test
ralph.sh              RALPH orchestrator
templates/            PROJECT_SPEC.md, WHAT_EXISTS.md, FEATURE_REQUEST.md templates
CLAUDE.md             Conversational project manager (read by VS Code / Antigravity)
APPROVAL_STATUS.md    Phase tracker — updated automatically through the chat flow
COOLIFY_SETUP.md      Server deployment and SSH migration guide
```

---

## Starting a new project

**1. Create your repo and copy this scaffold in**

```bash
git clone https://github.com/eaglevision/your-project.git
cd your-project
# unzip pwa-scaffold.zip contents here
git add . && git commit -m "chore: initial scaffold"
git push origin main
./ralph.sh init "Project Name" https://github.com/eaglevision/your-project
```

**2. Fill in your project spec**

Copy `templates/PROJECT_SPEC.md` to `docs/PROJECT_SPEC.md` and fill it in.
Plain English — takes about 10 minutes. No technical knowledge needed.

**3. Open in VS Code or Antigravity and start the chat**

Open the project folder in VS Code or Antigravity with the Claude extension.
Open the chat panel and say:

> *"I've added my project spec. Let's get started."*

Claude will take you through the rest:

1. **Brand research** — competitor analysis, two full brand identity options, you approve
2. **Logo** — drop your logo into `public/images/`, tell Claude it's there
3. **Mockup prompts** — Claude generates Stitch/Figma prompts based on your approved brand
4. **Mockup files** — paste prompts into Google Stitch, export PNGs, drop into `mockups/`
5. **Build planning** — Claude presents the task breakdown, you approve
6. **Build** — tasks run, preview URLs posted in chat after each one

---

## Environment setup (do this before starting chat)

```bash
bash setup.sh
# Copies .env.staging.local.example → .env.staging.local
# Edit .env.staging.local with your server SSH credentials

# Push code to development → server auto-deploys
# Then run migrations:
bash scripts/migrate-staging.sh
```

---

## Mockup folders

```
mockups/              Desktop designs (1440×900 PNG) — required
mockups/mobile/       Mobile designs (390×844 PNG)   — required
mockups/tablet/       Tablet designs (768×1024 PNG)  — optional
```

File names must match page slugs exactly (lowercase, hyphens for spaces).
Claude tells you the exact names to use when it generates the design prompts.

---

## Adding features after launch

Just tell Claude in the chat panel what you want:

> *"Add a booking cancellation flow with refund."*
> *"I need an admin earnings dashboard."*

Claude plans it safely, shows you the plan, waits for your go-ahead.

---

*Eagle Vision Solutions — Internal System*
