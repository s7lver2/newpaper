/* newpaper movil · motor de la animación de arranque (intro). FUENTE ÚNICA: este fichero.
   Se copia entre los marcadores @intro-engine de los artboards que lo usan con
   `node design/mockups/tools/inject-base.mjs` (no editar la copia a mano).
   Es una función pura del tiempo: NPIntro.draw(ctx, t, mode) dibuja el fotograma t (ms), así que se puede
   reproducir, arrastrar en una línea de tiempo (?s=<ms>) y comparar con el splash nativo. Coordenadas lógicas 390x844. */
const NPIntro = (function () {
  const W = 390, H = 844, INK = '#17171A', PAPER = '#F6F4EF', GHOST = '#34343B';
  const S = 4.2, MC = [53.5, 56.25], CX = W / 2, CY = H / 2;
  const OX = CX - MC[0] * S, OY = CY - MC[1] * S;           // la marca (n + rombo) queda centrada en la pantalla
  const BH = [CX, CY];                                      // «agujero negro»: el centro de la marca
  const TOT = { first: 2920, short: 1080, reduce: 800 };
  const T = { done: 2100, clean: [2100, 2420], dia: [2180, 2640], hand: [2560, 2920] };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const back = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- la marca (unidades del viewBox 108) -----------------------------------------------------------
  const P = { stem: 'M33 40.5V71', arc: 'M33 54C33 45 39 40 46.5 40 54 40 58 44.5 58 51.5V71', serif: 'M26.5 71H39.5M51.5 71H64.5M26.5 43.5L33 40' };
  let path = null;
  const bez = (p0, p1, p2, p3, k) => { const u = 1 - k; return [u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0], u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1]]; };
  const ARC = [[[33, 54], [33, 45], [39, 40], [46.5, 40]], [[46.5, 40], [54, 40], [58, 44.5], [58, 51.5]], [[58, 51.5], [58, 51.5], [58, 71], [58, 71]]];
  const arcAt = (f) => { const L = [22.2, 17.6, 19.5], tot = L[0] + L[1] + L[2]; let d = f * tot; for (let i = 0; i < 3; i++) { if (d <= L[i] || i === 2) return bez(...ARC[i], clamp(d / L[i], 0, 1)); d -= L[i]; } };
  const LEN = { stem: 30.5, arc: 59.3 };
  const SERIFS = [[[26.5, 71], [39.5, 71]], [[51.5, 71], [64.5, 71]], [[26.5, 43.5], [33, 40]]];
  function init() {
    if (path) return;
    path = { stem: new Path2D(P.stem), arc: new Path2D(P.arc), serif: new Path2D(P.serif) };
    const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d');
    x.fillStyle = '#D9D3C4'; x.fillRect(0, 0, 8, 8); x.fillStyle = '#B7B09F'; x.fillRect(0, 2, 8, 1); x.fillRect(0, 5, 6, 1); x.fillStyle = '#C9C2B1'; x.fillRect(3, 0, 1, 8);
    path.tex = c;
  }
  // punto del esqueleto de la n según q en [0,1]: tallo, arco, remates
  function targetOf(q, jit) {
    let p;
    if (q < 0.28) p = [33, 40.5 + 30.5 * (q / 0.28)];
    else if (q < 0.88) p = arcAt((q - 0.28) / 0.6);
    else { const f = (q - 0.88) / 0.12 * 3, i = Math.min(2, Math.floor(f)), k = f - i, s = SERIFS[i]; p = [lerp(s[0][0], s[1][0], k), lerp(s[0][1], s[1][1], k)]; }
    return [OX + (p[0] + (jit[0] - 0.5) * 3) * S, OY + (p[1] + (jit[1] - 0.5) * 3) * S];
  }

  // ---- hojas y polvo (deterministas) --------------------------------------------------------------------
  let sheets = null, dust = null;
  function build() {
    if (sheets) return;
    const r = rng(11), N = 38; sheets = []; dust = [];
    const TINT = ['#E8705A', '#B9B4A9', '#7C9AF2'];
    for (let i = 0; i < N; i++) {
      const q = (i + 0.5) / N;
      sheets.push({ i, q, dly: 40 + q * 850 + r() * 120, D: 640 + r() * 340, th: i * 2.399963 + r() * 0.6, r0: 520 + r() * 260, spin: 2.1 * Math.PI + r() * Math.PI * 0.9, tum: r() * 6.28, tumv: (r() - 0.5) * 0.012, tint: TINT[i % 3], tgt: targetOf(q, [r(), r()]), sz: 0.9 + r() * 0.3, lines: 2 + Math.floor(r() * 3) });
    }
    for (let i = 0; i < 96; i++) dust.push({ dly: r() * 1750, D: 520 + r() * 420, th: r() * 6.28, r0: 300 + r() * 360, spin: 1.8 * Math.PI + r() * Math.PI, rr: r() * 14, sz: 0.8 + r() * 1.5, a: 0.3 + r() * 0.4 });
  }
  // posición (px) de un cuerpo en tiempo t: espiral con aceleración (ease-in) hacia su destino
  function place(o, t, tgt) {
    const u = clamp((t - o.dly) / o.D, 0, 1), e = Math.pow(u, 2.3);
    const cx = lerp(BH[0], tgt[0], Math.pow(e, 1.5)), cy = lerp(BH[1], tgt[1], Math.pow(e, 1.5));
    const r = o.r0 * (1 - e), a = o.th + o.spin * Math.pow(u, 1.7);
    return { u, e, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function useMark(c, scale) { c.save(); c.translate(OX, OY); if (scale && scale !== 1) { c.translate(MC[0] * 0 + 53.5, 56.25); c.scale(scale, scale); c.translate(-53.5, -56.25); } c.scale(S, S); }
  function strokeN(c, color, R, alpha, pat) {
    c.save(); c.globalAlpha = alpha; c.strokeStyle = pat || color; c.lineJoin = 'miter'; c.lineCap = 'butt';
    const seg = (p, len, lw, a, b) => { const f = clamp((R - a) / (b - a), 0, 1); if (f <= 0) return; c.lineWidth = lw; c.setLineDash([len * f + 0.001, len + 30]); c.stroke(p); };
    seg(path.stem, LEN.stem, 7.5, 0, 0.28); seg(path.arc, LEN.arc, 6, 0.28, 0.88);
    const f = clamp((R - 0.88) / 0.12, 0, 1); if (f > 0) { c.setLineDash([]); c.lineWidth = 3; c.globalAlpha = alpha * f; c.stroke(path.serif); }
    c.restore();
  }
  const DIA = { l: [[67.5, 66], [71.83, 61.67], [71.83, 70.33]], c: [[71.83, 61.67], [74, 59.5], [76.17, 61.67], [76.17, 70.33], [74, 72.5], [71.83, 70.33]], r: [[76.17, 61.67], [80.5, 66], [76.17, 70.33]] };
  function poly(c, pts, fill, alpha, dx, sc) { c.save(); c.globalAlpha = alpha; c.fillStyle = fill; c.translate(74 + dx, 66); c.scale(sc, sc); c.translate(-74, -66); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); c.restore(); }
  const DIA_POS = [OX + 74 * S, OY + 66 * S];

  function sheetShape(c, s, k) {
    const w = 26 * s.sz, h = 33 * s.sz;
    c.fillStyle = '#EFEBE1'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 2); c.fill();
    c.fillStyle = s.tint; c.fillRect(-w / 2 + 3, -h / 2 + 3, w * 0.62, 4.5);
    c.fillStyle = 'rgba(23,23,26,.55)'; for (let i = 0; i < s.lines + 2; i++) c.fillRect(-w / 2 + 3, -h / 2 + 11 + i * 4.6, (i % 2 ? 0.72 : 0.9) * (w - 6), 1.5);
    c.fillStyle = '#CFC8B8'; c.beginPath(); c.moveTo(w / 2, h / 2 - 7); c.lineTo(w / 2 - 7, h / 2); c.lineTo(w / 2, h / 2); c.closePath(); c.fill();
  }

  // ---- el fotograma ---------------------------------------------------------------------------------------------
  function drawNative(c) { init(); c.fillStyle = INK; c.fillRect(0, 0, W, H); useMark(c); strokeN(c, GHOST, 1, 1); [['l'], ['c'], ['r']].forEach((k) => poly(c, DIA[k[0]], GHOST, 1, 0, 1)); c.restore(); }

  function draw(c, tm, mode) {
    init(); build();
    c.save(); c.fillStyle = INK; c.fillRect(0, 0, W, H);
    if (mode === 'reduce') {
      const a = sm(120, 340, tm);
      useMark(c); strokeN(c, GHOST, 1, 1 - a); strokeN(c, PAPER, 1, a);
      ['l', 'c', 'r'].forEach((k) => poly(c, DIA[k], GHOST, 1 - a, 0, 1)); poly(c, DIA.l, '#E8705A', a, 0, 1); poly(c, DIA.c, '#D8D3C8', a, 0, 1); poly(c, DIA.r, '#7C9AF2', a, 0, 1);
      c.restore(); c.restore(); return;
    }
    const k = mode === 'short' ? TOT.first / TOT.short : 1, t = tm * k;
    const list = mode === 'short' ? sheets.filter((s) => s.i % 2 === 0) : sheets;
    // anillo de acreción
    const env = sm(60, 700, t) * (1 - sm(1950, 2250, t)), shrink = 1 - 0.8 * sm(1900, 2250, t);
    if (env > 0.01) {
      const rings = [[64, '#E8705A', 0.0046], [98, '#EFEBE1', 0.0034], [142, '#7C9AF2', 0.0026]];
      c.save(); c.translate(BH[0], BH[1]); c.rotate(-0.38); c.scale(1, 0.36); c.lineCap = 'round';
      rings.forEach((rg, ri) => {
        const R = rg[0] * shrink, N = 36, head = t * rg[2];
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1.15) / N) * Math.PI * 2;
          const d = ((head - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), al = Math.pow(1 - d / (Math.PI * 2), 2.2) * 0.8 * env;
          if (al < 0.02) continue;
          c.strokeStyle = rg[1]; c.globalAlpha = al; c.lineWidth = (1.1 + ri * 0.2) / 0.5; c.beginPath(); c.arc(0, 0, R, a0, a1); c.stroke();
        }
      });
      c.restore();
      const g = c.createRadialGradient(BH[0], BH[1], 0, BH[0], BH[1], 110 * shrink); g.addColorStop(0, 'rgba(246,244,239,' + (0.07 * env) + ')'); g.addColorStop(1, 'rgba(246,244,239,0)');
      c.fillStyle = g; c.fillRect(BH[0] - 120, BH[1] - 120, 240, 240);
    }
    // marca: n fantasma (= splash nativo) + n que se rellena a medida que llegan las hojas
    let R = 0, W8 = 0; list.forEach((s) => { const w = 1; W8 += w; const arr = s.dly + s.D; R += w * sm(arr - 10, arr + 140, t); }); R = W8 ? R / W8 : 0;
    const pulse = 1 + 0.035 * Math.sin(clamp((t - T.done) / 300, 0, 1) * Math.PI) * (1 - clamp((t - T.done) / 300, 0, 1));
    const cc = sm(T.clean[0], T.clean[1], t), glow = Math.sin(clamp((t - T.clean[0]) / (T.clean[1] - T.clean[0]), 0, 1) * Math.PI);
    useMark(c, pulse);
    strokeN(c, GHOST, 1, 1 - cc * 0);
    if (cc < 1) strokeN(c, '#D9D3C4', R, 1 - cc, c.createPattern(path.tex, 'repeat'));
    if (cc > 0) { c.shadowColor = 'rgba(246,244,239,' + (0.55 * glow) + ')'; c.shadowBlur = 26 / S * S; strokeN(c, PAPER, 1, cc); c.shadowBlur = 0; }
    // rombo: fantasma → se enciende en sus tres tramos
    const pc = back(clamp((t - T.dia[0]) / 420, 0, 1)), pl = back(clamp((t - T.dia[0] - 60) / 420, 0, 1)), vis = sm(T.dia[0], T.dia[0] + 120, t);
    poly(c, DIA.l, GHOST, 1 - vis, 0, 1); poly(c, DIA.c, GHOST, 1 - vis, 0, 1); poly(c, DIA.r, GHOST, 1 - vis, 0, 1);
    if (vis > 0) { poly(c, DIA.l, '#E8705A', vis, -7 * (1 - pl), 1); poly(c, DIA.c, '#D8D3C8', vis, 0, Math.max(0.01, 0.25 + 0.75 * pc)); poly(c, DIA.r, '#7C9AF2', vis, 7 * (1 - pl), 1); }
    c.restore();
    // onda al terminar
    const wv = clamp((t - 2200) / 440, 0, 1);
    if (wv > 0 && wv < 1) { c.save(); c.strokeStyle = PAPER; c.globalAlpha = 0.32 * (1 - wv); c.lineWidth = 1.5; c.beginPath(); c.arc(DIA_POS[0], DIA_POS[1], 8 + 150 * (1 - Math.pow(1 - wv, 3)), 0, Math.PI * 2); c.stroke(); c.restore(); }
    // destellos de impacto
    list.forEach((s) => { const a = clamp((t - s.dly - s.D) / 260, 0, 1); if (a > 0 && a < 1) { c.save(); c.globalAlpha = 0.5 * (1 - a); const g = c.createRadialGradient(s.tgt[0], s.tgt[1], 0, s.tgt[0], s.tgt[1], 20 * (0.5 + a)); g.addColorStop(0, '#F6F4EF'); g.addColorStop(1, 'rgba(246,244,239,0)'); c.fillStyle = g; c.fillRect(s.tgt[0] - 24, s.tgt[1] - 24, 48, 48); c.restore(); } });
    // polvo
    dust.forEach((d) => {
      if (mode === 'short' && d.dly > 900) return;
      const tg = [BH[0] + d.rr, BH[1] + d.rr * 0.4], p = place(d, t, tg); if (p.u <= 0 || p.u >= 1) return;
      const q = place(d, t - 22, tg), al = d.a * sm(0, 0.12, p.u) * (1 - sm(0.9, 1, p.u));
      c.strokeStyle = PAPER; c.globalAlpha = al; c.lineWidth = d.sz; c.lineCap = 'round'; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(p.x, p.y); c.stroke();
    });
    c.globalAlpha = 1;
    // hojas: espiral, estela, estiramiento y compresión al acercarse
    list.forEach((s) => {
      const p = place(s, t, s.tgt); if (p.u <= 0 || p.u >= 1) return;
      const al = sm(0, 0.1, p.u) * (1 - sm(0.93, 1, p.u));
      const prev = place(s, t - 8, s.tgt), vx = (p.x - prev.x) / 8, vy = (p.y - prev.y) / 8, v = Math.hypot(vx, vy), ang = Math.atan2(vy, vx);
      const sc = lerp(1.05, 0.3, Math.pow(p.e, 1.1)), st = 1 + clamp(v * 3.1, 0, 3.2) * (0.3 + 0.7 * p.e);
      c.save(); c.lineCap = 'round';
      for (let j = 9; j >= 1; j--) { const a = place(s, t - j * 16, s.tgt), b = place(s, t - (j - 1) * 16, s.tgt); if (a.u <= 0) continue; c.strokeStyle = s.tint; c.globalAlpha = 0.5 * al * (1 - j / 10) * clamp(v * 1.4, 0.15, 1); c.lineWidth = 7 * sc * (1 - j / 11); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
      c.globalAlpha = al; c.translate(p.x, p.y); c.rotate(ang); c.scale(st * sc, sc / Math.sqrt(st)); c.rotate(s.tum + s.tumv * t * (1 - p.e)); sheetShape(c, s, p.e);
      c.restore();
    });
    c.restore();
  }

  // capa del DOM encima del canvas: radio del iris con el que aparece la app (o fundido en movimiento reducido)
  function hand(tm, mode) {
    if (mode === 'reduce') return { iris: 0, fade: sm(640, 800, tm) };
    const k = mode === 'short' ? TOT.first / TOT.short : 1, t = tm * k;
    return { iris: 920 * Math.pow(sm(T.hand[0], T.hand[1], t), 1.0), fade: 0 };
  }
  const PH = [[0, 'Idéntico al splash nativo'], [40, 'Las hojas entran por los bordes'], [700, 'Atracción: espiral con aceleración'], [1500, 'La n se rellena con cada hoja'], [2100, 'Cambio al logo limpio'], [2180, 'El rombo se enciende'], [2560, 'Entrega a la app (iris)']];
  return { W, H, TOT, T, draw, drawNative, hand, phases: PH, sm };
})();
