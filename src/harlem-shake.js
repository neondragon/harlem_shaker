// Moovweb's harlem-shake-script.js, made self-contained.
//
// The build replaces the CSS and AUDIO placeholders with the minified
// stylesheet and the base64 mp3, so the bookmarklet makes no network
// requests. Audio plays through Web Audio rather than an <audio> element,
// so a page's media-src CSP never applies.
//
// Changes from Moovweb's version:
// - the "no node found" guard checked the loop variable instead of
//   firstNode, so it never fired
// - classes are toggled with classList (className is read-only on SVG)
// - a second click while it's running is ignored
(function () {
  var MIN_HEIGHT = 30;
  var MIN_WIDTH = 30;
  var MAX_HEIGHT = 350;
  var MAX_WIDTH = 350;

  var CSS = "__CSS__";
  var AUDIO = "__AUDIO__";

  // Song timeline, in seconds.
  var FIRST_AT = 0.5;
  var EVERYONE_AT = 15.5;
  var SLOWMO_AT = 28.4;

  var CSS_BASE_CLASS = "mw-harlem_shake_me";
  var CSS_SLOW_CLASS = "mw-harlem_shake_slow";
  var CSS_FIRST_CLASS = "im_first";
  var CSS_OTHER_CLASSES = ["im_drunk", "im_baked", "im_trippin", "im_blown"];
  var CSS_STROBE_CLASS = "mw-strobe_light";
  var STYLE_ID = "mw-harlem_shake_style";

  if (document.getElementById(STYLE_ID)) {
    return;
  }

  function addCSS() {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.body).appendChild(style);
  }

  function removeCSS() {
    var style = document.getElementById(STYLE_ID);
    if (style) {
      style.parentNode.removeChild(style);
    }
  }

  function flashScreen() {
    var flash = document.createElement("div");
    flash.className = CSS_STROBE_CLASS;
    document.body.appendChild(flash);
    setTimeout(function () {
      document.body.removeChild(flash);
    }, 100);
  }

  function withinBounds(node) {
    var h = node.offsetHeight;
    var w = node.offsetWidth;
    return h > MIN_HEIGHT && h < MAX_HEIGHT && w > MIN_WIDTH && w < MAX_WIDTH;
  }

  function posY(node) {
    var top = 0;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  var viewTop = window.pageYOffset || document.documentElement.scrollTop;
  var viewBottom = viewTop + window.innerHeight;

  function isVisible(node) {
    var y = posY(node);
    return y >= viewTop && y <= viewBottom;
  }

  function shakeFirst(node) {
    node.classList.add(CSS_BASE_CLASS, CSS_FIRST_CLASS);
  }

  function shakeOther(node) {
    var other = CSS_OTHER_CLASSES[Math.floor(Math.random() * CSS_OTHER_CLASSES.length)];
    node.classList.add(CSS_BASE_CLASS, other);
  }

  function shaking() {
    return Array.prototype.slice.call(document.querySelectorAll("." + CSS_BASE_CLASS));
  }

  function shakeSlowAll() {
    shaking().forEach(function (node) {
      node.classList.replace(CSS_BASE_CLASS, CSS_SLOW_CLASS);
    });
  }

  function stopShakeAll() {
    var all = document.querySelectorAll("." + CSS_BASE_CLASS + ", ." + CSS_SLOW_CLASS);
    var classes = [CSS_BASE_CLASS, CSS_SLOW_CLASS, CSS_FIRST_CLASS].concat(CSS_OTHER_CLASSES);
    Array.prototype.forEach.call(all, function (node) {
      node.classList.remove.apply(node.classList, classes);
    });
  }

  function decodeAudio() {
    var bin = atob(AUDIO);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function playSong() {
    // Create the context synchronously, inside the click, so autoplay
    // policy lets it start.
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.decodeAudioData(decodeAudio()).then(function (buffer) {
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      var timers = [
        setTimeout(function () {
          shakeFirst(firstNode);
        }, FIRST_AT * 1000),
        setTimeout(function () {
          stopShakeAll();
          flashScreen();
          allShakeableNodes.forEach(shakeOther);
        }, EVERYONE_AT * 1000),
        setTimeout(shakeSlowAll, SLOWMO_AT * 1000)
      ];

      src.onended = function () {
        timers.forEach(clearTimeout);
        stopShakeAll();
        removeCSS();
        ctx.close();
      };
      src.start();
    }).catch(function (err) {
      console.warn("Harlem Shake: couldn't play the song.", err);
      removeCSS();
      ctx.close();
    });
  }

  // First visible node of the right size.
  var allNodes = document.getElementsByTagName("*");
  var firstNode = null;
  var i;
  for (i = 0; i < allNodes.length; i++) {
    if (withinBounds(allNodes[i]) && isVisible(allNodes[i])) {
      firstNode = allNodes[i];
      break;
    }
  }

  if (firstNode === null) {
    console.warn("Could not find a node of the right size. Please try a different page.");
    return;
  }

  addCSS();
  playSong();

  var allShakeableNodes = [];
  for (i = 0; i < allNodes.length; i++) {
    if (withinBounds(allNodes[i])) {
      allShakeableNodes.push(allNodes[i]);
    }
  }
})();
