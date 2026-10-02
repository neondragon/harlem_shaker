// Builds docs/index.html, the install page with the bookmarklet inlined.
//
// Needs ffmpeg. The song comes from Moovweb's repo and is cached at
// audio/harlem-shake.mp3 (gitignored). This repo never hosts the mp3: it
// only ships as base64 inside the page.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { transform } from "esbuild";

const SONG = "audio/harlem-shake.mp3";
const SONG_URL = "https://cdn.jsdelivr.net/gh/moovweb/harlem_shaker@master/harlem-shake.mp3";
const ENCODED = "build/harlem-shake.mono48k.mp3";

mkdirSync("audio", { recursive: true });
mkdirSync("build", { recursive: true });
mkdirSync("docs", { recursive: true });

if (!existsSync(SONG)) {
  console.log(`fetching ${SONG_URL}`);
  const res = await fetch(SONG_URL);
  if (!res.ok) throw new Error(`${SONG_URL}: HTTP ${res.status}`);
  writeFileSync(SONG, Buffer.from(await res.arrayBuffer()));
}

// Mono, 48 kbps, no ID3 tags: plenty for a 31 s meme clip.
execFileSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", SONG,
  "-ac", "1", "-b:a", "48k",
  "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "0",
  ENCODED,
]);
const audio = readFileSync(ENCODED).toString("base64");

const css = (await transform(readFileSync("src/harlem-shake.css", "utf8"), {
  loader: "css",
  minify: true,
})).code.trim();

const source = readFileSync("src/harlem-shake.js", "utf8");
for (const placeholder of ['"__CSS__"', '"__AUDIO__"']) {
  if (!source.includes(placeholder)) throw new Error(`src/harlem-shake.js lacks ${placeholder}`);
}
const js = (await transform(
  source
    .replace('"__CSS__"', () => JSON.stringify(css))
    .replace('"__AUDIO__"', () => JSON.stringify(audio)),
  { loader: "js", minify: true, target: "es2017" },
)).code.trim();

// Browsers percent-decode javascript: URLs before running them, so a
// literal % (all over the CSS keyframes) has to be escaped.
const bookmarklet = "javascript:" + js.replace(/%/g, "%25");

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const kb = (n) => `${Math.round(n / 1024)} KB`;

const page = readFileSync("src/install.html", "utf8")
  .replace("{{BOOKMARKLET}}", () => escapeAttr(bookmarklet))
  .replace("{{SIZE}}", () => kb(bookmarklet.length));
writeFileSync("docs/index.html", page);

console.log(`audio ${kb(audio.length)} base64, script ${kb(js.length - audio.length)}, bookmarklet ${kb(bookmarklet.length)}`);
console.log("wrote docs/index.html");
