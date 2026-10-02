# harlem_shaker

The 2013 Harlem Shake bookmarklet, brought back to life.

Moovweb's original bookmarklet pulled its song and stylesheet from an S3 bucket that no longer exists, so it's been dead everywhere for years. Even if the bucket came back, strict Content Security Policies (Wikipedia's, for one) would block loading assets from S3. This version is fully self-contained: the CSS and the audio are inlined into the bookmarklet itself, so it needs no network access at runtime and survives sites that allow inline styles and `data:` media.

## Install

Visit the install page (GitHub Pages) and drag the button to your bookmarks bar. Then open any page and click it.

## How it's built

The repo holds readable sources in `src/`: the unminified script, the CSS (Moovweb's original stylesheet, a modified Animate.css, cleaned up), and the install page template. `npm run build` needs Node and ffmpeg. It fetches the song from [Moovweb's repo](https://github.com/moovweb/harlem_shaker) into `audio/` (gitignored), re-encodes it to 48 kbps mono, inlines it and the CSS into the script, minifies it into a `javascript:` URL, and writes the install page to `docs/index.html`.

```sh
npm install
npm run build
```

This repo never hosts the mp3 as a file. It exists only as base64 inside the built page, which is committed so GitHub Pages can serve it from `docs/` on `main`.

## Credits

Original bookmarklet and stylesheet by [Moovweb](https://github.com/moovweb/harlem_shaker). Song: "Harlem Shake" by Baauer.
