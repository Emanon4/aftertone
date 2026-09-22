# License scope and third-party notices

The root MIT license covers Aftertone's original application code and documentation. It does not grant rights to third-party music, artist/album metadata, artwork, previews, trademarks, or services.

## Music data and media

- `public/catalog/`, `lib/featured.json`, and source/provenance records under `data/` describe third-party music. They are not licensed as original Aftertone content under MIT.
- Track metadata, cover image links, and preview services originate from Deezer or Apple/iTunes. Their content rights remain with the providers and respective rightsholders. This repository contains no full-track audio and grants no redistribution or commercial music license.
- API access and use remain subject to [Deezer API Terms](https://developers.deezer.com/termsofuse) and [Apple/iTunes promotional content terms](https://www.apple.com/legal/internet-services/itunes/itunesaffiliate/). Deezer's published API terms specify non-commercial use; the open-source code license does not override this restriction for use of that service or its data.
- `public/images/vinyl-record.jpg` is Evan-Amos's public-domain [12in Vinyl LP Record Angle](https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg), declared PD-self. The new Pages interface does not include this legacy image in its build.

## Bundled third-party source

- `build/sites-vite-plugin.ts`: Copyright (c) 2026 OpenAI. MIT license retained in `build/sites-vite-plugin.LICENSE`.
- Copied shadcn UI components in `components/ui/`, related hooks, and vendored shadcn styles: Copyright (c) 2023 shadcn. MIT notice retained in `vendor/shadcn-tailwind-4.13.0.LICENSE.md`.
- Dependencies declared in `package.json` and resolved in `package-lock.json` retain their own licenses. Dependency installations and compiled distributions must preserve applicable upstream notices.
