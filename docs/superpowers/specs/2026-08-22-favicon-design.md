# Pify Docs favicon design

## Goal

Make the Pify favicon reliably discoverable on every English and Vietnamese documentation route while preserving the transparent logo treatment selected from the existing Pify logo pack.

## Visual treatment

- Use the transparent Pify mark without a background tile.
- Use the existing black mark and indigo accent on light browser chrome.
- Use the existing white mark and lighter indigo accent on dark browser chrome.
- Select the color variant with the SVG `prefers-color-scheme` media query so one favicon URL adapts without client-side JavaScript.

## Integration

- Add the adaptive SVG through the Next.js App Router `app/icon.svg` metadata convention so Next.js publishes the icon link for every localized route.
- Keep `public/favicon.svg` as the stable `/favicon.svg` compatibility URL.
- Remove the manual nested-layout icon declaration if it duplicates the file-convention metadata.
- Do not add a manifest, installable-PWA behavior, or unrelated branding assets.

## Verification

- Add an end-to-end assertion that English and Vietnamese pages expose an SVG favicon in document metadata.
- Verify that the favicon asset responds successfully with an SVG content type.
- Run unit tests, content tests, type checking, linting, formatting, the production build, and the complete browser suite.
- After deployment, verify the production document metadata and favicon response directly.

## Success criteria

The browser receives one usable adaptive Pify favicon on all public documentation pages, the light and dark variants remain legible, and existing navigation, metadata, and bilingual content behavior remain unchanged.
