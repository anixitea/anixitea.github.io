// The Sea Glass switch. Turning it on sets <html data-look="sea"> (sea.css
// does the rest), swaps each picture for its Sea Glass screenshot, and
// remembers the choice. Where the browser can, the new look spreads out from
// the switch in a circle, as if the page were turning to paper.
//
// ?look=sea (or ?look=original) in the address picks a look for a link.
(() => {
  const root = document.documentElement;
  const toggle = document.querySelector(".look-switch");
  if (!toggle) return;
  const meta = document.querySelector('meta[name="theme-color"]');
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const FONT = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap";
  const pictures = [...document.querySelectorAll("img[data-sea]")];
  pictures.forEach((img) => {
    img.dataset.original = img.getAttribute("src");
    img.dataset.originalAlt = img.getAttribute("alt") || "";
  });

  const isSea = () => root.dataset.look === "sea";

  // Fetch what Sea Glass needs ahead of the first switch: the serif and the
  // screenshots, so the circle opens on a finished page.
  let primed = false;
  function prime() {
    if (primed) return;
    primed = true;
    if (!document.querySelector("link[data-sea-font]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT;
      link.dataset.seaFont = "";
      document.head.appendChild(link);
    }
    new Set(pictures.map((img) => img.dataset.sea)).forEach((src) => { new Image().src = src; });
    document.querySelectorAll("img.pebble").forEach((img) => { img.loading = "eager"; });
  }

  function paint(sea) {
    if (sea) root.dataset.look = "sea";
    else delete root.dataset.look;
    pictures.forEach((img) => {
      const src = sea ? img.dataset.sea : img.dataset.original;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      if (img.dataset.seaAlt) img.setAttribute("alt", sea ? img.dataset.seaAlt : img.dataset.originalAlt);
    });
    toggle.setAttribute("aria-checked", String(sea));
    if (meta) meta.content = sea ? "#f4f5f0" : "#0e0d11";
    dispatchEvent(new Event("glasscast:look"));
  }

  function remember(sea) {
    try { localStorage.setItem("glasscast-look", sea ? "sea" : "original"); } catch (e) { /* private window: just this visit */ }
  }

  // Wait (briefly) for the pictures on screen and the serif, so the new
  // page is whole when the circle opens.
  function settled() {
    const onScreen = pictures.filter((img) => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
    const waits = onScreen.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    if (isSea() && document.fonts) waits.push(document.fonts.load('400 48px "Newsreader"').catch(() => {}));
    return Promise.race([Promise.all(waits), new Promise((done) => setTimeout(done, 500))]);
  }

  function flip() {
    const sea = !isSea();
    if (sea) prime();
    remember(sea);
    if (!document.startViewTransition || reduce.matches) {
      paint(sea);
      return;
    }
    const r = toggle.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const change = document.startViewTransition(async () => {
      paint(sea);
      await settled();
    });
    change.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
        { duration: 820, easing: "cubic-bezier(0.22, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
  }

  toggle.addEventListener("click", flip);
  toggle.addEventListener("pointerenter", prime, { once: true });
  toggle.addEventListener("focus", prime, { once: true });

  // The look chosen before (set in <head>, before the first paint).
  paint(isSea());
  if (isSea()) prime();
})();
