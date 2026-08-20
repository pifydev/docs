# Pi Docs — Brand Assets

This directory holds the official **Pify** brand pack used across the docs site
(favicon, sidebar logo, hero, GitHub social preview, README banner).

The pack was originally delivered as four master SVGs plus a full PNG size grid
(stored in `C:\Users\Admin\Downloads\pify-logo-pack\` on the author's
machine). All assets here were copied from that source.

## Files

| File | Purpose | Notes |
| --- | --- | --- |
| `pify-logo-light-bg.svg` | Light surface + dark mark | Use on light backgrounds. |
| `pify-logo-dark-bg.svg` | Dark surface + white mark | Use on dark backgrounds. |
| `pify-logo-on-light.svg` | Transparent BG, dark mark | Use over arbitrary light content. |
| `pify-logo-on-dark.svg` | Transparent BG, white mark | Use over arbitrary dark content. |
| `pify-logo-light-bg-rounded.svg` | Rounded variant of light-bg | |
| `pify-logo-dark-bg-rounded.svg` | Rounded variant of dark-bg | |
| `pify-light-512.png` | 512 px raster of light-bg | For hi-DPI raster needs. |
| `pify-dark-512.png` | 512 px raster of dark-bg | |
| `pify-on-light-128.png` | 128 px raster on-light | Used as PNG favicon fallback. |
| `pify-on-dark-128.png` | 128 px raster on-dark | |
| `favicon.svg` | Adaptive favicon | Uses `prefers-color-scheme` media query to swap mark + accent between light and dark. |

## Where each is used

- `favicon.svg` / `favicon.png` — browser tab icon (per mdBook `theme/favicon.{svg,png}`)
- `pify-logo-light-bg.svg` — hero on each language `index.md`, README banner
- `pify-logo-dark-bg.svg` — reserved for dark-only contexts (not currently wired)
- `pify-light-512.png` / `pify-dark-512.png` — sidebar logo via `theme/custom.css`
  (light variant by default, dark variant in `navy` / `coal` / `ayu` / `rust` themes)
- `social-preview.png` (in `.github/`) — GitHub social preview card (1280×640)

## Design tokens

- Light-bg mark: `#09090b` (near-black)
- Light-bg accent: `#6366f1` (indigo)
- Dark-bg mark: `#ffffff`
- Dark-bg accent: `#818cf8` (lighter indigo)
- Canvas (dark): `#09090b`
- Canvas (light): `#ffffff`

## Updating

If you regenerate the source SVGs, copy the new files here, then re-run
`pwsh scripts/build-all.ps1` so the per-language `theme/` copies and the
`.github/social-preview.png` stay in sync.
