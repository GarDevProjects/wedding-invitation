# Akion & Mariamalia — Wedding invitation platform

The existing Spanish invitation design, editorial sections, photo carousel/lightbox, music, maps, countdown, calendar download and gift details are preserved. The site now uses **Astro + TypeScript + React islands + Tailwind CSS**, with **Supabase PostgreSQL/Auth/Realtime/Edge Functions** and **Cloudflare Pages** deployment support.

Start with [MANUAL_SETUP.md](MANUAL_SETUP.md) to enable real invitations and administration. The migration adds the application code; it does not create provider accounts, deploy infrastructure or provision administrator credentials.

## Run locally

Install Node.js 24 LTS, then:

```sh
npm ci
cp .env.example .env
npm run dev
```

PowerShell: use `Copy-Item .env.example .env` instead of `cp` if preferred. Replace the sample environment values. Without Supabase configuration the public invitation remains viewable and the RSVP/admin areas explain their unavailable state.

For production-style deep links and security headers:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4321/`, `/admin/`, or `/i/<token>`. The production preview implements Cloudflare's link rewrite. The development server is for editing static content; use the production preview when testing personalized URLs.

## Personalize

Edit [src/config/wedding.ts](src/config/wedding.ts). Confirmed details: **Akion & Mariamalia, January 29, 2027, arrival at 14:30 and ceremony at 15:00, America/Costa_Rica**, at Sala de Eventos Laureal. The default RSVP deadline is **January 1, 2027 at 23:59:59 -06:00**. The venue map and directions use the supplied Waze location.

The carousel uses all numbered personal photos in `src/assets/photos/`, with photo 2 named `hero.jpg`. The five section photos have independent, descriptive filenames in `src/assets/photos/secciones/` (`01-inicio.jpg` through `05-confirmar-asistencia.jpg`); replace these files to choose section images without changing the carousel. Edit assignments and accessible descriptions in [src/config/photos.ts](src/config/photos.ts). Numbered JPGs are discovered in numeric order; legacy stock photos are excluded. Astro generates responsive section images, small carousel thumbnails and larger WebP lightbox images loaded on demand. See [the photo collection notes](src/assets/photos/README.md). The existing MP3 is in `public/audio/song.mp3` and loads only after a music-button click. Fonts are served locally.

The public page is static HTML. React hydrates only the RSVP island and the separate admin dashboard. Auth and Realtime libraries are loaded by the admin page; guests use a small fetch client. Existing CSS preserves the design, while Tailwind utilities support the dashboard without applying a global reset.

## Invitation rules

- One named person and one seat per invitation; no guest-name lookup or extra-seat field.
- A 256-bit random token identifies an invitation. Only its SHA-256 hash is stored, in a private schema outside the browser and Realtime publication.
- Acceptance/decline can be changed until the invitation's server-enforced deadline. Identical retries do not add audit events.
- Complete links are shown only when created/rotated and held in page memory. Copy them before reloading. A replacement link revokes the previous token and clears the sent marker.
- Admins can create/edit, share manually through WhatsApp, mark sent, revoke, archive/restore, search/filter and export the current view.
- Admins can import up to 200 guests per CSV with preview, validation, duplicate checks and atomic creation, then download the generated links. Testing tools can permanently reset all invitations and responses after typed confirmation. See [the setup and usage guide](ADMIN_CSV_SETUP.md).
- The admin has a separate white interface, responsive sidebar, RSVP and delivery charts, visible CSV/reset actions and confirmed individual deletion. Individual deletion removes the selected invitation, its RSVP/history and token through a service-only database function.
- Metrics exclude archived invitations; response rate is responded active invitations / all active invitations. An acceptance always counts as one seat.
- Realtime changes refresh server-calculated metrics. Thirty-second polling and reconnect/visibility refreshes provide a fallback.
- Attendance CSV exports omit tokens and neutralize spreadsheet formulas. The separate import-result download includes the newly generated personal links; keep it private. Neither export is a complete database backup.

## Verify

```sh
npm run check
npm test
npm run test:db:embedded
npm run check:edge
npm run test:edge
npm run build
npx playwright install chromium
npm run test:e2e
```

The database tests execute the actual migration in embedded PostgreSQL with minimal Supabase Auth fixtures. With Docker and the local Supabase database available, run the same pgTAP suite against Supabase:

```sh
npx supabase db start
npm run test:db
npx supabase stop
```

Browser tests use mock API/Auth responses. CI separately runs the database suite in Supabase. Real Auth delivery, ingress, Realtime connections, hosting and real-device Safari still need the checks in MANUAL_SETUP.md.

## Deployment

[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) replaces the old repository-root GitHub Pages upload with type checks, unit/API/database/browser tests and an opt-in Cloudflare Pages deployment. Deployments run after checks pass when the Cloudflare project variable and required credentials are configured. Only `dist/` is deployed. Backend schema/function deployment is a separate, deliberate setup step.

## Source layout

```text
src/config/                 Typed wedding content and photo imports
src/components/             Preserved invitation, responsive photos, RSVP/admin islands
src/scripts/                Typed invitation interactions and persistent music
src/lib/                    API, dates/calendar, admin search and CSV utilities
src/pages/                  Static invitation, link shell and admin page
src/styles/                 Existing visual system plus Tailwind utilities
public/                     Audio, favicon, privacy headers and link rewrites
supabase/migrations/        Database schema, RLS and transactional functions
supabase/functions/         Token API, admin authorization and input validation
supabase/tests/database/    pgTAP authorization and RSVP lifecycle tests
scripts/                    Security-header generation, preview and embedded DB tests
tests/                      Unit and desktop/mobile browser tests
```

See [MIGRATION_REPORT.md](MIGRATION_REPORT.md) for the audit, technology decisions and verification limits. The original [migration.md](migration.md) remains the requested blueprint.
