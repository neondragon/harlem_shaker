// Moovweb's harlem-shake-script.js, rebuilt to be self-contained and to
// behave on modern sites.
//
// The build replaces AUDIO with the base64 mp3, so the bookmarklet makes no
// network requests. The song plays through Web Audio, so a page's media-src
// CSP never applies, and the dancing is done with the Web Animations API
// rather than an injected stylesheet, so style-src doesn't either. That also
// reaches elements inside shadow DOM, which a stylesheet can't.
//
// Every animation is composited onto the element's own transform rather
// than replacing it, so nothing jumps out of place.
//
// The moves are Moovweb's, which came from Animate.css
// (http://daneden.me/animate), scaled down for big elements.
//
// HS_TEST is defined by the build: false for the bookmarklet, true for the
// test harness, which skips the song and exposes the timeline steps.
(function () {
  var AUDIO = "__AUDIO__";

  // Song timeline, in seconds.
  var FIRST_AT = 0.5;
  var EVERYONE_AT = 15.5;
  var SLOWMO_AT = 28.4;
  var SLOWMO_RATE = 0.25;
  var LINE_UP_AHEAD = 1;

  var BEAT_MS = 400;
  var FLASH_MS = 100;

  // Dancers. Sizes are in px; fractions are of the viewport. Media (images,
  // video) can be much bigger than containers: a container dancing drags its
  // contents with it, which looks like the page jittering rather than a party.
  var MIN_SIDE = 16;
  var MIN_AREA = 900;
  var MAX_WIDTH = 0.95;
  var MAX_HEIGHT = 0.8;
  var MAX_AREA = 0.25;
  var MAX_MEDIA_HEIGHT = 1.2;
  var MAX_MEDIA_AREA = 1;
  var NEAR_VIEW = 0.5;
  var MAX_DANCERS = 400;

  // The first dancer: ideally the site's logo, somewhere near the top.
  var FIRST_MIN_SIDE = 16;
  var FIRST_MAX_WIDTH = 0.5;
  var FIRST_MAX_HEIGHT = 0.3;
  var TOP_BAND = 0.45;
  // Where site headers usually are; a logo-ish thing here scores higher.
  var HEADER_BAND = 0.15;
  // With no logo, the first visible dancer this small or smaller.
  var FALLBACK_MAX_AREA = 0.05;

  // During the build-up the first dancer slowly swells to this scale (no
  // wider than the viewport), drifting this fraction of the way toward the
  // centre: growth draws the eye to a small logo, the drift keeps a corner
  // logo on screen.
  var SPOT_SCALE = 2;
  var SPOT_MAX_WIDTH = 1;
  var SPOT_DRIFT = 0.25;

  if (window.__harlemShake) {
    return;
  }

  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var animations = [];
  var timers = [];
  var spotlit = null;

  // --- Finding elements ----------------------------------------------------

  // Every element in the document, including inside open shadow roots, in
  // document order.
  function allElements() {
    var out = [];
    (function walk(root) {
      var els = root.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        out.push(els[i]);
        if (els[i].shadowRoot) {
          walk(els[i].shadowRoot);
        }
      }
    })(document);
    return out;
  }

  function parentOf(el) {
    if (el.parentElement) {
      return el.parentElement;
    }
    var root = el.getRootNode();
    return root && root.host ? root.host : null;
  }

  var MEDIA = /^(IMG|SVG|VIDEO|CANVAS|IFRAME|PICTURE|OBJECT|EMBED)$/i;
  // Transforms don't apply to non-replaced inline boxes, and SVG internals
  // don't lay out like boxes.
  var REPLACED = /^(IMG|SVG|VIDEO|CANVAS|IFRAME|INPUT|SELECT|TEXTAREA|BUTTON|OBJECT|EMBED)$/i;
  function canMove(el, style) {
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) {
      return false;
    }
    var display = style.display;
    if (display === "none" || display === "contents") {
      return false;
    }
    return display !== "inline" || REPLACED.test(el.tagName);
  }

  function isShown(el, style) {
    if (style.visibility !== "visible" || +style.opacity === 0) {
      return false;
    }
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  }

  // Whether the element is what you'd actually see at its centre, rather
  // than something hidden under a header or a modal.
  function onTop(el, rect) {
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) {
      return false;
    }
    var hit = document.elementFromPoint(x, y);
    // Descend through shadow roots to the innermost hit.
    while (hit && hit.shadowRoot) {
      var inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) {
        break;
      }
      hit = inner;
    }
    for (var n = hit; n; n = parentOf(n)) {
      if (n === el) {
        return true;
      }
    }
    return false;
  }

  function sameBox(a, b) {
    return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 &&
      Math.abs(a.width - b.width) < 3 && Math.abs(a.height - b.height) < 3;
  }

  function danceable(el, r) {
    var w = r.width;
    var h = r.height;
    if (w < MIN_SIDE || h < MIN_SIDE || w * h < MIN_AREA || w > vw * MAX_WIDTH) {
      return false;
    }
    if (MEDIA.test(el.tagName)) {
      return h <= vh * MAX_MEDIA_HEIGHT && w * h <= vw * vh * MAX_MEDIA_AREA;
    }
    return h <= vh * MAX_HEIGHT && w * h <= vw * vh * MAX_AREA;
  }

  // Everything that dances when the drop hits. Wrappers that share a box with
  // an ancestor dancer are skipped, so a link wrapped in four spans moves
  // once rather than four times over.
  function findDancers() {
    var els = allElements();
    var dancers = [];
    var rects = new Map();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (!danceable(el, r) || (spotlit && spotlit.contains(el))) {
        continue;
      }
      if (r.bottom < -vh * NEAR_VIEW || r.top > vh * (1 + NEAR_VIEW) || r.right < 0 || r.left > vw) {
        continue;
      }
      var style = getComputedStyle(el);
      if (!canMove(el, style) || !isShown(el, style)) {
        continue;
      }
      var dup = false;
      for (var p = parentOf(el), depth = 0; p && depth < 6; p = parentOf(p), depth++) {
        if (rects.has(p)) {
          dup = sameBox(rects.get(p), r);
          break;
        }
      }
      if (dup) {
        continue;
      }
      rects.set(el, r);
      dancers.push(el);
    }
    if (dancers.length > MAX_DANCERS) {
      // Keep the ones in view first.
      dancers.sort(function (a, b) {
        return Math.abs(rects.get(a).top) - Math.abs(rects.get(b).top);
      });
      dancers.length = MAX_DANCERS;
    }
    return dancers;
  }

  function describe(el) {
    return [el.id, typeof el.className === "string" ? el.className : "",
      el.getAttribute("aria-label"), el.getAttribute("alt"), el.getAttribute("title")].join(" ").toLowerCase();
  }

  // How much this looks like the site's logo: the one guy in the helmet who
  // dances alone before the drop.
  function logoScore(el, r) {
    var score = 0;
    var text = describe(el);
    if (/logo/i.test(el.id)) {
      score += 4;
    } else if (/logo/.test(text)) {
      score += 3;
    } else if (/brand/.test(text)) {
      score += 2;
    }
    if (r.top < vh * HEADER_BAND) {
      score += 1;
    }
    if (el.tagName === "A" && el.host === location.host && el.pathname === "/") {
      score += 2;
    }
    if (/\bhome\b/.test(text)) {
      score += 1;
    }
    if (r.left < vw / 2) {
      score += 1;
    }
    if (score >= 2 && (/^(IMG|SVG)$/i.test(el.tagName) || el.querySelector("img, svg"))) {
      score += 1;
    }
    return score;
  }

  // An inline logo link can't be transformed; its image usually can.
  function movable(el, style) {
    if (canMove(el, style)) {
      return el;
    }
    var inner = el.querySelector("img, svg");
    return inner && canMove(inner, getComputedStyle(inner)) ? inner : null;
  }

  // The site's logo if we can find one near the top, else the first visible
  // dancer in reading order. If a cookie or consent dialog covers the whole
  // page, nothing is "on top", so look again without that check: the
  // spotlight floats above the dialog anyway.
  function findFirst() {
    return findFirstWhere(true) || findFirstWhere(false);
  }

  function findFirstWhere(mustBeOnTop) {
    var els = allElements();
    var best = null;
    var bestScore = 2;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (r.top > vh * TOP_BAND || r.bottom < 0 || r.width < FIRST_MIN_SIDE || r.height < FIRST_MIN_SIDE ||
          r.width > vw * FIRST_MAX_WIDTH || r.height > vh * FIRST_MAX_HEIGHT) {
        continue;
      }
      var score = logoScore(el, r);
      if (score <= bestScore) {
        continue;
      }
      var style = getComputedStyle(el);
      if (!isShown(el, style) || (mustBeOnTop && !onTop(el, r))) {
        continue;
      }
      var mover = movable(el, style);
      if (mover) {
        best = mover;
        bestScore = score;
      }
    }
    if (best) {
      return best;
    }
    var dancers = findDancers().filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.width * r.height <= vw * vh * FALLBACK_MAX_AREA && r.top >= 0 && r.top < vh &&
        (!mustBeOnTop || onTop(el, r));
    });
    dancers.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return Math.round(ra.top / 50) - Math.round(rb.top / 50) || ra.left - rb.left;
    });
    return dancers[0] || null;
  }

  // --- Moves ---------------------------------------------------------------

  // The element's box and transform origin, in viewport px.
  function geometry(el) {
    var r = el.getBoundingClientRect();
    var origin = getComputedStyle(el).transformOrigin.split(" ").map(parseFloat);
    return { r: r, ox: origin[0] || 0, oy: origin[1] || 0 };
  }

  function px(x, y) {
    return "translate(" + x + "px, " + y + "px)";
  }

  // Big elements move less, so a whole card doesn't swing off the screen.
  function damp(r) {
    return Math.min(1, 250 / Math.max(r.width, r.height));
  }

  // Each move returns transform keyframes, and optionally opacity keyframes.
  // Transforms apply about the element's own transform-origin, so swing
  // pivots on its top centre by translating there and back.
  var MOVES = {
    wobble: function (g) {
      var x = Math.min(0.15 * g.r.width, 45);
      var k = damp(g.r);
      return { transform: [[0, 0], [-1, -5], [0.8, 3], [-0.6, -3], [0.4, 2], [-0.2, -1], [0, 0]].map(function (s, i, all) {
        return { offset: i / (all.length - 1), transform: px(s[0] * x, 0) + " rotate(" + s[1] * k + "deg)" };
      }) };
    },
    swing: function (g) {
      var k = damp(g.r);
      var dx = g.r.width / 2 - g.ox;
      var dy = -g.oy;
      return { transform: [0, 15, -10, 5, -5, 0].map(function (deg, i) {
        return { offset: i / 5, transform: px(dx, dy) + " rotate(" + deg * k + "deg) " + px(-dx, -dy) };
      }) };
    },
    shake: function () {
      return { transform: [0, -10, 10, -10, 10, -10, 10, -10, 10, -10, 0].map(function (x, i) {
        return { offset: i / 10, transform: px(x, 0) };
      }) };
    },
    bounceIn: function (g) {
      var k = damp(g.r);
      return {
        transform: [
          { offset: 0, transform: "scale(" + (1 - 0.7 * k) + ")" },
          { offset: 0.5, transform: "scale(" + (1 + 0.05 * k) + ")" },
          { offset: 0.7, transform: "scale(" + (1 - 0.1 * k) + ")" },
          { offset: 1, transform: "scale(1)" }
        ],
        opacity: [{ offset: 0, opacity: 0 }, { offset: 0.5, opacity: 1 }, { offset: 1, opacity: 1 }]
      };
    },
    pulse: function (g) {
      var s = 1 + 0.1 * damp(g.r);
      return { transform: [
        { offset: 0, transform: "scale(1)" },
        { offset: 0.5, transform: "scale(" + s + ")" },
        { offset: 1, transform: "scale(1)" }
      ] };
    }
  };
  var PARTY_MOVES = ["swing", "shake", "bounceIn", "pulse"];

  function play(el, keyframes, options) {
    try {
      var a = el.animate(keyframes, options);
      animations.push(a);
      return a;
    } catch (e) {
      // Element went away, or the browser can't composite; skip it.
      return null;
    }
  }

  function dance(el, move) {
    var frames = MOVES[move](geometry(el));
    // Add to whatever transform the element already has.
    play(el, frames.transform, { duration: BEAT_MS, iterations: Infinity, composite: "add" });
    if (frames.opacity) {
      play(el, frames.opacity, { duration: BEAT_MS, iterations: Infinity });
    }
  }

  // Copy computed styles onto a clone, element by element, so it looks the
  // same outside the page's stylesheets and shadow roots.
  function bakeStyles(from, to) {
    var cs = getComputedStyle(from);
    for (var i = 0; i < cs.length; i++) {
      to.style.setProperty(cs[i], cs.getPropertyValue(cs[i]));
    }
    to.style.animation = "none";
    to.style.transition = "none";
    for (var c = 0; c < from.children.length && c < to.children.length; c++) {
      bakeStyles(from.children[c], to.children[c]);
    }
  }

  // The colour actually behind an element: its own background, or the first
  // ancestor's that isn't transparent.
  function backdrop(el) {
    for (var n = el; n; n = parentOf(n)) {
      var bg = getComputedStyle(n).backgroundColor;
      var alpha = bg.match(/[\d.]+(?=\)$)/);
      if (bg !== "transparent" && !(/^rgba/.test(bg) && alpha && +alpha[0] === 0)) {
        return bg;
      }
    }
    return "white";
  }

  // During the build-up the first dancer swells in place. A clone in a fixed
  // layer does the dancing, so the page's stacking and overflow can't bury
  // or clip it; the original fades out meanwhile and is back in place for
  // the drop.
  function spotlight(el) {
    var r = el.getBoundingClientRect();
    var s = Math.max(1, Math.min(SPOT_SCALE, vw * SPOT_MAX_WIDTH / r.width));
    var halo = Math.max(4, r.height * 0.25);
    var clone = el.cloneNode(true);
    var bg = backdrop(el);
    bakeStyles(el, clone);
    // Bring the header's background along, so a white logo stays visible
    // over whatever ends up behind it.
    Object.assign(clone.style, {
      backgroundColor: bg,
      boxShadow: "0 0 0 " + halo + "px " + bg,
      borderRadius: halo + "px"
    });
    Object.assign(clone.style, {
      position: "fixed",
      left: r.left + "px",
      top: r.top + "px",
      width: r.width + "px",
      height: r.height + "px",
      margin: "0",
      boxSizing: "border-box",
      transform: "none",
      transformOrigin: "center",
      zIndex: "2147483647",
      pointerEvents: "none"
    });
    clone.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(clone);
    spotlit = clone;

    play(el, [{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: "forwards" });
    // Drift toward the centre, then keep the grown box (and its halo) on
    // screen.
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var margin = halo * s + 8;
    function clamp(c, size, view) {
      var half = size * s / 2 + margin;
      return half * 2 >= view ? view / 2 : Math.min(Math.max(c, half), view - half);
    }
    var dx = clamp(cx + (vw / 2 - cx) * SPOT_DRIFT, r.width, vw) - cx;
    var dy = clamp(cy + (vh / 2 - cy) * SPOT_DRIFT, r.height, vh) - cy;
    play(clone, [
      { transform: px(0, 0) + " scale(1)" },
      { transform: px(dx, dy) + " scale(" + s + ")" }
    ], { duration: (EVERYONE_AT - FIRST_AT) * 1000, easing: "ease-in-out", fill: "forwards" });
    dance(clone, "wobble");
  }

  function stopAll() {
    animations.forEach(function (a) {
      a.cancel();
    });
    animations = [];
    if (spotlit) {
      spotlit.remove();
      spotlit = null;
    }
  }

  function flashScreen() {
    var flash = document.createElement("div");
    // CSSOM, not a style attribute, so style-src CSP doesn't apply.
    Object.assign(flash.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(250, 250, 250, 0.8)",
      pointerEvents: "none"
    });
    document.documentElement.appendChild(flash);
    setTimeout(function () {
      flash.remove();
    }, FLASH_MS);
  }

  // --- Timeline ------------------------------------------------------------

  var firstNode;
  var dancers = null;

  function soloStep() {
    spotlight(firstNode);
  }

  // Finding dancers can take a couple of hundred ms on a heavy page, so do it
  // just before the drop rather than on it.
  function lineUpStep() {
    dancers = findDancers();
  }

  // Everyone in, and the first dancer snaps back to its place to join them.
  function dropStep() {
    var party = dancers || findDancers();
    stopAll();
    flashScreen();
    if (party.indexOf(firstNode) < 0) {
      party.push(firstNode);
    }
    party.forEach(function (el) {
      dance(el, PARTY_MOVES[Math.floor(Math.random() * PARTY_MOVES.length)]);
    });
    return party;
  }

  function slowmoStep() {
    animations.forEach(function (a) {
      a.playbackRate = SLOWMO_RATE;
    });
  }

  function endStep() {
    timers.forEach(clearTimeout);
    stopAll();
    window.__harlemShake = false;
  }

  firstNode = findFirst();
  if (!firstNode) {
    console.warn("Harlem Shake: nothing on this page to shake. Try a different page.");
    return;
  }
  window.__harlemShake = true;

  if (HS_TEST) {
    window.__HS = {
      first: firstNode,
      solo: soloStep,
      lineUp: lineUpStep,
      drop: dropStep,
      slowmo: slowmoStep,
      end: endStep,
      findDancers: findDancers,
      // Jump every running animation to this many ms in.
      seek: function (ms) {
        animations.forEach(function (a) {
          a.currentTime = ms;
        });
      }
    };
    return;
  }

  function decodeAudio() {
    var bin = atob(AUDIO);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Create the context synchronously, inside the click, so autoplay policy
  // lets it start.
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.decodeAudioData(decodeAudio()).then(function (buffer) {
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    timers = [
      setTimeout(soloStep, FIRST_AT * 1000),
      setTimeout(lineUpStep, (EVERYONE_AT - LINE_UP_AHEAD) * 1000),
      setTimeout(dropStep, EVERYONE_AT * 1000),
      setTimeout(slowmoStep, SLOWMO_AT * 1000)
    ];
    src.onended = function () {
      endStep();
      ctx.close();
    };
    src.start();
  }).catch(function (err) {
    console.warn("Harlem Shake: couldn't play the song.", err);
    window.__harlemShake = false;
    ctx.close();
  });
})();
