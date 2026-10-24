# Security audit (Phase 7)

Method: automated end-to-end tests (Playwright, real browser and raw HTTP against a dev server and a production build), integration tests against Postgres, a dependency audit, and a manual review of auth, authorization, headers, caching and secrets. Everything below marked **verified** is covered by a test that was run; items under **not verified** are open.

## Verified controls
| Area | Control | Evidence |
|---|---|---|
| Registration | Same response for new and already-registered address; no session before verification | `auth-security: sign-up gives the same answer…` |
| Sign-in | Unknown email and wrong password return identical 401 bodies; unverified account gets 403 and no cookie | `sign-in does not reveal…` |
| CSRF | Cross-origin sign-in and sign-up are rejected (403) and create nothing | `cross-origin state-changing requests…` |
| Brute force | 5 sign-in attempts/min per client, then 429 (state in Postgres, shared across instances) | `login attempts are rate limited` |
| Input size | Auth bodies over 16 KB get 413 before parsing; names over 80 chars get 400 (found and fixed in this phase: a 2 MB name was previously accepted) | `oversized and malformed…` |
| Sessions | Cookie is HttpOnly, SameSite=Lax; in the production build also `Secure` with the `__Secure-` prefix. After sign-out the old token returns no session and `/api/timer` returns 401 | `logout invalidates…`, `headers: session cookie…` |
| Password reset | Link works once; a used or tampered token is refused; the old password stops working; all other devices are signed out; unknown addresses get the same message | `password reset: single use…`, `malformed or tampered…` |
| Account deletion | Needs password, typed `DELETE`, and an emailed link; nothing is deleted before the link is opened; afterwards user, tasks and sessions are gone | `deleting the account…` |
| Open redirect | `?next=` with an external URL, `//host`, or `/\host` always lands on `/dashboard` | `login with a hostile ?next=…` |
| Authorization | A second user sees none of the first user's tasks, sessions, titles or stats, including via `?taskId=` of a foreign task; anonymous requests are redirected or get 401 | `isolation.spec`, plus service tests for every mutation |
| Duplicate/concurrent actions | Two tabs completing the same session at once leave one completed row; a double-clicked "Add task" creates one task | `isolation.spec`, `journey.spec`, service tests |
| Headers (production build) | Per-request CSP nonce (different on every request), no `unsafe-inline`/`unsafe-eval` for scripts, `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri`, `form-action`, HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, no `X-Powered-By`; every script tag carries the nonce | `headers.spec` |
| Caching | Private pages, redirects and `/api/timer` send `Cache-Control: private, no-store`; all pages are rendered per request | `headers: private routes…` (found and fixed: the signed-out redirect lacked the header) |
| Error handling | No stack traces, paths or database messages in error bodies | `headers: errors never leak…` |
| Supply chain | `pnpm audit`: no known vulnerabilities (a moderate advisory in a dev-only nested `esbuild` under `drizzle-kit` was removed with a pnpm override; `drizzle-kit generate` still works) | `pnpm audit` |
| Secrets | No secret-like strings in source; `.env.local` ignored; the real `BETTER_AUTH_SECRET` and database credentials do not appear in any built client or server file. The client bundle mentions env var *names* only (Better Auth's generic env helper) | grep over `.next` |
| Unsafe patterns | No `dangerouslySetInnerHTML`, `eval` or `new Function` in `src` | grep |
| Accessibility (security-adjacent) | axe-core WCAG 2.2 AA scan: no violations on public and signed-in pages, light and dark | `a11y.spec` |

## Findings fixed in this phase
1. **Unbounded request body and name length on sign-up** (2 MB name stored). Added a 16 KB body limit on the auth route and name/email length hooks.
2. **Timer banner erased by a background re-sync** (functional bug found by the concurrency test).
3. **Signed-out redirects lacked `Cache-Control: no-store`.**
4. Invalid `<dl>` markup on the analytics page and a 28 px header link (accessibility).

## Not verified / accepted limitations
- **Secure cookies and HSTS over real TLS** are verified only on `127.0.0.1` against a production build, not on a deployed HTTPS origin.
- **Email delivery** (Resend) has not been exercised; tests read a dev-only file outbox that is disabled in production.
- **Verification links** are Better Auth signed tokens valid for 24 h, not single-use database rows. **Reset tokens** are single-use but stored unhashed in the `verification` table. These are library behaviours; a database leak would expose live reset tokens for up to an hour.
- **Server Actions** rely on Next.js's built-in origin check; there is no separate token. Direct forgery from another origin was not attempted beyond the auth endpoints.
- `style-src-attr 'unsafe-inline'` is allowed for inline `style=""` attributes.
- Rate limits are per client IP as seen by the platform; behind a shared NAT several users share a budget, and spoofed `X-Forwarded-For` handling depends on the host.
- No independent penetration test, no WAF, no audit logging of security events beyond application logs.
- `better-auth`'s own rate-limit table only covers auth endpoints; other actions rely on authentication and database constraints.

## Google sign-in (added after Phase 7)

| Control | Evidence |
|---|---|
| Button only when both `GOOGLE_*` variables are set; half a configuration stops startup naming the variables, never values | `tests/unit/env.test.ts` |
| Redirect to Google carries the right client, exact callback URI, `openid email profile`, `state` and PKCE (`S256`); the client secret never reaches the browser | `e2e/google.spec.ts` |
| `?next=` cannot become the post-login destination if it is not a same-site path | `e2e/google.spec.ts` |
| A forged or failed callback returns to `/login` with one generic message and no session; the `error` URL parameter is never reflected | `e2e/google.spec.ts` |
| `/sign-in/social` is rate limited (10/min) | `e2e/google.spec.ts` |
| **Pre-registration takeover guard:** Google is not a trusted provider, so an existing account is only linked when Google asserts the email is verified. If that local account never verified, its password login and sessions are deleted before linking | `tests/integration/account-service.test.ts` (guard logic); the Better Auth hook that calls it is **not** exercised end to end |
| Provider tokens encrypted at rest (`encryptOAuthTokens`) | configuration only, not independently tested |
| Google-only accounts: no password form; deletion via emailed link and typed `DELETE` | component logic; **not** run end to end |

**Not verified:** any real Google round trip (consent, callback, account creation, linking, repeat sign-in), and the account hook firing during a real linking. This needs real credentials; follow the checklist in `docs/DEPLOYMENT.md` §7.
