# Deployment guide

Target: **Vercel** (Node.js runtime) + **Neon** (managed PostgreSQL) + **Resend** (email). Any Node 24 host and any PostgreSQL 15+ work the same way.

> **Honesty note.** This guide was written from the code and from local verification. The hosted pieces (Neon, Resend, Vercel, real HTTPS) have **not** been tested by the author. Treat the first deployment as a rehearsal and use the checklist in §7. Provider consoles and plan limits change; confirm details in their documentation.

## 0. What the app needs at runtime

| Need                         | Why                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- |
| PostgreSQL over TLS          | All state: accounts, sessions, tasks, timers, rate limits                  |
| An HTTPS origin              | Secure cookies, HSTS, origin checks (`BETTER_AUTH_URL` must equal the origin) |
| Email delivery               | Verification (required to sign in), password reset, account deletion       |
| Environment variables (§2)   | Validated at server start; a bad config stops the server and names the variables |

No file storage, background workers, cron jobs or Redis are required. Nothing is kept in memory between requests (timer state, rate limits and sessions are all in Postgres).

## 1. Create the database (Neon)

1. Create a project and a database. Choose a region close to your Vercel functions.
2. Copy the **pooled** connection string (host contains `-pooler`) for the application, and the **direct** string for migrations.
3. The app connects with TLS and verifies the certificate for any non-local host (`src/lib/db.ts`), with at most 5 connections per server instance. Transactions and `SELECT … FOR UPDATE` are used and are compatible with transaction-mode pooling because each runs inside a single transaction.

### Least-privilege roles (recommended)

Use one role to run migrations and a second, restricted role for the running app so a compromised app cannot alter or drop tables. Run as the owner/admin role (Neon lets you create roles in the console or with SQL; adapt names):

```sql
CREATE ROLE focusflow_app LOGIN PASSWORD '<generate a strong password>';
GRANT CONNECT ON DATABASE <db> TO focusflow_app;
GRANT USAGE ON SCHEMA public TO focusflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO focusflow_app;
-- tables created by future migrations (run as the migration role):
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO focusflow_app;
```

Use the owner role's URL for `pnpm db:migrate`, and `focusflow_app`'s pooled URL as `DATABASE_URL` in Vercel. (Untested on Neon. After granting, sign in and run a session to confirm nothing needs more privileges.)

## 2. Environment variables

Set these in Vercel (Project → Settings → Environment Variables, **Production** scope):

| Variable             | Value                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Pooled URL of the restricted role                                                           |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (store it in your password manager; rotating signs everyone out)   |
| `BETTER_AUTH_URL`    | Exactly your production origin, e.g. `https://focus.example.com` (no trailing slash)         |
| `EMAIL_FROM`         | `FocusFlow <noreply@focus.example.com>` on a Resend-verified domain                          |
| `RESEND_API_KEY`     | Resend key (a sending-only key is enough)                                                    |
| `SUPPORT_EMAIL`      | Optional, shown on `/support`                                                                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional, both or neither (§3b)                                                |

Preview deployments get different URLs, so **sign-in will be rejected there** unless `BETTER_AUTH_URL` matches that preview's origin. Keep auth-dependent testing to local and production, or give previews their own environment values and database.

## 3. Email (Resend)

1. Add your sending domain in Resend and create the DNS records it lists (SPF, DKIM, and optionally DMARC). Wait until it shows as verified.
2. Create an API key and set `RESEND_API_KEY`; set `EMAIL_FROM` on the verified domain.
3. The app sends three messages: email verification (24 h), password reset (1 h) and account-deletion confirmation. Failures are logged (`auth email failed`, no addresses) and do not reveal whether an account exists.
4. Verify delivery yourself (§7); the automated tests use a file outbox, not Resend.

## 3b. Google sign-in (optional)

Skip this section to run with email and password only; the button is hidden unless both variables are set.

1. In Google Cloud Console create (or pick) a project → **APIs & Services → OAuth consent screen** (External is fine). Add your app name, support email and your domain; scopes needed are the default `openid`, `email`, `profile`.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `https://<your-origin>` (and `http://localhost:3000` for local testing).
   - Authorized redirect URIs: `https://<your-origin>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` locally). The redirect URI must match `BETTER_AUTH_URL` exactly.
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Vercel Production scope and your local `.env.local`). Set **both** or startup fails.
4. While the consent screen is in "Testing" only listed test users can sign in; publish it for general use (Google may require verification for sensitive scopes; the basic scopes used here normally do not).

Behaviour worth knowing: Google signs in to an existing account only when Google says the email is verified. If someone registered that address with a password but never verified it, that password login is removed when the real owner signs in with Google. Google-only accounts have no password: they delete their account through an emailed link. This flow was tested with dummy credentials only; run the checklist item in §7 with a real account.

## 4. Migrate the database

Migrations are never run automatically. From a trusted machine or CI job with network access to the database:

```bash
git checkout <release tag>
pnpm install --frozen-lockfile
DATABASE_URL='<owner/direct url>' pnpm db:migrate
```

- Take a backup/branch/snapshot first (§6).
- Ship **additive** migrations first (add columns/tables, deploy code that uses them), and clean up in a later release. The current schema is one initial migration, `0000_init.sql`.
- The command is idempotent; a second run does nothing. `pnpm db:check` validates the migration history in CI.

## 5. Deploy (Vercel)

1. Import the GitHub repository. Framework preset: Next.js. Install command `pnpm install --frozen-lockfile`, build command `pnpm build`, Node 24.
2. Build does not need secrets; the environment is validated when each server instance **starts**. Check the deployment logs of the first request: an `Invalid environment configuration` message lists which variables are wrong (never their values).
3. Add your domain, make sure it serves HTTPS, and confirm it equals `BETTER_AUTH_URL`.
4. Pick the function region next to the database (Project → Settings → Functions).
5. All pages are rendered per request by design (nonce-based CSP), so there is nothing to revalidate or purge.

Auth endpoints are at `https://<origin>/api/auth/*`. There are no OAuth providers, so no callback URLs need to be registered.

### Behind a proxy or CDN

Rate limits are keyed by client IP. On Vercel the platform's forwarded-IP header is used. If you put another proxy/CDN in front, make sure the real client IP reaches the app and that clients cannot spoof it; otherwise every user may share one limit, or limits can be evaded. This has not been tested on a real host.

## 6. Backups and recovery

- **Managed backups:** Neon offers point-in-time restore and branching; retention depends on your plan. Confirm the window you actually have, and set it as high as your plan allows.
- **Logical dumps** (independent of the provider), e.g. nightly from a trusted runner:
  ```bash
  pg_dump --format=custom --no-owner "$OWNER_DATABASE_URL" > focusflow-$(date +%F).dump
  ```
  Store them encrypted, off the provider, with retention. They contain personal data (emails, hashed passwords, task text): protect and expire them accordingly.
- **Restore drill:** restore a dump or branch into a scratch database, point a local `DATABASE_URL` at it and sign in. Do this before you need it.
- **Rollback:** application code can be rolled back instantly in Vercel. Migrations are forward-only: fix a bad migration with a new corrective migration, or restore from backup if data was lost. This is why migrations should be additive.
- **Account deletion** removes a user's rows immediately; copies in backups expire with the backup retention window (the privacy notice says so).

## 7. Post-deploy checklist

Do each once on production with a throwaway address:

- [ ] `https://<origin>/` loads; response headers include `Content-Security-Policy` with a nonce, `Strict-Transport-Security`, `X-Frame-Options: DENY`.
- [ ] Register → the verification email arrives (check spam; SPF/DKIM pass) → the link signs you in.
- [ ] Sign in and out; the session cookie is `__Secure-better-auth.session_token`, HttpOnly, Secure, SameSite=Lax (browser dev tools → Application → Cookies).
- [ ] Forgot password → the email arrives → reset works once, and the link then shows "not valid".
- [ ] Create a task, run a 1-minute focus session (set Focus to 1 minute in Settings), see it in History and Analytics.
- [ ] Reload mid-session: the timer continues. Open a second tab: the same timer.
- [ ] (If Google is enabled) "Continue with Google" completes and lands on the dashboard; signing in again with the same Google account reuses the same account; Settings shows no password form and deletion works through the emailed link.
- [ ] Settings → delete account → the confirmation email arrives → the account disappears.
- [ ] `GET /api/timer` without a cookie returns 401.
- [ ] Logs show JSON lines and no emails, tokens or passwords.
- [ ] Rate limit: repeated bad sign-ins return 429.

## 8. Operations

- **Logs:** structured JSON on stdout (`src/lib/logger.ts`, sensitive keys redacted). Forward them with your platform's log drain. Errors shown to users are generic; details are only in logs.
- **Secrets rotation:** changing `BETTER_AUTH_SECRET` invalidates sessions and outstanding links. Rotate the database password and Resend key by updating the variables and redeploying.
- **Updates:** run `pnpm audit` and update dependencies regularly; re-run `pnpm run ci` and `pnpm test:e2e` before releasing.
- **Data retention:** history is kept until the user deletes it or their account. There is no automatic purge.
- **Capacity:** one pooled connection budget of 5 per instance; analytics are SQL aggregates over indexed ranges. No load testing has been done.

## 9. Troubleshooting

| Symptom                                           | Likely cause                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Every page returns 500 right after deploy         | Invalid environment configuration; read the first lines of the function log                    |
| Sign-in or sign-up returns "Invalid origin" (403) | `BETTER_AUTH_URL` does not match the address in the browser (www vs apex, http vs https, preview URL) |
| Google: `redirect_uri_mismatch`                    | The redirect URI in Google Cloud differs from `{BETTER_AUTH_URL}/api/auth/callback/google`        |
| Google button missing                             | One or both `GOOGLE_*` variables are unset in that environment                                 |
| Signed in but redirected back to login            | Cookie not stored: HTTP origin with Secure cookies, or a different host than `BETTER_AUTH_URL`  |
| No emails                                         | Unverified Resend domain, wrong `EMAIL_FROM`, or invalid key (check logs for `auth email failed`) |
| `permission denied for table …` in logs           | The restricted role lacks a grant (see §1), usually after a migration added a table             |
| Timer shows `CONFLICT: A timer is already running` | A live timer exists (maybe in another tab); finish, reset or skip it                           |
