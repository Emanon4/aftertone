# License scope and third-party notices

The root MIT license covers Aftertone's original application code and documentation. It does not grant rights to third-party music, artist/album metadata, artwork, previews, trademarks, or services.

## Music data and media

- `public/catalog/`, `lib/featured.json`, and source/provenance records under `data/` describe third-party music. They are not licensed as original Aftertone content under MIT.
- Track metadata, cover image links, and preview services originate from Deezer or Apple/iTunes. Their content rights remain with the providers and respective rightsholders. This repository contains no full-track audio and grants no redistribution or commercial music license.
- API access and use remain subject to [Deezer API Terms](https://developers.deezer.com/termsofuse) and [Apple/iTunes promotional content terms](https://www.apple.com/legal/internet-services/itunes/itunesaffiliate/). Deezer's published API terms specify non-commercial use; the open-source code license does not override this restriction for use of that service or its data.
- `web/public/og-image.png` contains thumbnails of third-party album artwork for link previews; the artwork remains with its rightsholders.

## Bundled third-party source

- No third-party source files are vendored in this repository. (Earlier versions bundled a Sites Vite plugin and shadcn components; both were removed in October 2026. Their notices remain in Git history.)
- Dependencies declared in `package.json` and resolved in `package-lock.json` retain their own licenses. Dependency installations and compiled distributions must preserve applicable upstream notices.
