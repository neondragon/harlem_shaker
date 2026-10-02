// Diagnostic probe: paste into a page's DevTools console. Reports what the
// bookmarklet's element selection sees on this page, and copies it to the
// clipboard (copy() is a DevTools console helper).
(() => {
  const ok = (n, min = 30, max = 350) => {
    const h = n.offsetHeight, w = n.offsetWidth;
    return h > min && h < max && w > min && w < max;
  };
  const desc = (e) => {
    const r = e.getBoundingClientRect();
    const cls = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).slice(0, 3).join(".");
    const txt = (e.innerText || e.getAttribute("aria-label") || e.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 30);
    const path = [];
    for (let p = e; p && path.length < 4; p = p.parentElement || (p.getRootNode() !== document && p.getRootNode().host)) {
      path.push(p.tagName.toLowerCase() + (p.id ? "#" + p.id : ""));
    }
    return `${path.reverse().join(">")}${cls ? " ." + cls : ""} ${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)} ${getComputedStyle(e).display} "${txt}"`;
  };
  const light = [...document.getElementsByTagName("*")];
  const all = [];
  let shadowRoots = 0;
  (function walk(root) {
    for (const e of root.querySelectorAll("*")) {
      all.push(e);
      if (e.shadowRoot) { shadowRoots++; walk(e.shadowRoot); }
    }
  })(document);
  const inView = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const posY = (e) => { let t = 0; while (e) { t += e.offsetTop; e = e.offsetParent; } return t; };
  const current = light.filter((e) => ok(e)).find((e) => { const y = posY(e); return y >= scrollY && y <= innerHeight + scrollY; });
  // Everything visible in the top 120px, including shadow DOM: logo hunting.
  const top = all.filter((e) => {
    if (!inView(e)) return false;
    const r = e.getBoundingClientRect();
    return r.top < 120 && r.width >= 16 && r.height >= 16 && r.width < 400 && r.height < 200;
  }).slice(0, 40).map(desc);
  const report = {
    url: location.href.slice(0, 100),
    viewport: `${innerWidth}x${innerHeight}`,
    elements: { light: light.length, withShadow: all.length, shadowRoots },
    candidates: {
      light: light.filter((e) => ok(e)).length,
      lightInView: light.filter((e) => ok(e) && inView(e)).length,
      lightInline: light.filter((e) => ok(e) && getComputedStyle(e).display === "inline").length,
      withShadowInView: all.filter((e) => ok(e) && inView(e)).length,
    },
    currentFirstPick: current ? desc(current) : null,
    topBand: top,
  };
  const json = JSON.stringify(report, null, 1);
  try { copy(json); console.log("copied to clipboard"); } catch (e) { /* not in DevTools */ }
  return report;
})();
