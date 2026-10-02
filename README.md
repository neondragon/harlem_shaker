# harlem_shaker

The 2013 Harlem Shake bookmarklet, brought back to life.

Moovweb's original bookmarklet pulled its song and stylesheet from an S3 bucket that no longer exists, so it's been dead everywhere for years. Even if the bucket came back, strict Content Security Policies (Wikipedia's, for one) would block loading assets from S3. This version is fully self-contained: the CSS and the audio are inlined into the bookmarklet itself, so it needs no network access at runtime and survives sites that allow inline styles and `data:` media.

## Install

Visit the install page (GitHub Pages) and drag the button to your bookmarks bar. Then open any page and click it.

## How it's built

The repo holds readable sources: the unminified script and the CSS, which is Moovweb's original stylesheet (a modified Animate.css). A small build step re-encodes the audio, inlines it and the CSS, minifies the result into a `javascript:` URL, and renders the install page. The audio is a local build input and isn't committed as a file; it only exists inlined in the built output.

## Credits

Original bookmarklet and stylesheet by [Moovweb](https://github.com/moovweb/harlem_shaker). Song: "Harlem Shake" by Baauer.
