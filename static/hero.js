/*
  Hero animation.

  Not stock footage. It plays out what the software actually does: a proof
  comes in, the scan finds two imprint boxes, the one drawn in perspective on
  the tilted product view is rejected, the square one is locked, and the art
  inside it comes out as three production files.

  To use real footage instead, drop a <video> into .hero-media and remove the
  canvas. Everything layered above it keeps working.
*/

(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const INK = '#06100F';
  const CYAN = '#22D3EE';
  const TEAL = '#0E7490';
  const AMBER = '#F5A524';
  const PAPER = '#F3F8F8';

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // -- helpers ---------------------------------------------------------------

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Progress of t through [a,b], eased, clamped to 0..1.
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const easeOut = p => 1 - Math.pow(1 - p, 3);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function dashedRect(x, y, w, h, colour, alpha, dash) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(dash || [6, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  // -- ambient ---------------------------------------------------------------

  function drawGrid(t) {
    const step = 46;
    const drift = (t * 7) % step;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,175,185,.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -step + drift; x < W + step; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let y = -step + drift; y < H + step; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Registration target, the crosshair a press uses to align plates.
  function regMark(x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(120,175,185,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * .42, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 1.7, y); ctx.lineTo(x + r * 1.7, y);
    ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x, y + r * 1.7);
    ctx.stroke();
    ctx.restore();
  }

  function vignette() {
    const g = ctx.createRadialGradient(W * .5, H * .48, Math.min(W, H) * .2,
                                       W * .5, H * .5, Math.max(W, H) * .78);
    g.addColorStop(0, 'rgba(6,16,15,0)');
    g.addColorStop(1, 'rgba(6,16,15,.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // -- the artwork on the proof ---------------------------------------------

  /* An abstract seal: outer ring, inner ring, three converging ribbons.
     Close enough to real promotional artwork to read at a glance. */
  function drawSeal(cx, cy, r, colour, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;

    ctx.lineWidth = Math.max(1.2, r * .09);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    ctx.lineWidth = Math.max(1, r * .05);
    ctx.beginPath(); ctx.arc(cx, cy, r * .74, 0, Math.PI * 2); ctx.stroke();

    // three ribbons sweeping up to a common point
    ctx.lineWidth = Math.max(1.4, r * .13);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = Math.PI * (0.78 + i * 0.30);
      ctx.beginPath();
      ctx.arc(cx, cy + r * .12, r * (.50 - i * .10), a0, a0 + Math.PI * .62);
      ctx.stroke();
    }

    // the figure's raised arm
    ctx.beginPath();
    ctx.arc(cx + r * .06, cy - r * .30, r * .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // -- output chips ----------------------------------------------------------

  const OUTPUTS = [
    { label: '.TIF', sub: '700 DPI  SPOT_1', colour: CYAN },
    { label: '.AI',  sub: 'VECTOR  100% K',  colour: PAPER },
    { label: '.PDF', sub: 'ARC WARP  600',   colour: AMBER },
  ];

  function drawChip(x, y, w, h, o, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);

    ctx.fillStyle = 'rgba(11,26,28,.92)';
    roundRect(0, 0, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = o.colour;
    ctx.globalAlpha = alpha * .55;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = o.colour;
    ctx.font = '600 15px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.label, 13, h * .38);

    ctx.fillStyle = 'rgba(126,155,161,.9)';
    ctx.font = '400 9.5px "IBM Plex Mono", monospace';
    ctx.fillText(o.sub, 13, h * .70);
    ctx.restore();
  }

  // -- the scene -------------------------------------------------------------

  const CYCLE = 15;   // seconds

  /*
    Layout.

    The composition is right aligned against the viewport and is never allowed
    to cross SAFE_LEFT, because the headline and lede live to the left of it.
    Everything the animation draws is derived from this, so nothing can drift
    over the type.
  */
  const SAFE_LEFT = 0.56;   // fraction of width reserved for text

  function layout() {
    const margin = Math.max(26, W * 0.035);
    const gap = Math.max(12, W * 0.011);
    const avail = W - margin - W * SAFE_LEFT;

    const chipW = clamp(avail * 0.36, 104, 152);
    const pageW = clamp(avail - chipW - gap, 132, 268);
    const pageH = pageW * 1.26;

    // Push right into any room left over, so it hugs the edge rather than
    // floating in the middle of the gap.
    const used = pageW + gap + chipW;
    const px = W * SAFE_LEFT + Math.max(0, avail - used);

    return {
      px, pageW, pageH, chipW, gap,
      py: H * 0.5 - pageH / 2,
      chipX: px + pageW + gap,
      midY: H * 0.5,
    };
  }

  function scene(t) {
    ctx.clearRect(0, 0, W, H);

    const L = layout();
    const { px, py, pageW, pageH, chipW, chipX } = L;

    // On narrow screens the text sits on top of all this, so pull it back
    // rather than fighting the headline for contrast.
    const roomAlpha = W < 900 ? 0.30 : 1;

    drawGrid(t);

    const corner = Math.min(W, H) * .055;
    regMark(corner * 1.3, corner * 1.3, corner * .30, .5);
    regMark(W - corner * 1.3, corner * 1.3, corner * .30, .5);
    regMark(corner * 1.3, H - corner * 1.3, corner * .30, .5);
    regMark(W - corner * 1.3, H - corner * 1.3, corner * .30, .5);

    const p = (t % CYCLE);

    // 1. the proof arrives
    const inP = easeOut(seg(p, 0.2, 1.8));
    const outP = seg(p, 13.4, 14.8);
    const pageA = inP * (1 - outP) * roomAlpha;
    if (pageA <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = pageA;
    ctx.translate(0, (1 - inP) * 26);

    // page
    ctx.fillStyle = 'rgba(20,44,48,.55)';
    roundRect(px, py, pageW, pageH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,175,185,.30)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // header rules, standing in for the proof's title block
    ctx.fillStyle = 'rgba(120,175,185,.22)';
    ctx.fillRect(px + 16, py + 16, pageW * .42, 5);
    ctx.fillRect(px + 16, py + 27, pageW * .26, 4);

    // -- the two imprint boxes --------------------------------------------
    // The flat ACTUAL SIZE swatch, lower on the page.
    const sqW = pageW * .52, sqH = pageH * .21;
    const sqX = px + (pageW - sqW) / 2, sqY = py + pageH * .60;

    // The same box on the tilted product view, drawn in perspective.
    const skW = pageW * .56, skH = pageH * .23;
    const skX = px + (pageW - skW) / 2, skY = py + pageH * .21;
    const skew = 0.30;

    const boxA = seg(p, 2.0, 2.9);
    if (boxA > 0) {
      // skewed candidate
      ctx.save();
      ctx.globalAlpha = boxA * .85;
      ctx.strokeStyle = 'rgba(120,175,185,.75)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(skX + skW * skew, skY);
      ctx.lineTo(skX + skW, skY + skH * .30);
      ctx.lineTo(skX + skW * (1 - skew), skY + skH);
      ctx.lineTo(skX, skY + skH * .70);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // the product silhouette behind it
      ctx.save();
      ctx.globalAlpha = boxA * .16;
      ctx.fillStyle = PAPER;
      roundRect(skX - 12, skY - 14, skW + 24, skH + 30, 10);
      ctx.fill();
      ctx.restore();

      dashedRect(sqX, sqY, sqW, sqH, 'rgba(120,175,185,.75)', boxA * .85);

      ctx.save();
      ctx.globalAlpha = boxA * .8;
      ctx.fillStyle = 'rgba(126,155,161,.95)';
      ctx.font = '500 8.5px "IBM Plex Mono", monospace';
      ctx.fillText('ACTUAL SIZE', sqX, sqY - 7);
      ctx.restore();
    }

    // art inside each box
    const sealR = sqH * .38;
    drawSeal(sqX + sqW / 2, sqY + sqH / 2, sealR, PAPER, boxA * .92);
    drawSeal(skX + skW / 2, skY + skH / 2, skH * .34, PAPER, boxA * .5);

    // -- 2. the scan sweep -------------------------------------------------
    const scanP = seg(p, 2.6, 4.6);
    if (scanP > 0 && scanP < 1) {
      const sy = py + pageH * scanP;
      const g = ctx.createLinearGradient(px, sy - 34, px, sy + 6);
      g.addColorStop(0, 'rgba(34,211,238,0)');
      g.addColorStop(1, 'rgba(34,211,238,.30)');
      ctx.fillStyle = g;
      ctx.fillRect(px, sy - 34, pageW, 40);
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = .95;
      ctx.beginPath(); ctx.moveTo(px, sy); ctx.lineTo(px + pageW, sy); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // -- 3. reject the skewed box -----------------------------------------
    const rejP = seg(p, 4.7, 5.5);
    if (rejP > 0) {
      ctx.save();
      ctx.globalAlpha = rejP * (1 - seg(p, 9.6, 10.4));
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(skX + skW * skew, skY);
      ctx.lineTo(skX + skW, skY + skH * .30);
      ctx.lineTo(skX + skW * (1 - skew), skY + skH);
      ctx.lineTo(skX, skY + skH * .70);
      ctx.closePath();
      ctx.stroke();

      const cx = skX + skW / 2, cy = skY + skH / 2, s = 9 * rejP;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
      ctx.stroke();

      ctx.fillStyle = AMBER;
      ctx.font = '500 8.5px "IBM Plex Mono", monospace';
      ctx.fillText('SKEWED  REJECTED', skX, skY - 8);
      ctx.restore();
    }

    // -- 4. lock the square box -------------------------------------------
    const lockP = seg(p, 5.4, 6.2);
    if (lockP > 0) {
      const grow = 1 + (1 - easeOut(lockP)) * .12;
      const gw = sqW * grow, gh = sqH * grow;
      const gx = sqX - (gw - sqW) / 2, gy = sqY - (gh - sqH) / 2;
      const fade = 1 - seg(p, 9.6, 10.4);

      ctx.save();
      ctx.globalAlpha = lockP * fade;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.7;
      ctx.setLineDash([]);
      ctx.strokeRect(gx, gy, gw, gh);

      // corner brackets
      const b = 11;
      ctx.lineWidth = 2.4;
      [[gx, gy, 1, 1], [gx + gw, gy, -1, 1],
       [gx, gy + gh, 1, -1], [gx + gw, gy + gh, -1, -1]].forEach(([bx, by, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(bx + sx * b, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + sy * b);
        ctx.stroke();
      });

      ctx.fillStyle = CYAN;
      ctx.font = '600 8.5px "IBM Plex Mono", monospace';
      ctx.fillText('SQUARE  LOCKED', gx, gy - 7);
      ctx.restore();
    }

    // -- 5. the art lifts out and the outputs fly ---------------------------
    // The lift travels straight up the centre of the page. It used to drift
    // left toward the outputs, which walked it over the headline.
    const liftP = ease(seg(p, 6.6, 8.4));
    if (liftP > 0) {
      const fromX = sqX + sqW / 2, fromY = sqY + sqH / 2;
      const toX = px + pageW / 2, toY = py + pageH * .40;
      const cxp = fromX + (toX - fromX) * liftP;
      const cyp = fromY + (toY - fromY) * liftP;
      const r = sealR + Math.min(sealR * 1.2, pageW * .10) * liftP;
      const fade = 1 - seg(p, 10.0, 10.9);
      drawSeal(cxp, cyp, r, CYAN, liftP * fade);
    }

    const chipH = Math.max(38, Math.min(46, pageH * .17));
    const chipGap = 11;
    OUTPUTS.forEach((o, i) => {
      const start = 9.0 + i * 0.42;
      const a = easeOut(seg(p, start, start + 1.0));
      if (a <= 0) return;
      const fade = 1 - seg(p, 13.2, 14.4);
      // Chips slide in from the right, away from the type.
      const x = chipX + (1 - a) * 22;
      const y = L.midY - (chipH * 1.5 + chipGap) + i * (chipH + chipGap);
      drawChip(x, y, chipW, chipH, o, a * fade, .94 + a * .06);
    });

    ctx.restore();
    vignette();
  }

  // -- loop ------------------------------------------------------------------

  let start = null;

  function frame(ts) {
    if (start === null) start = ts;
    scene((ts - start) / 1000);
    requestAnimationFrame(frame);
  }

  if (reduced) {
    // Hold the finished frame rather than animating.
    scene(11.5);
    window.addEventListener('resize', () => scene(11.5));
  } else {
    requestAnimationFrame(frame);
  }
})();
