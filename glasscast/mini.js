// The app's mini player, on the page. Same morph as MiniPlayer.kt: one value,
// p (0 = card, 1 = bubble), drives everything. Scrolling down shrinks the card
// toward its right end until only the icon is left, then drops it into a
// scalloped bubble in the corner. Scrolling up runs it back. The wavy line and
// the bubble's ring show how far down the page you are.
(() => {
  const root = document.getElementById("mini");
  if (!root) return;

  const bg = root.querySelector(".mini-bg");
  const shadow = root.querySelector(".mini-shadow");
  const card = root.querySelector(".mini-card");
  const row = root.querySelector(".mini-row");
  const art = root.querySelector(".mini-art");
  const ring = root.querySelector(".mini-ring");
  const track = ring.querySelector(".track");
  const arc = ring.querySelector(".arc");
  const bubble = root.querySelector(".mini-bubble");
  const wave = root.querySelector(".mini-wave");
  const played = wave.querySelector(".played");
  const rest = wave.querySelector(".rest");
  const dot = wave.querySelector(".dot");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  // The app's numbers, in px.
  const CARD_H = 68, CARD_CORNER = 30, BUBBLE = 58, BUBBLE_INSET = 7;
  const ART = 48, ART_CORNER = 12, ART_LEAD = 10, DROP = 17, STROKE = 3.5, DRIFT = 40;
  const LOBES = 9, DEPTH = 0.06;
  const STIFFNESS = 380, THRESHOLD = 48;

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const bubblePhase = (p) => clamp((p - 0.55) / 0.45);

  // A scalloped circle, starting at twelve o'clock and running clockwise, so
  // a dash from 0 reads as progress from the top (CookieShape.kt).
  function cookie(w, h, rotation, inset, depth, steps = 72) {
    const cx = w / 2, cy = h / 2;
    const base = (Math.min(cx, cy) - inset) / (1 + depth);
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / steps;
      const r = base * (1 + depth * Math.cos(LOBES * (t + rotation)));
      d += (i ? "L" : "M") + (cx + r * Math.cos(t)).toFixed(2) + " " + (cy + r * Math.sin(t)).toFixed(2);
    }
    return d + "Z";
  }

  // Where everything is at any point along the morph (MorphMetrics.frame).
  function frame(p, width) {
    const a = clamp(p / 0.55);
    const b = bubblePhase(p);
    const left = (width - CARD_H) * a;
    let rect = { x: left, y: 0, w: width - left, h: CARD_H };
    let radius = CARD_CORNER + (CARD_H / 2 - CARD_CORNER) * a;
    const inset = (CARD_H - ART) / 2;
    const artEnd = width - CARD_H + inset;
    let artBox = { x: ART_LEAD + (artEnd - ART_LEAD) * a, y: inset, s: ART };
    if (b > 0) {
      const fromX = rect.x + rect.w / 2, fromY = CARD_H / 2;
      const toX = width - BUBBLE / 2, toY = CARD_H / 2 + DROP;
      const cx = fromX + (toX - fromX) * b, cy = fromY + (toY - fromY) * b;
      const side = CARD_H + (BUBBLE - CARD_H) * b;
      rect = { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
      radius = side / 2;
      const inner = ART + (BUBBLE - BUBBLE_INSET * 2 - ART) * b;
      artBox = { x: cx - inner / 2, y: cy - inner / 2, s: inner };
    }
    return { rect, radius, b, bgAlpha: 1 - b, ringAlpha: clamp((b - 0.7) / 0.3), art: artBox };
  }

  let target = 0, pos = 0, vel = 0;
  let travel = 0, lastY = scrollY, lastScrollAt = -1e9;
  let spin = 0, waveClock = 0, amp = 0;
  let waveWidth = 0, running = false, lastFrame = 0;

  function progress() {
    const room = document.documentElement.scrollHeight - innerHeight;
    return room > 0 ? clamp(scrollY / room) : 0;
  }

  function setCollapsed(c) {
    const next = c ? 1 : 0;
    if (next === target) return;
    target = next;
    bubble.hidden = !c;
    if (still.matches) { pos = target; vel = 0; }
    kick();
  }

  // Critically damped, like the app's: it must never overshoot. Solved
  // exactly per frame, so a slow frame can't make it wobble.
  function stepSpring(dt) {
    const w = Math.sqrt(STIFFNESS);
    const x0 = pos - target, c = vel + w * x0, e = Math.exp(-w * dt);
    pos = target + (x0 + c * dt) * e;
    vel = (c - w * (x0 + c * dt)) * e;
    if (Math.abs(pos - target) < 1e-4 && Math.abs(vel) < 1e-3) { pos = target; vel = 0; }
  }

  function drawWave(prog) {
    const w = waveWidth;
    if (!w) return;
    const cy = 4, stroke = 2.6, dotR = stroke / 2, gap = 3;
    const a = 1.8 * amp;
    const k = (2 * Math.PI) / 18;
    const phase = ((waveClock % 1.4) / 1.4) * 2 * Math.PI;
    const head = w * prog;
    const end = Math.max(0, head - gap);
    if (end > stroke) {
      let x = stroke / 2;
      let d = "M" + x.toFixed(1) + " " + (cy + a * Math.sin(k * x - phase)).toFixed(2);
      while (x < end) {
        x = Math.min(end, x + 2);
        d += "L" + x.toFixed(1) + " " + (cy + a * Math.sin(k * x - phase)).toFixed(2);
      }
      played.setAttribute("d", d);
    } else {
      played.setAttribute("d", "");
    }
    const restStart = head + gap, restEnd = w - dotR * 4;
    rest.style.display = restStart < restEnd ? "" : "none";
    rest.setAttribute("x1", restStart.toFixed(1));
    rest.setAttribute("x2", restEnd.toFixed(1));
    dot.setAttribute("cx", (w - dotR).toFixed(1));
  }

  function render() {
    const p = clamp(pos);
    const width = root.clientWidth;
    const f = frame(p, width);
    const prog = progress();
    const rotation = (spin / 2.4) * ((2 * Math.PI) / LOBES);

    // The container: card, then pill, then circle, fading as it becomes the bubble.
    bg.style.opacity = f.bgAlpha;
    bg.style.transform = `translate(${f.rect.x}px, ${f.rect.y}px)`;
    bg.style.width = f.rect.w + "px";
    bg.style.height = f.rect.h + "px";
    bg.style.borderRadius = f.radius + "px";

    // The words and the button leave first, drifting toward the corner.
    row.style.opacity = clamp(1 - p / 0.3);
    row.style.transform = `translateX(${p * DRIFT}px)`;
    // Kept inside the card as it shrinks (the clip moves with the drift, so
    // it's set in the row's own, drifted coordinates).
    row.style.clipPath = `inset(0 ${p * DRIFT}px 0 ${Math.max(0, f.rect.x - p * DRIFT)}px round ${f.radius}px)`;
    card.style.visibility = p < 0.35 ? "visible" : "hidden";

    // The icon: the one part that travels. Rounded square, opening to a
    // circle, then the scallops grow in.
    art.style.transform = `translate(${f.art.x}px, ${f.art.y}px)`;
    art.style.width = art.style.height = f.art.s + "px";
    if (f.b < 0.5) {
      art.style.clipPath = "none";
      art.style.borderRadius = ART_CORNER + (f.art.s / 2 - ART_CORNER) * (f.b * 2) + "px";
    } else {
      art.style.borderRadius = "0";
      art.style.clipPath = `path("${cookie(f.art.s, f.art.s, rotation, 0, DEPTH * (f.b - 0.5) * 2)}")`;
    }

    shadow.style.opacity = f.b;
    shadow.style.transform = `translate(${f.rect.x}px, ${f.rect.y}px)`;
    shadow.style.width = shadow.style.height = f.rect.w + "px";

    // The ring, tracing the bubble's scalloped edge.
    if (f.ringAlpha > 0) {
      ring.style.display = "";
      ring.style.opacity = f.ringAlpha;
      ring.style.transform = `translate(${f.rect.x}px, ${f.rect.y}px)`;
      ring.setAttribute("width", f.rect.w);
      ring.setAttribute("height", f.rect.h);
      const d = cookie(f.rect.w, f.rect.h, rotation, STROKE / 2, DEPTH);
      track.setAttribute("d", d);
      arc.setAttribute("d", d);
      const len = arc.getTotalLength();
      arc.style.display = prog > 0.004 ? "" : "none";
      arc.style.strokeDasharray = `${len * prog} ${len}`;
    } else {
      ring.style.display = "none";
    }

    if (p < 0.35) drawWave(prog);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    const scrolling = now - lastScrollAt < 220;

    if (still.matches) { pos = target; vel = 0; amp = 0; }
    else {
      stepSpring(dt);
      // The wave moves while the page does and settles flat when it stops.
      amp += ((scrolling ? 1 : 0) - amp) * Math.min(1, dt * 9);
      if (amp < 0.002 && !scrolling) amp = 0;
      if (amp > 0) waveClock += dt;
      // The lobes turn slowly once it's a bubble.
      if (target === 1) spin += dt;
    }
    render();

    const settling = pos !== target || vel !== 0;
    const spinning = !still.matches && target === 1 && pos === 1;
    if (settling || amp > 0 || scrolling) {
      requestAnimationFrame(loop);
    } else if (spinning) {
      // 30 times a second is plenty for a slow turn.
      setTimeout(() => requestAnimationFrame(loop), 1000 / 30);
    } else {
      running = false;
      lastFrame = 0;
    }
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  // Collapse on a deliberate scroll, not a twitch: 48px of travel in one
  // direction, and changing direction starts the count over.
  addEventListener("scroll", () => {
    const y = scrollY, dy = y - lastY;
    lastY = y;
    if ((dy > 0 && travel < 0) || (dy < 0 && travel > 0)) travel = 0;
    travel += dy;
    if (y < 24) { setCollapsed(false); travel = 0; }
    else if (travel > THRESHOLD) { setCollapsed(true); travel = 0; }
    else if (travel < -THRESHOLD) { setCollapsed(false); travel = 0; }
    lastScrollAt = performance.now();
    kick();
  }, { passive: true });

  bubble.addEventListener("click", () => {
    travel = 0;
    setCollapsed(false);
    card.focus({ preventScroll: true });
  });

  function measure() {
    waveWidth = wave.getBoundingClientRect().width;
    wave.setAttribute("viewBox", `0 0 ${waveWidth} 8`);
    kick();
  }
  addEventListener("resize", measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(wave);

  // Arriving partway down the page (a link, or coming back), start as the bubble.
  if (scrollY > 120) { target = pos = 1; bubble.hidden = false; }
  measure();
  root.classList.add("ready");
})();
