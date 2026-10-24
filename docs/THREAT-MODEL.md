# Threat model (initial, Phase 2)

**Assets:** credentials and sessions, tasks and focus history (private to each user), email addresses, server secrets.
**Attackers:** anonymous internet users; an authenticated user probing other users' data; someone holding a leaked link/token; a malicious page on another origin.

| Surface | Threat | Mitigation (implemented) | Status |
|---|---|---|---|
| Login / sign-up / reset | Brute force, credential stuffing, enumeration | Better Auth limiter backed by Postgres (5/min login, 5/h sign-up and reset); identical responses for unknown vs wrong password; sign-up and reset responses do not reveal registration; emails sent without awaiting | Verified by Playwright: 429 after limit, identical responses |
| Passwords | Disclosure | Better Auth scrypt hashing; min 10 / max 128 chars | Implemented |
| Sessions | Theft, fixation | HttpOnly, SameSite=Lax, Secure in production; new token per sign-in; DB-validated on every request; sessions revoked on password reset; 7-day expiry | Secure flag only provable in production |
| Cross-site requests | CSRF | Better Auth origin check against `BETTER_AUTH_URL`; SameSite=Lax | Verified: cross-origin sign-in/sign-up return 403 |
| Pages / actions | Unauthenticated or cross-user access | `requireUser()` on every protected page; services take `userId` from the session, never from input; ownership filters and FK constraints | Verified end to end and in integration tests (see SECURITY-AUDIT.md) |
| Browser | XSS | React escaping, no raw HTML, per-request nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, nosniff | Headers verified on a production build |
| Redirects | Open redirect | `safeRedirectPath` allows only same-origin relative paths | Verified by unit and end-to-end tests |
| Logs | Secret leakage | Redacting JSON logger | Implemented. Dev email transport prints links to the console by design (development only) |

**Known limitations**
- Better Auth's email-verification link is a signed JWT valid for 24h, not a single-use hashed row. Password-reset tokens are stored in the `verification` table and deleted on use, but stored as received rather than hashed. Both are the library's design; I did not replace it with custom crypto.
- `style-src-attr 'unsafe-inline'` is allowed for `style=""` attributes.
- Pages are rendered per request (no static shell) because the nonce CSP requires it.
- Production email delivery, Secure cookies and TLS to Neon are untested until deployed.

See `docs/SECURITY-AUDIT.md` for the Phase 7 results, findings and remaining limitations.
