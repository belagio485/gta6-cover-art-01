// Neon Shore — GTA-style cover maker. All rendering happens on the user's
// own machine: photos are read locally and never uploaded anywhere.

const SIZES = {
  square: { w: 1080, h: 1080, label: "1080 x 1080" },
  portrait: { w: 1080, h: 1350, label: "1080 x 1350" },
  wide: { w: 1920, h: 1080, label: "1920 x 1080" },
};

const GRADES = {
  sunset: {
    filter: "saturate(1.35) contrast(1.08) brightness(1.03)",
    stops: ["#ff9a3d", "#ff5e78", "#7a2ea6"],
    accent: "#ff2e88",
    glow: "#ffb347",
    scrim: "rgba(43, 8, 44, 0.78)",
  },
  neon: {
    filter: "saturate(1.45) contrast(1.12) brightness(1.0)",
    stops: ["#ff2ea6", "#7a2ea6", "#00e5d4"],
    accent: "#00e5d4",
    glow: "#ff2ea6",
    scrim: "rgba(8, 4, 32, 0.8)",
  },
  teal: {
    filter: "saturate(1.3) contrast(1.1) brightness(1.02)",
    stops: ["#ff8a3d", "#c96a4a", "#0f7d8c"],
    accent: "#ff8a3d",
    glow: "#ffd166",
    scrim: "rgba(6, 26, 32, 0.78)",
  },
};

const state = {
  layout: "hero",
  grade: "sunset",
  size: "portrait",
  caption: "NEON SHORE",
  subtitle: "golden hour, neon nights",
  selected: 0,
  panels: [],
};

const photos = { sample1: null, sample2: null };
let uploadCount = 0;
let grainPattern = null;

const stage = document.getElementById("stage");
const stageCtx = stage.getContext("2d");
const coverCanvas = document.getElementById("coverCanvas");

function layoutPanels(layout, W, H) {
  const outer = Math.round(W * 0.022);
  const g = Math.round(W * 0.014);
  const innerW = W - outer * 2;
  const innerH = H - outer * 2;
  if (layout === "grid") {
    const w = (innerW - g) / 2;
    const h = (innerH - g) / 2;
    return [
      { x: outer, y: outer, w, h },
      { x: outer + w + g, y: outer, w, h },
      { x: outer, y: outer + h + g, w, h },
      { x: outer + w + g, y: outer + h + g, w, h },
    ];
  }
  if (layout === "full") {
    return [{ x: outer, y: outer, w: innerW, h: innerH }];
  }
  const leftW = Math.round(innerW * 0.6);
  const rightX = outer + leftW + g;
  const rightW = innerW - leftW - g;
  const smallH = (innerH - g * 2) / 3;
  return [
    { x: outer, y: outer, w: leftW, h: innerH },
    { x: rightX, y: outer, w: rightW, h: smallH },
    { x: rightX, y: outer + smallH + g, w: rightW, h: smallH },
    { x: rightX, y: outer + (smallH + g) * 2, w: rightW, h: smallH },
  ];
}

function defaultPhotos(layout) {
  if (layout === "full") return ["sample1"];
  if (layout === "grid") return ["sample1", "sample2", "sample2", "sample1"];
  return ["sample1", "sample2", "sample1", "sample2"];
}

function rebuildPanels() {
  const names = defaultPhotos(state.layout);
  const old = state.panels;
  state.panels = names.map((photo, i) => {
    const prev = old[i];
    return {
      photo: prev && prev.photo ? prev.photo : photo,
      zoom: prev ? prev.zoom : 1,
      ox: prev ? prev.ox : 0,
      oy: prev ? prev.oy : 0,
    };
  });
  state.selected = Math.min(state.selected, state.panels.length - 1);
  document.getElementById("panelCount").textContent = state.panels.length;
}

function makeGrain() {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const g = c.getContext("2d");
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + Math.floor(Math.random() * 40);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return c;
}

function drawPhotoCover(ctx, img, rect, panel) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * panel.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + panel.ox * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + panel.oy * rect.h;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function applyGrade(ctx, rect, grade) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, grade.stops[0]);
  grad.addColorStop(0.55, grade.stops[1]);
  grad.addColorStop(1, grade.stops[2]);
  ctx.globalAlpha = 0.42;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function fitFont(ctx, text, maxWidth, startSize, family) {
  let size = startSize;
  ctx.font = `${size}px ${family}`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

function drawCaption(ctx, W, H, grade) {
  const scrimH = H * 0.34;
  const scrim = ctx.createLinearGradient(0, H - scrimH, 0, H);
  scrim.addColorStop(0, "rgba(10, 5, 20, 0)");
  scrim.addColorStop(1, grade.scrim);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - scrimH, W, scrimH);

  const pad = W * 0.045;
  const caption = state.caption.trim() || "NEON SHORE";
  const subtitle = state.subtitle.trim();
  const capSize = fitFont(ctx, caption.toUpperCase(), W - pad * 2, Math.round(W * 0.115), "Anton");
  const capY = H - H * 0.055;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  // Offset accent shadow copy, then the white face with a black outline.
  ctx.font = `${capSize}px Anton`;
  ctx.fillStyle = grade.accent;
  ctx.fillText(caption.toUpperCase(), pad + capSize * 0.045, capY + capSize * 0.045);
  ctx.lineWidth = Math.max(3, capSize * 0.085);
  ctx.strokeStyle = "#0d0a14";
  ctx.strokeText(caption.toUpperCase(), pad, capY);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(caption.toUpperCase(), pad, capY);

  if (subtitle) {
    const subSize = fitFont(ctx, subtitle, W - pad * 2, Math.round(W * 0.042), "Pacifico");
    ctx.font = `${subSize}px Pacifico`;
    ctx.shadowColor = grade.glow;
    ctx.shadowBlur = Math.round(W * 0.012);
    ctx.fillStyle = "#ffe9f4";
    ctx.fillText(subtitle, pad, capY - capSize * 1.02);
    ctx.shadowBlur = 0;
  }
}

function drawCover(ctx, W, H) {
  const grade = GRADES[state.grade];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f4eef7";
  ctx.fillRect(0, 0, W, H);
  const rects = layoutPanels(state.layout, W, H);
  ctx.save();
  ctx.filter = grade.filter;
  rects.forEach((rect, i) => {
    const panel = state.panels[i];
    const img = panel && photos[panel.photo];
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    drawPhotoCover(ctx, img, rect, panel);
    ctx.restore();
  });
  ctx.restore();
  rects.forEach((rect) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    applyGrade(ctx, rect, grade);
    ctx.restore();
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeStyle = "#0d0a14";
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });
  // Vignette and grain over the whole cover.
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(10,4,20,0.3)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  if (!grainPattern) grainPattern = ctx.createPattern(makeGrain(), "repeat");
  if (grainPattern) {
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.lineWidth = Math.max(4, W * 0.006);
  ctx.strokeStyle = "#f4eef7";
  ctx.strokeRect(W * 0.008, H * 0.008, W * 0.984, H * 0.984);
  drawCaption(ctx, W, H, grade);
}

function previewSize() {
  const s = SIZES[state.size];
  const scale = Math.min(1, 620 / Math.max(s.w, s.h));
  return { w: Math.round(s.w * scale), h: Math.round(s.h * scale) };
}

function drawPreview() {
  const { w, h } = previewSize();
  if (stage.width !== w || stage.height !== h) {
    stage.width = w;
    stage.height = h;
  }
  drawCover(stageCtx, w, h);
}

function refreshPanelControls() {
  const panel = state.panels[state.selected];
  document.getElementById("panelName").textContent = state.selected + 1;
  document.getElementById("zoomSlider").value = panel ? Math.round(panel.zoom * 100) : 100;
  document.getElementById("zoomVal").textContent = panel ? `${Math.round(panel.zoom * 100)}%` : "100%";
  document.querySelectorAll("#photoRow [data-photo]").forEach((b) => {
    b.classList.toggle("on", !!panel && panel.photo === b.dataset.photo);
  });
}

function redraw() {
  refreshPanelControls();
  drawPreview();
}

function loadSample(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      photos[key] = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

async function initPhotos() {
  await Promise.all([
    loadSample("sample1", "samples/woman-car.jpg"),
    loadSample("sample2", "samples/friends-neon.jpg"),
  ]);
  redraw();
}

function bindButtonRow(id, attr, apply) {
  const row = document.getElementById(id);
  row.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !btn.dataset[attr]) return;
    row.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    apply(btn.dataset[attr]);
  });
}

bindButtonRow("layoutRow", "layout", (v) => {
  state.layout = v;
  rebuildPanels();
  redraw();
});
bindButtonRow("gradeRow", "grade", (v) => {
  state.grade = v;
  redraw();
});
bindButtonRow("sizeRow", "size", (v) => {
  state.size = v;
  redraw();
});
bindButtonRow("photoRow", "photo", (v) => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.photo = v;
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  redraw();
});

document.getElementById("uploadBtn").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    uploadCount += 1;
    const key = `up${uploadCount}`;
    photos[key] = img;
    const panel = state.panels[state.selected];
    if (panel) {
      panel.photo = key;
      panel.zoom = 1;
      panel.ox = 0;
      panel.oy = 0;
    }
    redraw();
  };
  img.src = url;
  e.target.value = "";
});

document.getElementById("zoomSlider").addEventListener("input", (e) => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.zoom = Number(e.target.value) / 100;
  document.getElementById("zoomVal").textContent = `${e.target.value}%`;
  drawPreview();
});
document.getElementById("fillAllBtn").addEventListener("click", () => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  state.panels.forEach((p) => {
    p.photo = panel.photo;
  });
  redraw();
});
document.getElementById("resetPanBtn").addEventListener("click", () => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  redraw();
});
document.getElementById("captionInput").addEventListener("input", (e) => {
  state.caption = e.target.value;
  drawPreview();
});
document.getElementById("subtitleInput").addEventListener("input", (e) => {
  state.subtitle = e.target.value;
  drawPreview();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const s = SIZES[state.size];
  const out = document.createElement("canvas");
  out.width = s.w;
  out.height = s.h;
  drawCover(out.getContext("2d"), s.w, s.h);
  out.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neon-shore-cover-${s.w}x${s.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
});

// Drag a photo inside its panel to reposition it; a plain click selects.
let drag = null;
function canvasPoint(e) {
  const r = stage.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * stage.width,
    y: ((e.clientY - r.top) / r.height) * stage.height,
  };
}
function hitPanel(p) {
  const rects = layoutPanels(state.layout, stage.width, stage.height);
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
  }
  return -1;
}
stage.addEventListener("pointerdown", (e) => {
  const p = canvasPoint(e);
  const i = hitPanel(p);
  if (i < 0) return;
  state.selected = i;
  const rects = layoutPanels(state.layout, stage.width, stage.height);
  drag = { panel: state.panels[i], rect: rects[i], last: p, moved: false };
  stage.setPointerCapture(e.pointerId);
  refreshPanelControls();
});
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const dx = (p.x - drag.last.x) / drag.rect.w;
  const dy = (p.y - drag.last.y) / drag.rect.h;
  if (Math.abs(dx) + Math.abs(dy) > 0.0005) drag.moved = true;
  drag.panel.ox += dx;
  drag.panel.oy += dy;
  drag.last = p;
  drawPreview();
});
stage.addEventListener("pointerup", () => {
  drag = null;
});

// Screenshot mode: ?shot=cover renders one full-frame cover, ?shot=editor
// shows the editor. Optional params: size=square|portrait|wide,
// layout=hero|grid|full, grade=sunset|neon|teal, caption=..., subtitle=...
const params = new URLSearchParams(location.search);
const shot = params.get("shot");
if (params.get("layout") && ["hero", "grid", "full"].includes(params.get("layout"))) {
  state.layout = params.get("layout");
}
if (params.get("grade") && GRADES[params.get("grade")]) state.grade = params.get("grade");
if (params.get("size") && SIZES[params.get("size")]) state.size = params.get("size");
if (params.get("caption")) {
  state.caption = params.get("caption");
  document.getElementById("captionInput").value = state.caption;
}
if (params.get("subtitle") !== null && params.get("subtitle") !== undefined) {
  state.subtitle = params.get("subtitle");
  document.getElementById("subtitleInput").value = state.subtitle;
}
rebuildPanels();

async function boot() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch (err) {
    // Fall back to system fonts; the cover still draws.
  }
  await initPhotos();
  if (shot === "cover") {
    document.querySelector(".topbar").hidden = true;
    document.getElementById("editor").hidden = true;
    const mode = document.getElementById("coverMode");
    mode.hidden = false;
    coverCanvas.width = window.innerWidth;
    coverCanvas.height = window.innerHeight;
    document.body.style.background = "#0d0a14";
    drawCover(coverCanvas.getContext("2d"), coverCanvas.width, coverCanvas.height);
    document.title = "Neon Shore cover";
  }
  window.__neonShoreReady = true;
}

boot();
