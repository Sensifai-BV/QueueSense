---
name: integration-with-logto-third-party
description: How a third-party marketplace application integrates Logto as an OIDC Identity Provider via the Authorization Code flow with PKCE, using the client_id/client_secret issued for that application. Use whenever building, reviewing, or debugging a third-party app's login/auth integration with Logto — sign-in buttons, "Sign in with Logto", OIDC callback handling, ID token verification, session/userinfo retrieval, or logout/SSO sign-out — in any language or framework (Go, Node.js, Python, etc.).
---

# Integrating a third-party app with Logto (OIDC third-party application)

## What this is

Gatekeeper registers external partner apps as **Logto third-party OIDC applications**. Each registered app is issued exactly two credentials:

- `client_id`
- `client_secret`

That third-party app then authenticates its own end users ("customers") by running a completely
standard **OIDC Authorization Code flow with PKCE** against Logto. The third-party app never talks
to Gatekeeper's internal Postgres/NATS/Stripe internals — it only ever talks to Logto over
HTTP/OIDC, exactly like any external relying party. Treat this skill as "how to write an OIDC
relying party against our Logto tenant," not as "how Gatekeeper provisions apps."

This skill follows Logto's own integration guidance for third-party apps:
https://docs.logto.io/integrate-logto/third-party-applications (summarized in
`references/logto-docs.md`). The canonical, runnable reference implementation in this repo is
**`cmd/third-party/main.go`** — a Go smoke harness ("Brand Recognition") that exercises the entire
flow with no internal/ imports; its full code is reproduced and explained in
`references/example-go.md`. See the **References** section below for every supporting file.

## The flow, exactly

1. **Discover Logto's OIDC endpoints.** `GET {LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`
   returns `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`,
   `end_session_endpoint`, `issuer`. Always discover these — never hardcode `/oidc/auth` etc.,
   because the issuer/endpoint shape can change between tenants/environments.
2. **`/login` — start the flow.**
   - Generate three random, URL-safe values: `state`, `nonce`, `code_verifier` (PKCE).
   - Derive `code_challenge = BASE64URL(SHA256(code_verifier))`.
   - Stash `{state, nonce, code_verifier}` server-side (or in a short-lived signed cookie), keyed
     by `state`, with an expiry of a few minutes. Never trust client-supplied state without this
     lookup — it is the CSRF defense for the whole flow.
   - Redirect the browser to `authorization_endpoint` with query params: `client_id`,
     `redirect_uri`, `response_type=code`, `scope` (at minimum `openid profile email`), `state`,
     `nonce`, `code_challenge`, `code_challenge_method=S256`.
3. **`/callback` — complete the flow.** Logto redirects back with `?code=...&state=...` (or
   `?error=...&error_description=...` on failure — surface that to the user instead of proceeding).
   - Look up the pending flow by `state`; if it's missing/expired, abort — that means the request
     either replayed an old `state` or never originated from this server's `/login` (CSRF). The
     lookup must be single-use: delete it once consumed.
   - **Exchange the code for tokens** with a `POST` to `token_endpoint`,
     `Content-Type: application/x-www-form-urlencoded`, body: `grant_type=authorization_code`,
     `code`, `redirect_uri` (must exactly match what was sent to `/login`), `client_id`,
     `client_secret`, `code_verifier`. **This is the only step that uses `client_secret`, and it
     must only ever happen server-to-server — never in the browser/client-side JS.**
   - **Verify the returned `id_token`** before trusting any claim in it:
     - Signature against `jwks_uri` (fetch/cache the JWKS; a small clock-skew allowance, ~2 min, is
       fine to absorb clock drift).
     - `iss` must equal the discovered `issuer`.
     - `aud` must include this app's `client_id`.
     - `nonce` claim must equal the `nonce` generated in `/login`.
     - Skipping any one of these checks turns the integration into something that will accept a
       forged or replayed token.
   - Read the verified `sub` claim — that is the durable, trustworthy user identifier. Start a
     local session keyed off it, store the `access_token` (server-side only) and its expiry.
   - Optionally call `userinfo_endpoint` with `Authorization: Bearer {access_token}` to get a
     richer profile (`name`, `email`, `picture`, …); if it fails, fall back to the claims already
     present in the verified ID token rather than failing the whole login.
4. **"Show customer detail" (e.g. `/api/me`).** Re-validate the local session on every request.
   While the access token is still live, re-fetch `userinfo_endpoint` live rather than only
   serving a value cached at login time — profiles can change between logins.
5. **`/logout`.** Clear the local session, then (if the discovery document advertised
   `end_session_endpoint`) redirect there with `client_id` and `post_logout_redirect_uri` so
   Logto's own SSO session ends too — otherwise the next `/login` silently re-authenticates the
   same browser without showing a login screen.

## Non-negotiable security rules

- **ZERO MOCK LOGIN BYPASS (STRICT):** NEVER create fake sessions or development bypasses in `/api/auth/login` (such as `if (isLocal) ...` or checking for localhost/internal IP). In Docker/Coolify reverse-proxy environments, host headers often evaluate as local, causing mock bypasses to trigger in production, locking out real users and leaking hardcoded developer profiles (`Mohyeddin Saffar` or fake subs). All login requests MUST redirect to the real Logto OIDC authorization endpoint (`/oidc/auth`).
- **LOCAL & PRODUCTION REDIRECT URI RESOLUTION (ZERO OIDC REDIRECT ERRORS):** In `src/lib/sensifai/auth.ts`, `getSafeBaseUrl` must detect `localhost` and `127.0.0.1` requests to return the local origin (e.g. `http://localhost:3000`), while resolving production requests to canonical `https://<app>.sensifai.com`. Both `http://localhost:3000/callback` and `https://<app>.sensifai.com/callback` must be registered in the application's Logto OIDC redirect URIs so that local testing redirects seamlessly without `invalid_redirect_uri` errors.
- **MANDATORY AUTHENTICATION FOR CUSTOM UPLOADS & BILLABLE ACTIONS:** Unauthenticated guests MUST NEVER be allowed to run custom uploads, media files, recordings, or user queries through the AI models or billable APIs for free. Custom action routes MUST strictly verify authentication (`sub` via session cookie or `x-api-key`) and return HTTP `401 Unauthorized` (`{ error: "Authentication required...", code: "UNAUTHORIZED", login_url: "/api/auth/login" }`). In frontend UI, custom upload cards must check auth status (`/api/auth/me`), display a clear "Sensifai Account Required" prompt with a direct Sign In CTA, and replace the submit button with `Sign In to Analyze (€0.05)` linking to `/api/auth/login`. Static benchmark presets may be offered for preview, but ANY custom input MUST be gated behind login.
- **NO HARDCODED FALLBACK CLAIMS:** In `/callback`, NEVER fall back to hardcoded test user IDs or developer names. If token exchange or ID token verification fails, redirect with `/?error=auth_failed` or `/?error=token_exchange_failed`.
- **PREVENT BLACK/BLANK SCREENS:** All OIDC error queries from Logto (`?error=...&error_description=...`) and all callback exceptions must be caught and gracefully redirected to the application root with clear query parameters, rather than rendering empty 500 pages or unhandled white/black screens.
- `client_secret` lives only in server-side config/env — never in a browser bundle, query string,
  or any client-rendered page.
- Always use PKCE (`S256`), even though this is a confidential client — it closes the
  authorization-code-interception gap and Logto expects it.
- Always validate `state` (CSRF) and `nonce` (replay) — both are single-use values tied to one
  `/login` attempt.
- Always verify the `id_token` signature + `iss` + `aud` + `nonce` before reading any claim from
  it. Don't decode-without-verifying "just to get the email."
- `redirect_uri` sent in `/login` and `/callback`'s token exchange must be byte-identical, and must
  be one of the redirect URIs registered for this `client_id` in Logto.
- Sessions/cookies: `HttpOnly`, `Secure` (when https/production), `SameSite=Lax`, 7-day max-age, server-side session store (don't put `access_token` in a client-readable cookie).
- **DROP-IN PLATFORM TEMPLATES:** Standard Next.js App Router implementations are pre-built in `templates/src/lib/sensifai/auth.ts`, `templates/src/app/api/auth/`, and `templates/src/app/callback/route.ts`. Use them directly rather than writing auth from scratch.

## Logto OIDC Base URLs (LOGTO_ENDPOINT)

Third-party applications configure the Logto tenant base URL (`LOGTO_ENDPOINT`) depending on the environment:

- **Development environment**: `https://auth-dev.sensifai.com`
- **Production environment**: `https://auth.sensifai.com`

## Logto OIDC Endpoints

OIDC endpoints are relative to the configured `LOGTO_ENDPOINT` base URL. Applications should discover these endpoints dynamically, but for reference they reside at the following paths:

- **OpenID Provider Configuration (Discovery)**: `/oidc/.well-known/openid-configuration`
  - *Usage*: Used to query OIDC configuration metadata, including endpoint URLs and supported features.
- **Issuer**: `/oidc`
  - *Usage*: Validated against the `iss` claim in returned ID tokens to verify authenticity.
- **JWKS URI**: `/oidc/jwks`
  - *Usage*: Contains cryptographic public keys to verify JWT signatures of ID tokens.
- **Authorization Endpoint**: `/oidc/auth`
  - *Usage*: Redirect users to this URL to initiate OIDC Authorization Code Flow.
- **Token Endpoint**: `/oidc/token`
  - *Usage*: Called server-to-server with client credentials, verification code, and PKCE verifier to retrieve tokens.
- **Userinfo Endpoint**: `/oidc/me`
  - *Usage*: Queried with Bearer Access Token to retrieve user profiles.

## Required configuration

Whatever language/framework, the third-party app needs exactly these inputs as configuration:

| Value                        | Description                                                                                                               |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `LOGTO_ENDPOINT`             | The Logto tenant base URL (Development: `https://auth-dev.sensifai.com`, Production: `https://auth.sensifai.com`)         |
| `LOGTO_CLIENT_ID`            | This application's Logto `client_id`                                                                                      |
| `LOGTO_CLIENT_SECRET`        | This application's Logto `client_secret`                                                                                  |
| `PUBLIC_URL` / redirect base | This app's own public URL; `{PUBLIC_URL}/callback` is the `redirect_uri`, and must be registered on the Logto application |
| `LOGTO_SCOPES`               | Space-separated OIDC scopes, minimum `openid profile email`                                                               |

## Definition of done for a new third-party integration

1. Discovery call succeeds and endpoints are cached/reused (don't refetch on every request).
2. `/login` generates fresh `state`/`nonce`/`code_verifier` per attempt and never reuses them.
3. `/callback` rejects unknown/expired `state`, surfaces `error`/`error_description` from Logto,
   and fully verifies the `id_token` (signature, issuer, audience, nonce) before establishing a
   session.
4. `client_secret` only appears in the server-side token-exchange call, never client-side.
5. A "me"/profile endpoint re-validates the session and refreshes from `userinfo_endpoint`.
6. `/logout` clears the local session and redirects through `end_session_endpoint` when present.
7. All cookies are `HttpOnly` + `Secure`; no token is stored in client-readable storage.

## References

- `references/logto-docs.md` — summary of Logto's own third-party-app integration guide
  (https://docs.logto.io/integrate-logto/third-party-applications): how the application is
  registered in the Logto Console, application types (Traditional Web / SPA / Native), the consent
  screen, and device flow for input-limited devices.
- `references/example-go.md` — full, exact Go implementation (stdlib `net/http` +
  `lestrrat-go/jwx` for JWKS/JWT verification). Matches `cmd/third-party/main.go` in this repo.
- `references/example-nodejs.md` — full, exact Node.js implementation (Next.js App Router +
  `openid-client`).
- `references/example-python.md` — full, exact Python implementation (Flask + `Authlib`).

All three example files implement the identical flow described above for a **Traditional Web**
(confidential client) third-party application; read whichever one matches your stack, and read
`references/logto-docs.md` first if you also need to register or configure the application in the
Logto Console itself.
