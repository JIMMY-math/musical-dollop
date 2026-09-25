/* =========================================================
 * 量子物理教学演示 - 主应用逻辑
 * 架构：HTML/CSS/JS 前端 + Pyodide (Python/numpy) 计算引擎
 * =======================================================*/

// ============ 演示实验数据 ============
const demos = [
  {
    id: 'well',
    title: '一维无限深势阱',
    category: '波动力学',
    description: '粒子被限制在一维无限深势阱中，其能量是量子化的。本演示展示不同量子数 n 下的波函数 ψ(x) 与概率密度 |ψ(x)|²。',
    formula: '$$\\psi_n(x) = \\sqrt{\\frac{2}{L}}\\sin\\left(\\frac{n\\pi x}{L}\\right), \\quad E_n = \\frac{n^2\\pi^2\\hbar^2}{2mL^2}$$',
    controls: [
      { key: 'n', label: '量子数 n', min: 1, max: 10, step: 1, value: 2 },
      { key: 'L', label: '势阱宽度 L', min: 1, max: 10, step: 0.5, value: 5 }
    ]
  },
  {
    id: 'doubleslit',
    title: '双缝干涉',
    category: '干涉与衍射',
    description: '单色光通过双缝后在屏幕上形成明暗相间的干涉条纹。演示改变缝间距、缝宽和波长对干涉图样的影响。',
    formula: '$$I(\\theta) = I_0 \\cos^2\\!\\left(\\frac{\\pi d \\sin\\theta}{\\lambda}\\right) \\cdot \\mathrm{sinc}^2\\!\\left(\\frac{\\pi a \\sin\\theta}{\\lambda}\\right)$$',
    controls: [
      { key: 'd', label: '缝间距 d (μm)', min: 10, max: 200, step: 5, value: 50 },
      { key: 'a', label: '缝宽 a (μm)', min: 1, max: 50, step: 1, value: 10 },
      { key: 'lambda', label: '波长 λ (nm)', min: 380, max: 750, step: 10, value: 550 }
    ]
  },
  {
    id: 'tunneling',
    title: '量子隧穿效应',
    category: '量子效应',
    description: '微观粒子有一定概率穿越高于其能量的势垒，这是经典力学无法解释的量子现象。演示势垒高度、宽度对透射概率的影响。',
    formula: '$$T = \\frac{1}{1 + \\dfrac{V_0^2 \\sinh^2(\\kappa L)}{4E(V_0-E)}}, \\quad \\kappa = \\sqrt{\\frac{2m(V_0-E)}{\\hbar^2}}$$',
    controls: [
      { key: 'E', label: '粒子能量 E', min: 0.1, max: 2.0, step: 0.05, value: 0.8 },
      { key: 'V0', label: '势垒高度 V₀', min: 0.5, max: 3.0, step: 0.05, value: 1.5 },
      { key: 'L', label: '势垒宽度 L', min: 0.5, max: 5.0, step: 0.1, value: 2.0 }
    ]
  },
  {
    id: 'uncertainty',
    title: '测不准原理',
    category: '基本原理',
    description: '位置与动量不能同时被精确确定。演示高斯波包在位置空间和动量空间的分布，验证 Δx·Δp ≥ ℏ/2。',
    formula: '$$\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}, \\quad \\tilde{\\psi}(p) = \\frac{1}{\\sqrt{2\\pi\\hbar}}\\int \\psi(x) e^{-ipx/\\hbar} dx$$',
    controls: [
      { key: 'sigma', label: '波包宽度 σ', min: 0.3, max: 3.0, step: 0.1, value: 1.0 }
    ]
  }
];

// ============ 全局状态 ============
const state = {
  pyodide: null,
  pyodideReady: false,
  filter: '全部',
  searchQuery: '',
  currentDemo: null,
  currentParams: {},
  animating: false,
  animationId: null,
  t: 0
};

// ============ DOM 元素 ============
const grid = document.getElementById('grid');
const searchInput = document.getElementById('searchInput');
const template = document.getElementById('tile-template');
const pyodideStatus = document.getElementById('pyodideStatus');

const demoModal = document.getElementById('demoModal');
const demoTitle = document.getElementById('demoTitle');
const demoCategory = document.getElementById('demoCategory');
const demoClose = document.getElementById('demoClose');
const demoBackdrop = demoModal.querySelector('.demo-backdrop');
const demoCanvas = document.getElementById('demoCanvas');
const demoFormula = document.getElementById('demoFormula');
const controlPanel = document.getElementById('controlPanel');
const demoDescription = document.getElementById('demoDescription');
const resetBtn = document.getElementById('resetBtn');
const animateBtn = document.getElementById('animateBtn');

const demoCtx = demoCanvas.getContext('2d');

// ============ Pyodide 初始化 ============
async function initPyodide() {
  try {
    pyodideStatus.textContent = 'Python 引擎加载中...';
    pyodideStatus.className = 'status-badge status-loading';

    state.pyodide = await loadPyodide();
    await state.pyodide.loadPackage('numpy');

    // 注入通用计算函数到 Python 全局命名空间
    state.pyodide.runPython(`
import numpy as np
import json

def well_wavefunction(n, L, N=500):
    """一维无限深势阱波函数"""
    x = np.linspace(0, L, N)
    psi = np.sqrt(2.0/L) * np.sin(n * np.pi * x / L)
    prob = psi**2
    E = (n**2 * np.pi**2) / (2.0 * L**2)  # 取 ℏ=m=1
    return x.tolist(), psi.tolist(), prob.tolist(), float(E)

def double_slit(d, a, lam, N=800, screen_width=0.02, D=1.0):
    """双缝干涉强度分布 (单位: d,a 微米, lam 纳米)"""
    d_m = d * 1e-6
    a_m = a * 1e-6
    lam_m = lam * 1e-9
    y = np.linspace(-screen_width/2, screen_width/2, N)
    sin_theta = y / np.sqrt(y**2 + D**2)
    beta = np.pi * a_m * sin_theta / lam_m
    alpha = np.pi * d_m * sin_theta / lam_m
    sinc_beta = np.sinc(beta / np.pi)  # numpy sinc 定义为 sin(pi x)/(pi x)
    intensity = (np.cos(alpha)**2) * (sinc_beta**2)
    intensity = intensity / np.max(intensity)
    return y.tolist(), intensity.tolist()

def tunneling(E, V0, L, N=600, x_range=8):
    """量子隧穿：方势垒的透射系数与波函数"""
    if E >= V0:
        # 能量高于势垒，使用振荡解
        k = np.sqrt(2.0 * E)
        kappa = np.sqrt(2.0 * (E - V0))
        denom = 4 * E * (E - V0) + V0**2 * np.sin(kappa * L)**2
        T = 4 * E * (E - V0) / denom if denom > 0 else 0.0
    else:
        kappa = np.sqrt(2.0 * (V0 - E))
        k = np.sqrt(2.0 * E)
        sinh_term = np.sinh(kappa * L)
        denom = 4 * E * (V0 - E) + V0**2 * sinh_term**2
        T = 4 * E * (V0 - E) / denom if denom > 0 else 0.0

    # 构造波函数示意（三段：入射/势垒内/透射）
    x = np.linspace(-x_range/2, x_range/2, N)
    psi = np.zeros(N)
    # 入射区
    mask1 = x < -L/2
    psi[mask1] = np.sin(k * (x[mask1] + L/2)) * 0.8 + 0.2
    # 势垒区
    mask2 = (x >= -L/2) & (x <= L/2)
    if E < V0:
        psi[mask2] = np.exp(-kappa * (x[mask2] + L/2)) * 0.5
    else:
        psi[mask2] = np.sin(kappa * (x[mask2] + L/2)) * 0.5
    # 透射区
    mask3 = x > L/2
    amp = np.sqrt(T)
    psi[mask3] = amp * np.sin(k * (x[mask3] - L/2)) * 0.8
    psi = psi / np.max(np.abs(psi) + 1e-9)
    return x.tolist(), psi.tolist(), float(T)

def uncertainty(sigma, N=800, x_range=10):
    """测不准原理：高斯波包及其傅里叶变换"""
    x = np.linspace(-x_range/2, x_range/2, N)
    dx = x[1] - x[0]
    # 位置空间高斯波包
    psi_x = np.exp(-x**2 / (4 * sigma**2))
    psi_x = psi_x / np.sqrt(np.sum(np.abs(psi_x)**2) * dx)
    prob_x = np.abs(psi_x)**2
    # 动量空间（傅里叶变换）
    p = np.fft.fftfreq(N, d=dx) * 2 * np.pi
    psi_p = np.fft.fftshift(np.fft.fft(psi_x))
    p = np.fft.fftshift(p)
    prob_p = np.abs(psi_p)**2
    prob_p = prob_p / (np.sum(prob_p) * (p[1]-p[0]))
    # 计算不确定度
    delta_x = np.sqrt(np.sum((x**2) * prob_x) * dx)
    dp = p[1] - p[0]
    delta_p = np.sqrt(np.sum((p**2) * prob_p) * dp)
    product = delta_x * delta_p
    return (x.tolist(), prob_x.tolist(), p.tolist(), prob_p.tolist(),
            float(delta_x), float(delta_p), float(product))
`);

    state.pyodideReady = true;
    pyodideStatus.textContent = '✓ Python 引擎就绪';
    pyodideStatus.className = 'status-badge status-ready';
  } catch (err) {
    console.error('Pyodide 初始化失败:', err);
    pyodideStatus.textContent = '⚠ Python 加载失败';
    pyodideStatus.className = 'status-badge status-error';
  }
}

// ============ 渲染卡片网格 ============
function renderGrid() {
  grid.innerHTML = '';
  let items = demos;

  if (state.filter !== '全部') {
    items = items.filter(d => d.category === state.filter);
  }
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    items = items.filter(d =>
      d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    const el = document.createElement('div');
    el.className = 'loading';
    el.textContent = '未找到匹配的演示实验';
    grid.appendChild(el);
    return;
  }

  items.forEach(demo => {
    const node = template.content.cloneNode(true);
    const tile = node.querySelector('.tile');
    const title = node.querySelector('.title');
    const category = node.querySelector('.category');
    const canvas = node.querySelector('.tile-canvas');
    const openBtn = node.querySelector('.open-btn');

    title.textContent = demo.title;
    category.textContent = demo.category;

    tile.addEventListener('click', () => openDemo(demo));
    openBtn.addEventListener('click', (e) => { e.stopPropagation(); openDemo(demo); });

    grid.appendChild(node);
    drawThumbnail(canvas, demo);
  });
}

// ============ 卡片缩略图绘制 ============
function drawThumbnail(canvas, demo) {
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const cw = w / 2, ch = h / 2;

  // 深色背景
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, cw, ch);

  // 根据演示类型绘制示意图
  if (demo.id === 'well') {
    drawWellThumb(ctx, cw, ch);
  } else if (demo.id === 'doubleslit') {
    drawDoubleSlitThumb(ctx, cw, ch);
  } else if (demo.id === 'tunneling') {
    drawTunnelingThumb(ctx, cw, ch);
  } else if (demo.id === 'uncertainty') {
    drawUncertaintyThumb(ctx, cw, ch);
  }
}

function drawWellThumb(ctx, w, h) {
  const cx = w / 2, cy = h / 2;
  // 势阱边界
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.2);
  ctx.lineTo(w * 0.2, h * 0.8);
  ctx.lineTo(w * 0.8, h * 0.8);
  ctx.lineTo(w * 0.8, h * 0.2);
  ctx.stroke();
  // 波函数
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const x = w * 0.2 + t * w * 0.6;
    const y = cy - Math.sin(t * Math.PI * 3) * h * 0.2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDoubleSlitThumb(ctx, w, h) {
  const cy = h / 2;
  // 干涉条纹
  for (let i = 0; i < 20; i++) {
    const x = (i / 20) * w;
    const intensity = Math.cos((i / 20) * Math.PI * 8) ** 2;
    ctx.fillStyle = `rgba(0,255,136,${intensity * 0.8})`;
    ctx.fillRect(x, cy - h * 0.3, w / 20, h * 0.6);
  }
}

function drawTunnelingThumb(ctx, w, h) {
  const cy = h / 2;
  // 势垒
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(w * 0.4, h * 0.15, w * 0.2, h * 0.7);
  // 波函数
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const x = t * w;
    let y;
    if (t < 0.4) y = cy - Math.sin(t * 20) * h * 0.15;
    else if (t < 0.6) y = cy - Math.exp(-(t - 0.4) * 30) * h * 0.1;
    else y = cy - Math.sin((t - 0.6) * 20) * h * 0.06;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawUncertaintyThumb(ctx, w, h) {
  const cx = w / 2, cy = h / 2;
  // 位置空间高斯
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = (i / 100 - 0.5) * 2;
    const x = cx + t * w * 0.4;
    const y = cy - Math.exp(-t * t * 4) * h * 0.3;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // 动量空间高斯（虚线）
  ctx.strokeStyle = '#4a9eff';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = (i / 100 - 0.5) * 2;
    const x = cx + t * w * 0.4;
    const y = cy + Math.exp(-t * t * 1) * h * 0.25;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ============ 打开演示弹窗 ============
function openDemo(demo) {
  if (!state.pyodideReady) {
    alert('Python 计算引擎尚未加载完成，请稍候...');
    return;
  }
  state.currentDemo = demo;
  state.t = 0;
  stopAnimation();

  demoTitle.textContent = demo.title;
  demoCategory.textContent = demo.category;
  demoDescription.textContent = demo.description;

  // 渲染公式
  if (window.katex && demo.formula) {
    try {
      demoFormula.innerHTML = '';
      katex.render(demo.formula.replace(/\$\$/g, ''), demoFormula, {
        throwOnError: false,
        displayMode: true
      });
    } catch (e) {
      demoFormula.textContent = demo.formula;
    }
  } else {
    demoFormula.textContent = demo.formula;
  }

  // 初始化参数
  state.currentParams = {};
  demo.controls.forEach(c => { state.currentParams[c.key] = c.value; });

  // 渲染控件
  renderControls(demo);

  // 显示弹窗
  demoModal.style.display = 'block';
  requestAnimationFrame(() => {
    resizeDemoCanvas();
    updateDemo();
  });
}

function closeDemo() {
  stopAnimation();
  demoModal.style.display = 'none';
  state.currentDemo = null;
}

function resizeDemoCanvas() {
  const wrap = demoCanvas.parentElement;
  demoCanvas.width = wrap.clientWidth * 2;
  demoCanvas.height = wrap.clientHeight * 2;
  demoCtx.setTransform(1, 0, 0, 1, 0, 0);
  demoCtx.scale(2, 2);
}

// ============ 渲染参数控件 ============
function renderControls(demo) {
  controlPanel.innerHTML = '';
  demo.controls.forEach(ctrl => {
    const group = document.createElement('div');
    group.className = 'control-group';
    group.innerHTML = `
      <label>
        <span>${ctrl.label}</span>
        <span id="val-${ctrl.key}">${ctrl.value}</span>
      </label>
      <input type="range" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${ctrl.value}" data-key="${ctrl.key}">
    `;
    const input = group.querySelector('input');
    input.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.currentParams[ctrl.key] = val;
      const valEl = document.getElementById(`val-${ctrl.key}`);
      if (valEl) valEl.textContent = ctrl.step < 1 ? val.toFixed(2) : val;
      updateDemo();
    });
    controlPanel.appendChild(group);
  });
}

// ============ 调用 Python 计算并绘制 ============
async function updateDemo() {
  if (!state.currentDemo) return;
  const demo = state.currentDemo;
  const p = state.currentParams;
  const w = demoCanvas.width / 2;
  const h = demoCanvas.height / 2;

  try {
    if (demo.id === 'well') {
      const result = state.pyodide.globals.get('well_wavefunction')(p.n, p.L);
      const [x, psi, prob, E] = result.toJs();
      drawWell(w, h, x, psi, prob, E, p.n, p.L);
    } else if (demo.id === 'doubleslit') {
      const result = state.pyodide.globals.get('double_slit')(p.d, p.a, p.lambda);
      const [y, intensity] = result.toJs();
      drawDoubleSlit(w, h, y, intensity, p.lambda);
    } else if (demo.id === 'tunneling') {
      const result = state.pyodide.globals.get('tunneling')(p.E, p.V0, p.L);
      const [x, psi, T] = result.toJs();
      drawTunneling(w, h, x, psi, T, p.E, p.V0, p.L);
    } else if (demo.id === 'uncertainty') {
      const result = state.pyodide.globals.get('uncertainty')(p.sigma);
      const [x, prob_x, p_vals, prob_p, dx, dp, product] = result.toJs();
      drawUncertainty(w, h, x, prob_x, p_vals, prob_p, dx, dp, product);
    }
  } catch (err) {
    console.error('计算失败:', err);
  }
}

// ============ 绘制：一维势阱 ============
function drawWell(w, h, x, psi, prob, E, n, L) {
  demoCtx.fillStyle = '#0d1b2a';
  demoCtx.fillRect(0, 0, w, h);

  const pad = 40;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  // 绘制势阱边界
  demoCtx.strokeStyle = '#4a9eff';
  demoCtx.lineWidth = 3;
  demoCtx.beginPath();
  demoCtx.moveTo(pad, pad);
  demoCtx.lineTo(pad, pad + plotH);
  demoCtx.lineTo(pad + plotW, pad + plotH);
  demoCtx.lineTo(pad + plotW, pad);
  demoCtx.stroke();

  // 坐标轴标签
  demoCtx.fillStyle = '#ccc';
  demoCtx.font = '12px sans-serif';
  demoCtx.fillText('x', pad + plotW + 8, pad + plotH);
  demoCtx.fillText('0', pad - 8, pad + plotH + 14);
  demoCtx.fillText(`L=${L}`, pad + plotW - 20, pad + plotH + 14);

  // 绘制波函数 ψ(x)
  const xMin = x[0], xMax = x[x.length - 1];
  const psiMax = Math.max(...psi.map(Math.abs));
  demoCtx.strokeStyle = '#00ff88';
  demoCtx.lineWidth = 2;
  demoCtx.beginPath();
  for (let i = 0; i < x.length; i++) {
    const px = pad + ((x[i] - xMin) / (xMax - xMin)) * plotW;
    const py = pad + plotH / 2 - (psi[i] / psiMax) * (plotH / 2 - 10);
    if (i === 0) demoCtx.moveTo(px, py); else demoCtx.lineTo(px, py);
  }
  demoCtx.stroke();

  // 绘制概率密度 |ψ|²
  const probMax = Math.max(...prob);
  demoCtx.strokeStyle = '#ff6b6b';
  demoCtx.lineWidth = 2;
  demoCtx.setLineDash([4, 4]);
  demoCtx.beginPath();
  for (let i = 0; i < x.length; i++) {
    const px = pad + ((x[i] - xMin) / (xMax - xMin)) * plotW;
    const py = pad + plotH - (prob[i] / probMax) * (plotH / 2 - 10);
    if (i === 0) demoCtx.moveTo(px, py); else demoCtx.lineTo(px, py);
  }
  demoCtx.stroke();
  demoCtx.setLineDash([]);

  // 图例与信息
  demoCtx.fillStyle = '#00ff88';
  demoCtx.fillText('─ ψ(x)', pad, pad - 18);
  demoCtx.fillStyle = '#ff6b6b';
  demoCtx.fillText('┄ |ψ|²', pad + 70, pad - 18);
  demoCtx.fillStyle = '#fff';
  demoCtx.font = '13px sans-serif';
  demoCtx.fillText(`n = ${n}`, pad + 140, pad - 18);
  demoCtx.fillText(`Eₙ = ${E.toFixed(3)} (ℏ²/2mL²)`, pad + 200, pad - 18);
}

// ============ 绘制：双缝干涉 ============
function drawDoubleSlit(w, h, y, intensity, lambda) {
  demoCtx.fillStyle = '#0d1b2a';
  demoCtx.fillRect(0, 0, w, h);

  const pad = 40;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  // 干涉条纹图（上方）
  const stripH = plotH * 0.35;
  const yMin = y[0], yMax = y[y.length - 1];
  for (let i = 0; i < intensity.length; i++) {
    const px = pad + ((y[i] - yMin) / (yMax - yMin)) * plotW;
    const barW = plotW / intensity.length + 0.5;
    // 波长颜色映射
    const color = wavelengthToColor(lambda);
    demoCtx.fillStyle = `rgba(${color.r},${color.g},${color.b},${intensity[i]})`;
    demoCtx.fillRect(px, pad, barW, stripH);
  }

  // 强度曲线（下方）
  demoCtx.strokeStyle = '#00ff88';
  demoCtx.lineWidth = 2;
  demoCtx.beginPath();
  for (let i = 0; i < y.length; i++) {
    const px = pad + ((y[i] - yMin) / (yMax - yMin)) * plotW;
    const py = pad + plotH - intensity[i] * (plotH * 0.55);
    if (i === 0) demoCtx.moveTo(px, py); else demoCtx.lineTo(px, py);
  }
  demoCtx.stroke();

  // 基线
  demoCtx.strokeStyle = '#444';
  demoCtx.lineWidth = 1;
  demoCtx.beginPath();
  demoCtx.moveTo(pad, pad + plotH);
  demoCtx.lineTo(pad + plotW, pad + plotH);
  demoCtx.stroke();

  demoCtx.fillStyle = '#fff';
  demoCtx.font = '13px sans-serif';
  demoCtx.fillText(`λ = ${lambda} nm`, pad, pad - 18);
}

// 波长转 RGB 颜色
function wavelengthToColor(wl) {
  let r = 0, g = 0, b = 0;
  if (wl >= 380 && wl < 440) { r = -(wl - 440) / (440 - 380); g = 0; b = 1; }
  else if (wl >= 440 && wl < 490) { r = 0; g = (wl - 440) / (490 - 440); b = 1; }
  else if (wl >= 490 && wl < 510) { r = 0; g = 1; b = -(wl - 510) / (510 - 490); }
  else if (wl >= 510 && wl < 580) { r = (wl - 510) / (580 - 510); g = 1; b = 0; }
  else if (wl >= 580 && wl < 645) { r = 1; g = -(wl - 645) / (645 - 580); b = 0; }
  else if (wl >= 645 && wl <= 750) { r = 1; g = 0; b = 0; }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// ============ 绘制：隧穿效应 ============
function drawTunneling(w, h, x, psi, T, E, V0, L) {
  demoCtx.fillStyle = '#0d1b2a';
  demoCtx.fillRect(0, 0, w, h);

  const pad = 40;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;
  const xMin = x[0], xMax = x[x.length - 1];

  // 绘制势垒
  const barrierCenter = (xMax + xMin) / 2;
  const bx1 = pad + ((barrierCenter - L / 2 - xMin) / (xMax - xMin)) * plotW;
  const bx2 = pad + ((barrierCenter + L / 2 - xMin) / (xMax - xMin)) * plotW;
  const barrierH = (V0 / 3) * (plotH * 0.7);
  demoCtx.fillStyle = 'rgba(255,107,107,0.3)';
  demoCtx.fillRect(bx1, pad + plotH - barrierH, bx2 - bx1, barrierH);
  demoCtx.strokeStyle = '#ff6b6b';
  demoCtx.lineWidth = 2;
  demoCtx.strokeRect(bx1, pad + plotH - barrierH, bx2 - bx1, barrierH);

  // 粒子能量线
  const energyY = pad + plotH - (E / 3) * (plotH * 0.7);
  demoCtx.strokeStyle = '#ffd93d';
  demoCtx.setLineDash([5, 5]);
  demoCtx.lineWidth = 2;
  demoCtx.beginPath();
  demoCtx.moveTo(pad, energyY);
  demoCtx.lineTo(pad + plotW, energyY);
  demoCtx.stroke();
  demoCtx.setLineDash([]);

  // 波函数
  const psiMax = Math.max(...psi.map(Math.abs));
  demoCtx.strokeStyle = '#00ff88';
  demoCtx.lineWidth = 2;
  demoCtx.beginPath();
  for (let i = 0; i < x.length; i++) {
    const px = pad + ((x[i] - xMin) / (xMax - xMin)) * plotW;
    const py = pad + plotH / 2 - (psi[i] / psiMax) * (plotH * 0.3);
    if (i === 0) demoCtx.moveTo(px, py); else demoCtx.lineTo(px, py);
  }
  demoCtx.stroke();

  // 标签
  demoCtx.fillStyle = '#ff6b6b';
  demoCtx.font = '12px sans-serif';
  demoCtx.fillText(`V₀`, bx2 + 4, pad + plotH - barrierH + 4);
  demoCtx.fillStyle = '#ffd93d';
  demoCtx.fillText(`E`, pad + 4, energyY - 4);
  demoCtx.fillStyle = '#00ff88';
  demoCtx.font = '13px sans-serif';
  demoCtx.fillText(`透射概率 T = ${(T * 100).toFixed(2)}%`, pad, pad - 18);
}

// ============ 绘制：测不准原理 ============
function drawUncertainty(w, h, x, prob_x, p_vals, prob_p, dx, dp, product) {
  demoCtx.fillStyle = '#0d1b2a';
  demoCtx.fillRect(0, 0, w, h);

  const pad = 40;
  const halfW = (w - pad * 3) / 2;
  const plotH = h - pad * 2 - 40;

  // 左图：位置空间
  drawGaussianPlot(pad, pad, halfW, plotH, x, prob_x, '#00ff88', '位置空间 |ψ(x)|²', 'x', dx);

  // 右图：动量空间
  drawGaussianPlot(pad * 2 + halfW, pad, halfW, plotH, p_vals, prob_p, '#4a9eff', '动量空间 |φ(p)|²', 'p', dp);

  // 底部不确定度信息
  demoCtx.fillStyle = '#fff';
  demoCtx.font = '14px sans-serif';
  const infoY = h - 20;
  demoCtx.fillStyle = '#00ff88';
  demoCtx.fillText(`Δx = ${dx.toFixed(3)}`, pad, infoY);
  demoCtx.fillStyle = '#4a9eff';
  demoCtx.fillText(`Δp = ${dp.toFixed(3)}`, pad + halfW + 60, infoY);
  demoCtx.fillStyle = product >= 0.49 ? '#ffd93d' : '#ff6b6b';
  demoCtx.fillText(`Δx·Δp = ${product.toFixed(3)}  ${product >= 0.49 ? '(≥ ℏ/2 ✓)' : '(< ℏ/2 ✗)'}`, pad, infoY - 22);
}

function drawGaussianPlot(px, py, pw, ph, x, data, color, title, xlabel, delta) {
  const xMin = x[0], xMax = x[x.length - 1];
  const yMax = Math.max(...data);

  // 填充
  demoCtx.fillStyle = color + '33';
  demoCtx.beginPath();
  for (let i = 0; i < x.length; i++) {
    const cx = px + ((x[i] - xMin) / (xMax - xMin)) * pw;
    const cy = py + ph - (data[i] / yMax) * ph;
    if (i === 0) demoCtx.moveTo(cx, cy); else demoCtx.lineTo(cx, cy);
  }
  demoCtx.lineTo(px + pw, py + ph);
  demoCtx.lineTo(px, py + ph);
  demoCtx.closePath();
  demoCtx.fill();

  // 曲线
  demoCtx.strokeStyle = color;
  demoCtx.lineWidth = 2;
  demoCtx.beginPath();
  for (let i = 0; i < x.length; i++) {
    const cx = px + ((x[i] - xMin) / (xMax - xMin)) * pw;
    const cy = py + ph - (data[i] / yMax) * ph;
    if (i === 0) demoCtx.moveTo(cx, cy); else demoCtx.lineTo(cx, cy);
  }
  demoCtx.stroke();

  // Δ 标注（半高宽）
  const halfMax = yMax / 2;
  let leftIdx = data.findIndex(v => v >= halfMax);
  let rightIdx = data.length - 1 - [...data].reverse().findIndex(v => v >= halfMax);
  if (leftIdx >= 0 && rightIdx < data.length && rightIdx > leftIdx) {
    const lx = px + ((x[leftIdx] - xMin) / (xMax - xMin)) * pw;
    const rx = px + ((x[rightIdx] - xMin) / (xMax - xMin)) * pw;
    const ly = py + ph - halfMax / yMax * ph;
    demoCtx.strokeStyle = color;
    demoCtx.lineWidth = 1;
    demoCtx.setLineDash([3, 3]);
    demoCtx.beginPath();
    demoCtx.moveTo(lx, ly);
    demoCtx.lineTo(rx, ly);
    demoCtx.stroke();
    demoCtx.setLineDash([]);
    demoCtx.fillStyle = color;
    demoCtx.font = '11px sans-serif';
    demoCtx.fillText(`Δ≈${delta.toFixed(2)}`, (lx + rx) / 2 - 20, ly - 4);
  }

  // 标题
  demoCtx.fillStyle = '#fff';
  demoCtx.font = '13px sans-serif';
  demoCtx.fillText(title, px, py - 8);
}

// ============ 动画控制 ============
function startAnimation() {
  if (state.animating) return;
  state.animating = true;
  animateBtn.textContent = '⏸ 暂停动画';
  animateBtn.classList.remove('button-primary');

  function tick() {
    if (!state.animating) return;
    state.t += 0.05;
    // 简单的相位动画：在波函数上叠加时间演化因子
    updateDemoAnimated();
    state.animationId = requestAnimationFrame(tick);
  }
  tick();
}

function stopAnimation() {
  state.animating = false;
  if (state.animationId) cancelAnimationFrame(state.animationId);
  animateBtn.textContent = '▶ 播放动画';
  animateBtn.classList.add('button-primary');
}

// 带时间演化的绘制（仅势阱支持）
async function updateDemoAnimated() {
  if (!state.currentDemo || state.currentDemo.id !== 'well') {
    updateDemo();
    return;
  }
  const demo = state.currentDemo;
  const p = state.currentParams;
  const w = demoCanvas.width / 2;
  const h = demoCanvas.height / 2;
  try {
    const result = state.pyodide.globals.get('well_wavefunction')(p.n, p.L);
    const [x, psi, prob, E] = result.toJs();
    // 叠加时间相位 e^(-iEt)，实部 cos(Et)
    const t = state.t;
    const psiT = psi.map(v => v * Math.cos(E * t));
    drawWell(w, h, x, psiT, prob, E, p.n, p.L);
  } catch (err) {
    console.error(err);
  }
}

// ============ 事件绑定 ============
demoClose.addEventListener('click', closeDemo);
demoBackdrop.addEventListener('click', closeDemo);

resetBtn.addEventListener('click', () => {
  if (!state.currentDemo) return;
  state.currentDemo.controls.forEach(c => { state.currentParams[c.key] = c.value; });
  renderControls(state.currentDemo);
  stopAnimation();
  state.t = 0;
  updateDemo();
});

animateBtn.addEventListener('click', () => {
  if (state.animating) stopAnimation();
  else startAnimation();
});

// 搜索
searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  renderGrid();
});

// 分类标签
document.querySelectorAll('.category-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.filter = tab.dataset.category;
    renderGrid();
  });
});

// 窗口大小变化时重绘画布
window.addEventListener('resize', () => {
  if (demoModal.style.display === 'block') {
    resizeDemoCanvas();
    updateDemo();
  }
  // 重绘缩略图
  document.querySelectorAll('.tile-canvas').forEach(c => {
    const demo = demos.find(d => d.title === c.closest('.tile').querySelector('.title').textContent);
    if (demo) drawThumbnail(c, demo);
  });
});

// ESC 关闭弹窗
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && demoModal.style.display === 'block') closeDemo();
});

// ============ 初始化 ============
initPyodide();
renderGrid();
