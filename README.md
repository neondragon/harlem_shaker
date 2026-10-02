# harlem_shaker

The 2013 Harlem Shake bookmarklet, brought back to life.

Moovweb's original bookmarklet pulled its song and stylesheet from an S3 bucket that no longer exists, so it's been dead everywhere for years. Even if the bucket came back, many sites' Content Security Policies would block loading assets from S3. This version is fully self-contained: the song is inlined and played through Web Audio, and the dancing runs on the Web Animations API, so it makes no network requests and injects no stylesheet.

It's also tuned for modern sites. The site's logo leads the dance: it moves to the middle of the screen and grows through the build-up, then snaps back when the drop hits. It reaches into shadow DOM (new Reddit is built from it), skips elements that can't visibly move, and leaves big page containers alone so the page dances instead of jittering.

## Install

Visit the install page (GitHub Pages) and drag the button to your bookmarks bar. Then open any page and click it.

## How it's built

The script lives in `src/harlem-shake.js`, readable and unminified; the moves are Moovweb's, from Animate.css. `npm run build` needs Node and ffmpeg. It fetches the song from [Moovweb's repo](https://github.com/moovweb/harlem_shaker) into `audio/` (gitignored), re-encodes it to 48 kbps mono, inlines it into the script, minifies it into a `javascript:` URL, and writes the install page to `docs/index.html`.

```sh
npm install
npm run build
```

This repo never hosts the mp3 as a file. It exists only as base64 inside the built page, which is committed so GitHub Pages can serve it from `docs/` on `main`.

## Testing on real sites

The build also writes `build/harness.js`: the same script without the song, exposing each step of the timeline. `node test/sites.mjs [site ...]` runs it against a list of popular sites in headless Chrome and saves what it picked and frames of the build-up and the drop to `build/sites/`. Sites that challenge headless browsers (Reddit, Google) need a real browser; `test/probe.js` is a console snippet that reports what the script sees on any page.

## Credits

Original bookmarklet and stylesheet by [Moovweb](https://github.com/moovweb/harlem_shaker). Song: "Harlem Shake" by Baauer.
