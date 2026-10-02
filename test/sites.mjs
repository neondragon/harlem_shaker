// Runs the harness build (build/harness.js) against real sites in headless
// Chrome and records what it does: the first dancer (outlined), the end of
// its build-up spotlight, and a frame just after the drop. Output goes to
// build/sites/.
//
//   npm run build && node test/sites.mjs [name ...]
//
// Sites that put up bot checks for headless Chrome (Reddit) have to be
// tested by hand; see test/probe.js.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SITES = {
  wikipedia: "https://en.wikipedia.org/wiki/Harlem_Shake_(meme)",
  hn: "https://news.ycombinator.com/",
  github: "https://github.com/moovweb/harlem_shaker",
  youtube: "https://www.youtube.com/watch?v=8vJiSSAMNWw",
  bbc: "https://www.bbc.co.uk/news",
  nytimes: "https://www.nytimes.com/",
  amazon: "https://www.amazon.com/",
  stackoverflow: "https://stackoverflow.com/questions",
  apple: "https://www.apple.com/",
  verge: "https://www.theverge.com/",
  x: "https://x.com/",
  twitch: "https://www.twitch.tv/",
};

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const OUT = "build/sites";
const WIDTH = 1280;
const HEIGHT = 800;

const harness = readFileSync("build/harness.js", "utf8");
const only = process.argv.slice(2);
const sites = Object.entries(SITES).filter(([name]) => !only.length || only.includes(name));
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=build/chrome-profile",
  `--window-size=${WIDTH},${HEIGHT}`,
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      return { ws: v.webSocketDebuggerUrl, ua: v["User-Agent"].replace("HeadlessChrome", "Chrome") };
    } catch {
      await sleep(200);
    }
  }
  throw new Error("chrome didn't start");
}

const { ws: wsUrl, ua } = await connect();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const pending = new Map();
const listeners = new Set();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else {
    listeners.forEach((fn) => fn(msg));
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function evaluate(session, expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function screenshot(session, file) {
  const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 }, session);
  writeFileSync(file, Buffer.from(data, "base64"));
}

// Describes an element for the report.
const DESCRIBE = `(el) => {
  const r = el.getBoundingClientRect();
  const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\\s+/).slice(0, 2).join(".");
  const label = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 30);
  return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls ? "." + cls : "") +
    " " + Math.round(r.width) + "x" + Math.round(r.height) + "@" + Math.round(r.left) + "," + Math.round(r.top) +
    (el.getRootNode() !== document ? " (shadow)" : "") + ' "' + label + '"';
}`;

const report = {};
for (const [name, url] of sites) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
  try {
    await send("Page.enable", {}, s);
    await send("Network.setUserAgentOverride", { userAgent: ua }, s);
    await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, s);
    const loaded = new Promise((r) => {
      const fn = (m) => { if (m.sessionId === s && m.method === "Page.loadEventFired") { listeners.delete(fn); r(); } };
      listeners.add(fn);
    });
    await send("Page.navigate", { url }, s);
    await Promise.race([loaded, sleep(20000)]);
    await sleep(3000);

    const t0 = Date.now();
    await evaluate(s, harness);
    const pick = await evaluate(s, `(() => {
      const d = ${DESCRIBE};
      if (!window.__HS) return null;
      const r = __HS.first.getBoundingClientRect();
      const box = document.createElement("div");
      Object.assign(box.style, { position: "fixed", left: r.left - 4 + "px", top: r.top - 4 + "px", width: r.width + 8 + "px",
        height: r.height + 8 + "px", outline: "4px solid magenta", zIndex: 2147483647, pointerEvents: "none" });
      box.id = "__hs_box";
      document.documentElement.appendChild(box);
      return d(__HS.first);
    })()`);
    const pickMs = Date.now() - t0;
    await screenshot(s, `${OUT}/${name}-1-pick.jpg`);
    let drop = null;
    if (pick) {
      await evaluate(s, `document.getElementById("__hs_box").remove(); __HS.solo(); __HS.seek(14900)`);
      await sleep(100);
      await screenshot(s, `${OUT}/${name}-2-spot.jpg`);
      await evaluate(s, "__HS.lineUp()");
      drop = await evaluate(s, `(() => {
        const d = ${DESCRIBE};
        const t = performance.now();
        const dancers = __HS.drop();
        const ms = Math.round(performance.now() - t);
        const inView = dancers.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
        return { ms, dancers: dancers.length, inView: inView.length,
          shadow: dancers.filter((el) => el.getRootNode() !== document).length,
          biggest: dancers.map((el) => [el, el.getBoundingClientRect()]).sort((a, b) => b[1].width * b[1].height - a[1].width * a[1].height)
            .slice(0, 3).map(([el]) => d(el)) };
      })()`);
      await sleep(150);
      await screenshot(s, `${OUT}/${name}-3-drop.jpg`);
      await evaluate(s, "__HS.end()");
    }
    // Nothing picked: say what the most logo-like element looked like.
    const diag = pick ? undefined : await evaluate(s, `(() => {
      const el = document.querySelector("[id*=logo i], [class*=logo i]");
      if (!el) return "no [id|class*=logo]";
      const r = el.getBoundingClientRect(), st = getComputedStyle(el);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { el: (${DESCRIBE})(el), display: st.display, visibility: st.visibility, opacity: st.opacity,
        checkVisibility: el.checkVisibility && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        hit: hit && (${DESCRIBE})(hit), harness: typeof window.__HS, flag: window.__harlemShake };
    })()`);
    report[name] = { url, title: await evaluate(s, "document.title.slice(0, 60)"), pick, pickMs, drop, diag };
  } catch (err) {
    report[name] = { url, error: String(err.message || err) };
  } finally {
    await send("Target.closeTarget", { targetId });
  }
  console.log(name, JSON.stringify(report[name]));
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
ws.close();
chrome.kill();
