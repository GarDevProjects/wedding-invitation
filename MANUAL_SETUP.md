# Manual setup and launch checklist

The code is migrated. **No live Supabase project, administrator account, Cloudflare project, production secrets, custom domain or invitations have been created or deployed by this migration.** Complete the steps below to enable real RSVP and administration.

## 0. Prepare PowerShell on this machine

Open PowerShell in this repository. This checkout already has a portable Node.js runtime:

```powershell
Set-Location "C:\Users\garro\OneDrive\Desktop\gardev-projects\wedding-invitation"
$env:PATH = "$PWD\.tools\node-v24.22.1-win-x64;$env:PATH"
$env:ASTRO_TELEMETRY_DISABLED = "1"
node.exe --version
```

The portable runtime is ignored by Git. On another machine, install Node.js 24 LTS and run `npm.cmd ci` first. In PowerShell, use `npm.cmd` / `npx.cmd` for the commands below if script execution policy blocks bare `npm` / `npx`.

For the simplest path, configure hosted Supabase first, test the frontend locally, then use **Option B — Cloudflare Git integration** below. This does not require Docker on your machine. Do not run `supabase init`: this repository already contains its configuration and migration. Docker is needed only for the optional full local Supabase/database integration stack.

## 1. Confirm wedding content

Edit `src/config/wedding.ts` before generating invitations:

- [x] Confirmed: **Akion & Mariamalia**, January 29, 2027, event arrival at **14:30 Costa Rica time**.
- [x] Confirmed default RSVP deadline: **January 1, 2027 at 23:59:59 -06:00**.
- [x] Confirmed timeline: 14:30 arrival, 15:00 ceremony. Add reception/dinner/dancing only when their times are known.
- [x] Confirmed Sala de Eventos Laureal and the supplied Waze directions/embedded map at 10.01333470, -84.13765630.
- [ ] Confirm parking/accessibility/transport arrangements. No parking availability claim is currently published.
- [ ] The existing dress code remains **Formal tropical**, with white and ivory reserved for the bride. A specific children policy has not been supplied; add its wording if applicable.
- [ ] Replace stock photographs by importing licensed photos from `src/assets/photos/`; update their accessible descriptions.
- [ ] Confirm permission to publish the existing hero photo and `public/audio/song.mp3`. Replace/compress audio if needed; it currently occupies about 4.5 MB and is deferred until requested.
- [ ] Fill in gift/SINPE information if desired. Static wedding content is public, including any bank details written there.
- [ ] Decide how guests should contact the couple with problems. Add that contact to the invitation if desired.

The global deadline is display text and the default for **new** invitations. Each existing invitation has its own deadline in the database; change it through the dashboard when necessary. Admin date inputs always use Costa Rica time, independent of the administrator device's timezone.

## 2. Create the Supabase project

1. Create a Supabase account and project; save its database password securely.
2. Record its **project reference**, **Project URL** and **publishable key** (a legacy anon key also works).
3. Keep production and preview/test data in separate projects where practical. Do not point public test deployments at production guest records.
4. In **Authentication → Providers/Sign In settings**, disable public user sign-up. The local configuration already disables it, but hosted Dashboard settings must also be changed manually.
5. Set the Auth Site URL to the final HTTPS site origin. Email/password login is implemented; OAuth, self-registration and password-reset screens are not part of this application.

Use a trusted machine with Node.js 24 LTS and the installed repository dependencies:

```sh
npm ci
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Inspect the target project and pending migration before pushing. On an existing populated project, export a backup first and resolve any existing table/name conflicts. This migration is intended for a new wedding-platform schema. Do not use `db reset` against a populated or production project.

Alternatively, for a fresh project, run `supabase/migrations/202610280001_wedding.sql` once in the Supabase SQL Editor. Do not apply it both ways; the CLI is preferred for recorded migration history. If you use the editor, reconcile the migration history before later CLI pushes.

The migration creates invitation/RSVP/admin/audit tables, a private token/rate-limit schema, restricted read policies, service-only functions and Realtime publication entries. It does **not** grant anyone admin membership.

## 3. Provision administrator users

1. In Supabase **Authentication → Users**, create each administrator with email and a strong password. Confirm the email through the Dashboard if you are provisioning directly.
2. In the SQL Editor, grant membership to an existing Auth user:

```sql
insert into public.admin_profiles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict (user_id) do nothing;

select u.id, u.email, p.role
from auth.users u
join public.admin_profiles p on p.user_id = u.id;
```

3. Verify the expected email appears in the result. A successful Auth login alone does not grant dashboard access.
4. Open `/admin/` on the deployed site and sign in. There are no built-in/default passwords.
5. To revoke access, remove that user's `admin_profiles` row and revoke their Auth sessions in Supabase. API authorization checks membership on every admin request. Supabase Realtime may cache read authorization until a token refresh/reconnect; use a short suitable JWT lifetime and revoke sessions when removing an administrator.

Account recovery and password changes are managed through the Supabase Dashboard or your own later recovery flow. If you enable email invitations/recovery, configure your SMTP provider, sender domain and Auth email templates, then test delivery. This app does not send guest invitation emails or RSVP notification emails.

## 4. Configure and deploy the Edge Function

Copy `supabase/.env.example` to an ignored file such as `supabase/.env.production`. Fill in:

```dotenv
ALLOWED_ORIGINS=https://YOUR_SITE.pages.dev,https://YOUR_CUSTOM_DOMAIN
RATE_LIMIT_SALT=AT_LEAST_32_RANDOM_CHARACTERS
```

Use exact origins with protocol and no trailing slash; omit any domain you do not own. Generate the salt in a password manager or with `openssl rand -hex 32`. Do not use the example value. Keep localhost origins in the development project only.

```sh
npx supabase secrets set --env-file supabase/.env.production
npx supabase functions deploy wedding-api --no-verify-jwt --use-api
```

`verify_jwt = false` is intentional: guests authenticate with invitation tokens. Admin operations validate the bearer JWT with Supabase Auth **and** check `admin_profiles` inside the handler. Never replace that check with a decoded JWT or editable user metadata.

`--use-api` bundles the function remotely, so deployment does not require Docker. To test against your hosted project from the local preview, temporarily add `http://localhost:4321,http://127.0.0.1:4321` to its allowed origins. Remove those origins from the production project after local testing, or use a separate development project for ongoing tests.

Dependency configuration is in `supabase/functions/wedding-api/deno.json`, alongside the function entrypoint. Keep it there: a parent `supabase/functions/deno.json` can work locally while the remote bundler misses it and rejects bare imports such as `@supabase/supabase-js` or `zod`. Both Edge check commands use the function-local configuration.

On Windows, generate the salt locally with:

```powershell
node.exe -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Neither belongs in frontend variables, the repository, Cloudflare's public build configuration or a chat message. Keep actual `.env` files ignored.

The API limits all requests to 120 per source address per ten minutes and responses to 30 per token per hour. Counters are stored in PostgreSQL and stale entries are pruned on requests. Test the deployed ingress's trusted `X-Forwarded-For` behavior; the function uses its rightmost address. Missing addresses share an `unknown` bucket. If guests share a network, those guests share the IP limit. CORS restricts browsers; tokens/Auth and server limits remain necessary because other HTTP clients can omit Origin.

For unusually high exposure, add provider-level abuse/bot controls. Turnstile and automated messaging are not implemented or required for ordinary manual sharing.

## 5. Configure frontend build values

Copy `.env.example` to `.env` for local work and set:

| Value | Example | Location |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://YOUR_SITE.pages.dev` | Frontend build; produces correct social-image URLs |
| `PUBLIC_SUPABASE_URL` | `https://PROJECT_REF.supabase.co` | Frontend build |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/legacy anon key | Frontend build; intentionally public |
| `ALLOWED_ORIGINS` | Exact production and development origins | Supabase function secrets only |
| `RATE_LIMIT_SALT` | Random secret, 32+ characters | Supabase function secrets only |

Build values are embedded in static output. **Changing them requires a rebuild/redeploy.** If you use a custom Supabase domain, add its HTTPS and WSS origins to `public/_headers` under `connect-src`; the supplied policy allows standard `*.supabase.co` projects. Run the full build to regenerate script hashes whenever content/scripts change.

For a local frontend connected to hosted Supabase, use `PUBLIC_SITE_URL=http://127.0.0.1:4321` in `.env`, plus the hosted project's URL and public key, then run:

```powershell
npm.cmd run build
npm.cmd run preview
```

Open `http://127.0.0.1:4321/admin/`, sign in, create a test guest and open their generated URL. If the preview is already running on port 4321, rebuilding and refreshing is sufficient. The backend uses hosted Supabase; only the frontend is local in this path.

## 6. Publish to Cloudflare Pages

Choose one deployment method. The application is static: no Cloudflare adapter, Worker, database binding or server runtime is needed on Cloudflare.

### Option A — GitHub Actions, included and gated by tests

1. Create a **Direct Upload Cloudflare Pages project** for this repository. Use its exact project name below.
2. In GitHub repository **Settings → Secrets and variables → Actions**, set repository variables:
   - `CLOUDFLARE_PAGES_PROJECT`
   - `PUBLIC_SITE_URL`
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Set secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Scope the API token to Cloudflare Pages edit access for the required account.
4. Configure the GitHub `production` environment and any desired deployment reviewers.
5. Push reviewed code to `main` or run the workflow manually. It runs frontend/API/database/browser checks, builds with production public values and uploads **only `dist/`**.
6. The deploy job stays disabled until `CLOUDFLARE_PAGES_PROJECT` is set. Supabase migrations/functions are deliberately not automatically pushed by this workflow.

### Option B — Cloudflare Git integration

1. Create a Git-connected Pages project and select this repository and `main`.
2. Build command: `npm run build`. Output directory: `dist`. Node version: `24`.
3. Add the three `PUBLIC_*` build values above, separately for production and preview.
4. Keep the GitHub `CLOUDFLARE_PAGES_PROJECT` variable unset to avoid two deployment paths.
5. Require both CI jobs on the protected main branch before merging; Cloudflare's independent Git build does not wait for GitHub checks by itself.

For either method:

- [ ] Verify HTTPS and the generic `/` invitation.
- [ ] Verify `/admin/` and a freshly generated `/i/<token>` link on a **direct open and refresh**. `public/_redirects` rewrites personalized URLs to the static invitation shell.
- [ ] Check production response headers: `Referrer-Policy: no-referrer`, noindex, CSP, nosniff and no-store on invitation links/admin pages. No analytics are included.
- [ ] Update Supabase `ALLOWED_ORIGINS` when adding a custom domain. Domain purchase/DNS configuration remains manual.
- [ ] Disable the old GitHub Pages deployment in repository settings after the Cloudflare site is verified. The replacement workflow no longer uploads the repository root or deploys GitHub Pages.
- [ ] Set branch protection to require **Types, security and browser tests** and **Supabase database integration**. Allow dependency updates only after checks.

Personalized links contain bearer credentials in the path. Do not add analytics or log full guest URLs. Review hosting/proxy log access and retention; the app cannot prevent an infrastructure provider from recording incoming paths. Guests can forward their links; possession permits viewing/responding for that person.

## 7. Test the actual system before sending invitations

### If Cloudflare created a Worker instead of a Pages project

The October 28, 2026 deployment log reports a successful Worker deployment at `https://akion-mariamalia.gardevprojects.workers.dev`. That is the production origin for that deployment. Set `PUBLIC_SITE_URL` in its **build environment**, include that exact origin in Supabase `ALLOWED_ORIGINS`, and use it as the Supabase Auth Site URL. Apply updated function secrets with `npx supabase secrets set --env-file supabase/.env.production`.

Workers Builds may automatically add the Astro Cloudflare adapter and rebuild into `dist/client`. The security-header helper supports both `dist` and `dist/client`; push its latest version and redeploy so the served `_headers` includes the hashes required by Astro/React hydration. Check the final build message for the actual generated header path. A successful upload alone does not verify client-side RSVP/admin initialization.

The Worker-name mismatch and default `workers_dev`/preview-URL messages in that log are warnings, not deployment failures. Any Cloudflare-generated configuration PR should be reviewed before merging. The static application itself does not require KV sessions or a server-side image service.

- [ ] Create two test guests; verify their links show the correct different names and one place each.
- [ ] Accept, reload, decline and update a message. Confirm a single current RSVP and correct admin totals.
- [ ] Open the dashboard in a second device/session; verify an RSVP updates automatically. Disable the Realtime connection and check the 30-second refresh/reconnect fallback.
- [ ] Log out; verify no guest records can be read. An Auth user without `admin_profiles` membership must also be denied.
- [ ] Rotate a link: the old URL must stop resolving. Revocation and archiving must also block it. Restoring an archived invitation reactivates its existing token unless it was separately revoked.
- [ ] Test a past deadline and two simultaneous response submissions. Server time, rather than the guest's device clock, determines acceptance; concurrent valid writes serialize, and the last committed valid response wins.
- [ ] Verify the rate limit and approved origins with the real function. Missing/invalid tokens must reveal no name or contact information.
- [ ] Compare unfiltered active CSV counts to dashboard totals. Filtered/archived exports represent only the current view. Check names with accents, notes and phone numbers in your spreadsheet program.
- [ ] On actual iOS Safari, Android Chrome and desktop, check opening/music pause, continuous scrolling, gallery, menus, maps, calendar downloads, keyboard navigation, reduced motion and a slow network.
- [ ] Remove test invitations after tests through the trusted SQL Editor if permanent deletion is desired, or archive them. Archive is reversible and does not erase personal data.

Automated browser tests mock Auth/API; embedded PostgreSQL tests use minimal Auth fixtures. They do not establish live-provider availability or replace these production checks.

## 8. Create and share real invitations

1. In `/admin/`, create **one invitation per person**. Supply their name, optional international phone number and deadline.
2. Copy/save the generated URL immediately in your approved private sending record. Complete tokens are held only in page memory and are lost on reload/logout; the database intentionally stores only hashes.
3. Use the WhatsApp action or paste the URL manually. The action opens a composed message; **you** review and send it. No WhatsApp Business/API subscription is needed by this code.
4. Click **Marcar enviada** after actually sending. Opening WhatsApp/copying a link does not mark it sent.
5. If a saved URL is lost, **Generar enlace nuevo** rotates its token, disables the old URL and clears its sent marker. Send the replacement.
6. Use revoke for a compromised link, archive to remove an invitation from active totals, and restore when appropriate. Responses are retained on rotation/archive; pending/accepted/declined always represents the same named person.

## 9. Backups, recovery, privacy and cost

- [ ] Choose a private encrypted backup destination. Never commit database dumps, contact lists or invitation links to Git.
- [ ] Before distributing invitations and regularly during response collection, export the database schema **and data**, including `public`, `private`, required Auth administrator records and migration history. Follow the provider's current database backup/restore guidance; CSV alone cannot restore tokens or accounts.
- [ ] Rehearse restoration into a separate project. Verify row counts, RSVP status/deadlines, hashed tokens, Auth users/admin memberships, grants/RLS and Realtime publication. Reapply function secrets and frontend project URLs/keys; deployed functions/secrets are separate from a database dump.
- [ ] Set an appropriate retention date after the wedding. Permanent deletion of an invitation through the SQL Editor cascades to its RSVP, credentials and audit records. Archiving does not delete. Remove data from backups and private sending records according to the same retention policy.
- [ ] Monitor database/function errors, storage, Realtime connections, hosting traffic/builds, quotas and Supabase project availability/inactivity. Avoid logging request bodies, guest names/phones, JWTs or full token paths in monitoring.
- [ ] Verify current provider free-tier conditions and costs before launch. This implementation targets modest traffic; it cannot guarantee a perpetual $0 bill or prevent project pauses. Custom domain registration is separate.

## Official setup references

- [Astro React islands](https://docs.astro.build/en/guides/integrations-guide/react/) and [image processing](https://docs.astro.build/en/guides/images/)
- [Tailwind with Astro](https://tailwindcss.com/docs/installation/framework-guides/astro)
- [Cloudflare Pages with Astro](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/) and [link rewrites](https://developers.cloudflare.com/pages/configuration/redirects/)
- [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration), [server-verified Auth users](https://supabase.com/docs/reference/javascript/auth-getuser) and [Realtime PostgreSQL changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase CI testing](https://supabase.com/docs/guides/deployment/ci/testing)
