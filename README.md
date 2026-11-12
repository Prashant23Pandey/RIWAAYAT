# EMERGENCE — Replica

A Next.js recreation of the [Emergence](https://emergenceprojects.com/) art
portfolio / shop site: 15 horizontally navigated pages with scroll-driven,
hover, and load animations, working order forms backed by SQLite, and a small
admin view for orders.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

- `/` opens page 1, `/<n>` (1–15) deep-links any page.
- `/admin?password=…` lists submitted orders. Password comes from the
  `ADMIN_PASSWORD` env var (default `changeme` — change it in production).

## How it works

### Page content pipeline

`tools/build-pages.mjs` reads the original page snippets (default source
directory `C:\Users\prash\AppData\Local\Temp\opencode\site2`, override with
`RM_SOURCE_DIR`) and emits:

- `public/pages/p01.html … p15.html` — processed page markup (fixed-position
  containers, content scroll wrapper, widgets, animation containers),
- `src/lib/pages-meta.ts` — per-page height, content offset, form flag,
  background colour,
- `public/pages/replacements.log` — log of long-form text that was replaced
  with placeholder copy.

Long creative prose from the original site is replaced with placeholder
paragraphs (short functional labels, product names, prices, specs, policies
and contact details are kept). Images are hot-linked from the original public
CDN. See **Rights & content** below.

### Viewer runtime (`src/components/viewer/MagViewer.tsx`)

The viewer loads all 15 processed pages, renders each into its own scaled
stage (design width 1024px, scale = viewport width / 1024), and switches pages
with a horizontal slide. Navigation supports mouse wheel, touch swipe,
keyboard (arrows / PageUp / PageDown / Home / End) and in-page links
(`data-nav` anchors, `data-goback` back links). URLs stay in sync via
`history.pushState` / `popstate`.

Animation types are detected per animation container and reproduced:

| Type | Detection | Playback |
| --- | --- | --- |
| **Load** | container has a direct `<style>` with `@keyframes` (opacity fade and/or `offset-distance` motion) | plays when the page is entered (1s per animation, linear, `fill both`) |
| **Hover** | nested container with `scale(1) → scale(1.x)` keyframes wrapping a `has-onhover-animation` widget | plays on pointer enter, reverses on leave |
| **Scroll** | real `offset-path`, no keyframes | scrubbed against scroll position |

Scroll playback follows the original viewer's model: fixed widgets use
`offset-distance = scrollTop` (1 screen px of scroll = 1 px of path, capped at
the path length); content widgets start when the widget enters the viewport
bottom and advance 1 px per px scrolled. Containers whose inline opacity is 0
fade in with the same progress. The shop page (4) is a horizontal
scroll-jacked page: wide panners move across 90% of the scroll range and the
product slide-ins are distributed sequentially across it.

### Orders

The order forms (pages 6–13) validate required fields client-side, then POST
to `/api/orders` (validation, basic per-IP rate limiting). Orders are stored
in SQLite at `data/orders.db` (override with `DB_PATH`). View them at
`/admin`.

## Known approximations

The original is a hosted Readymag publication, so a few values are not
published in the page data and are reproduced approximately:

- **Animation timing**: per-widget speed / delay values live in Readymag's
  unpublished configuration. Scroll animations assume speed 1 (1 px of scroll
  per px of path) and content animations use the default "enter at viewport
  bottom" trigger. Load animations use 1 s durations in document order.
- **Shop page choreography**: the per-item delays on page 4 are distributed
  evenly across the scroll range rather than matching the original exact
  timings.
- **Navigation targets**: link targets that were not present in the exported
  markup were inferred from page geometry (menu → 2/3/4/5; shop cards → their
  product pages; back-to-top → page 1). Sharf 2 and Sharf 3 (pages 10–11) are
  reachable by sequential navigation only.
- Scroll animations of content widgets do not pin content in place the way
  the original `position: sticky` content region can; the container scrolls
  normally while the fixed layer is translated by JavaScript.

## Rights & content

The layout, imagery and branding belong to the original site's owners. This
project is a technical recreation for study purposes. Before any public
deployment, replace the placeholder prose with licensed copy and the
hot-linked images with assets you have the rights to use. The page snippets
used to build `public/pages/` are not included in this repository.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run start` | serve the production build |
| `npm run lint` | ESLint |
| `node tools/build-pages.mjs` | regenerate `public/pages/*` and `pages-meta.ts` from the raw snippets |
