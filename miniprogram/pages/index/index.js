// 放烟花 —— Canvas 2D 粒子动画 + 真实感烟花音效 + 节日文字 + 可设置轨迹 + 轰出文字
// 升空火箭(rise) -> 播放「咻」升空声；抵达后爆炸(explode) -> 播放「砰+噼啪」并叠加发光粒子
// 控制面板可切换轨迹模式(随机/扇形/螺旋/心形)并调角度/力度/重力/炸开大小
// 「轰出文字」：火箭升空到中心后，粒子汇聚成文字形状

const COLORS = [
  '#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b5179e',
  '#f72585', '#ff9e00', '#7b2ff7', '#00f5d4', '#fefae0'
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

Page({
  data: {
    greeting: '新年快乐',     // 画布中央文字，可改成任意文案
    muted: false,
    showPanel: false,         // 轨迹控制面板
    trajMode: 'random',       // random | fan | spiral | heart
    angle: 8,                 // 发射角度(度)
    power: 11,                // 发射力度(初速)
    gravity: 8,               // 重力(*0.01)
    spread: 34,               // 炸开大小(/10)
    textInput: '新年快乐'     // 轰出文字内容
  },

  onReady() {
    this.muted = false;
    this.textCache = {};      // 文字采样缓存
    this.fanPhase = 0;        // 扇形扫射相位
    // 同步面板参数
    this.angleDeg = this.data.angle;
    this.power = this.data.power;
    this.gravity = this.data.gravity * 0.01;
    this.spread = this.data.spread / 10;
    this.trajMode = this.data.trajMode;

    this.initAudio();
    this.initCanvas();
  },

  onUnload() {
    this.running = false;
    this.destroyAudio();
  },

  onHide() {
    this.running = false;
  },

  onShow() {
    if (this.canvas && !this.running) {
      this.running = true;
      this.canvas.requestAnimationFrame((t) => this.loop(t));
    }
  },

  // ===== 音效：代码包内两段音频，分别用音频池实现重叠播放 =====
  initAudio() {
    if (this.launchPool) return;
    const mk = (src) => {
      const a = wx.createInnerAudioContext();
      a.src = src;                 // 相对 miniprogramRoot 的代码包内音频
      a.obeyMuteSwitch = false;    // 音效不受静音键影响（玩具类小程序惯例）
      a.volume = 0.6;
      a.onError((e) => console.warn('audio error', src, e));
      return a;
    };
    const N = 4; // 同时最多 4 个同段声音重叠
    this.launchPool = Array.from({ length: N }, () => mk('audio/launch.wav')); // 升空「咻」
    this.boomPool = Array.from({ length: N }, () => mk('audio/boom.wav'));     // 爆炸「砰+噼啪」
    this.launchIdx = 0;
    this.boomIdx = 0;
    this.lastLaunch = 0;
    this.lastBoom = 0;
  },

  destroyAudio() {
    ['launchPool', 'boomPool'].forEach((key) => {
      if (this[key]) {
        this[key].forEach((a) => { try { a.destroy(); } catch (e) {} });
        this[key] = null;
      }
    });
  },

  playLaunch() {
    if (this.muted || !this.launchPool) return;
    const now = Date.now();
    if (now - this.lastLaunch < 120) return; // 节流
    this.lastLaunch = now;
    const a = this.launchPool[this.launchIdx];
    this.launchIdx = (this.launchIdx + 1) % this.launchPool.length;
    try { a.stop(); a.seek(0); a.play(); } catch (e) {}
  },

  playBoom() {
    if (this.muted || !this.boomPool) return;
    const now = Date.now();
    if (now - this.lastBoom < 90) return; // 节流，避免一帧多爆糊成一片
    this.lastBoom = now;
    const a = this.boomPool[this.boomIdx];
    this.boomIdx = (this.boomIdx + 1) % this.boomPool.length;
    try { a.stop(); a.seek(0); a.play(); } catch (e) {}
  },

  onToggleMute() {
    this.muted = !this.muted;
    this.setData({ muted: this.muted });
  },

  // ===== 控制面板交互 =====
  onTogglePanel() {
    this.setData({ showPanel: !this.data.showPanel });
  },

  noop() {},

  setTraj(e) {
    const m = e.currentTarget.dataset.m;
    this.trajMode = m;
    this.setData({ trajMode: m });
  },

  onAngle(e) { this.angleDeg = e.detail.value; this.setData({ angle: e.detail.value }); },
  onPower(e) { this.power = e.detail.value; this.setData({ power: e.detail.value }); },
  onGravity(e) { this.gravity = e.detail.value * 0.01; this.setData({ gravity: e.detail.value }); },
  onSpread(e) { this.spread = e.detail.value / 10; this.setData({ spread: e.detail.value }); },

  onTextInput(e) {
    this.setData({ textInput: e.detail.value });
  },

  // 「轰出文字」：发射一枚直上火箭，到中心后炸成文字
  onBlastText() {
    if (!this.W) return;
    const text = (this.data.textInput || '').trim() || '新年快乐';
    this.setData({ textInput: text });
    this.rockets.push({
      x: this.W / 2,
      y: this.H + 8,
      vx: 0,
      vy: -this.power,
      targetY: this.H * 0.42,
      color: pick(COLORS),
      text: text
    });
    this.playLaunch();
  },

  initCanvas() {
    wx.createSelectorQuery()
      .select('#fw')
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) {
          console.error('未获取到 canvas 节点');
          return;
        }
        const canvas = info.node;
        const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = sys.pixelRatio || 2;
        const W = info.width;
        const H = info.height;

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        this.canvas = canvas;
        this.ctx = ctx;
        this.W = W;
        this.H = H;
        this.rockets = [];
        this.particles = [];
        this.textParticles = [];
        this.lastAuto = 0;
        this.running = true;

        // 首屏先来两发，避免开场空屏
        this.launch(W * 0.3, H * 0.28);
        this.launch(W * 0.7, H * 0.22);

        this.loop(0);
      });
  },

  onTap(e) {
    if (!this.W) return;
    const d = e.detail || {};
    let x = d.x;
    let y = d.y;
    if ((x == null || y == null) && e.touches && e.touches[0]) {
      x = e.touches[0].x;
      y = e.touches[0].y;
    }
    if (x == null) x = this.W / 2;
    if (y == null) y = this.H * 0.3;

    // 点击处发射
    this.launch(x, y);
    // 追加两发随机，热闹些
    this.launch(rand(this.W * 0.12, this.W * 0.88), rand(this.H * 0.12, this.H * 0.45));
    this.launch(rand(this.W * 0.12, this.W * 0.88), rand(this.H * 0.12, this.H * 0.45));
  },

  // 生成引导路径（心形 / 螺旋），单位：屏幕像素
  buildPath(mode, baseX) {
    const W = this.W;
    const H = this.H;
    const pts = [];
    if (mode === 'heart') {
      const cx = baseX != null ? baseX : W / 2;
      const baseY = H * 0.66;
      const s = H * 0.016;
      for (let t = 0; t <= Math.PI * 2 + 0.001; t += 0.06) {
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push({ x: cx + hx * s, y: baseY - hy * s });
      }
    } else if (mode === 'spiral') {
      const cx = baseX != null ? baseX : W / 2;
      const cy = H * 0.74;
      for (let i = 0; i < 150; i++) {
        const a = i * 0.32;
        const r = 8 + i * 0.95;
        pts.push({ x: cx + Math.cos(a) * r, y: cy - i * 2.6 });
      }
    }
    return pts;
  },

  // 发射一枚火箭：从底部升到 targetY 后爆炸（或沿引导路径飞行后爆炸）
  launch(x, targetY) {
    if (!this.W) return;
    const mode = this.trajMode;
    const power = this.power;
    const angle = this.angleDeg;

    // 引导类轨迹：心形 / 螺旋
    if (mode === 'heart' || mode === 'spiral') {
      const baseX = x != null ? x : this.W / 2;
      this.rockets.push({
        guided: true,
        path: this.buildPath(mode, baseX),
        pathIdx: 0,
        speed: 2.2,
        x: baseX,
        y: this.H + 8,
        color: pick(COLORS)
      });
      this.playLaunch();
      return;
    }

    // 物理类轨迹：随机 / 扇形
    let vx;
    if (mode === 'fan') {
      // 在 -35°~35° 之间扫射
      const a = Math.sin(this.fanPhase) * 35 * Math.PI / 180;
      this.fanPhase += 0.45;
      vx = Math.sin(a) * power * 0.13;
    } else {
      vx = rand(-0.5, 0.5) + Math.sin(angle * Math.PI / 180) * power * 0.10;
    }

    this.rockets.push({
      x: x != null ? x : rand(this.W * 0.2, this.W * 0.8),
      y: this.H + 8,
      vx: vx,
      vy: -power,
      targetY: targetY != null ? targetY : rand(this.H * 0.15, this.H * 0.45),
      color: pick(COLORS)
    });
    // 升空「咻」声
    this.playLaunch();
  },

  // 在 (x,y) 产生一圈爆炸粒子
  explode(x, y, color) {
    const count = 70 + ((Math.random() * 40) | 0);
    const speed = this.spread * rand(0.7, 1.0);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + rand(-0.05, 0.05);
      const s = speed * rand(0.35, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: Math.random() < 0.15 ? '#ffffff' : color,
        alpha: 1,
        decay: rand(0.008, 0.016),
        size: rand(1.2, 2.4)
      });
    }
    // 中心闪光
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.4, 1.2);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: '#fff6cc',
        alpha: 1,
        decay: rand(0.02, 0.04),
        size: rand(1, 2)
      });
    }
    // 控制粒子总量，防止低端机卡顿
    const MAX = 1400;
    if (this.particles.length > MAX) {
      this.particles.splice(0, this.particles.length - MAX);
    }
    // 爆炸「砰 + 噼啪」音效
    this.playBoom();
  },

  // 把文字采样成屏幕上的目标点（离屏 canvas 渲染 + 像素采样）
  sampleText(text) {
    if (this.textCache[text]) return this.textCache[text];
    const offW = Math.max(80, Math.ceil(text.length * 50) + 40);
    const offH = 80;
    const off = wx.createOffscreenCanvas({ type: '2d', width: offW, height: offH });
    const octx = off.getContext('2d');
    octx.clearRect(0, 0, offW, offH);
    octx.fillStyle = '#ffffff';
    octx.font = 'bold 44px sans-serif';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(text, offW / 2, offH / 2);

    const data = octx.getImageData(0, 0, offW, offH).data;
    const pts = [];
    const step = 3;
    for (let y = 0; y < offH; y += step) {
      for (let x = 0; x < offW; x += step) {
        const alpha = data[(y * offW + x) * 4 + 3];
        if (alpha > 128) pts.push({ x, y });
      }
    }
    // 点过多则随机抽稀，控制性能
    let sampled = pts;
    if (pts.length > 700) {
      sampled = [];
      const keep = 700 / pts.length;
      for (let i = 0; i < pts.length; i++) {
        if (Math.random() < keep) sampled.push(pts[i]);
      }
    }
    const result = { pts: sampled, offW, offH };
    this.textCache[text] = result;
    return result;
  },

  // 烟花轰出文字：粒子从爆心飞向文字目标点并定格成字
  explodeText(cx, cy, text, color) {
    const { pts, offW, offH } = this.sampleText(text);
    const W = this.W;
    const H = this.H;
    const scale = Math.min((W * 0.82) / offW, (H * 0.34) / offH, 2.2);
    const centerX = W / 2;
    const centerY = H * 0.42;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const tx = centerX + (p.x - offW / 2) * scale;
      const ty = centerY + (p.y - offH / 2) * scale;
      this.textParticles.push({
        x: cx + rand(-30, 30),
        y: cy + rand(-30, 30),
        tx,
        ty,
        alpha: 1,
        decay: rand(0.004, 0.008),
        hold: rand(45, 90),
        color: Math.random() < 0.2 ? '#ffffff' : (Math.random() < 0.5 ? color : pick(COLORS)),
        size: rand(1.4, 2.6)
      });
    }
    // 爆心闪光
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.6, 1.8);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: '#fff6cc',
        alpha: 1,
        decay: rand(0.02, 0.05),
        size: rand(1, 2.4)
      });
    }
    this.playBoom();
  },

  // 画布中央发光节日文字（随烟花轻微呼吸）
  drawGreeting() {
    const ctx = this.ctx;
    const text = this.data.greeting;
    if (!text) return;
    const W = this.W;
    const H = this.H;
    const pulse = 0.80 + 0.12 * Math.sin(Date.now() / 620);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = 'rgba(255,210,120,0.95)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = 'rgba(255,243,205,' + pulse.toFixed(3) + ')';
    ctx.fillText(text, W / 2, H * 0.42);
    ctx.restore();
  },

  loop(ts) {
    if (!this.running) return;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;

    // 半透明黑覆盖 -> 形成拖尾
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(3,4,10,0.20)';
    ctx.fillRect(0, 0, W, H);

    // 叠加发光
    ctx.globalCompositeOperation = 'lighter';

    // 自动放烟花（约每秒一发）
    if (!this.lastAuto || ts - this.lastAuto > 900) {
      this.lastAuto = ts;
      this.launch();
    }

    // 更新火箭
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];

      if (r.guided) {
        // 沿引导路径飞行，拖尾由覆盖层 + 火花共同形成
        r.pathIdx += r.speed;
        const idx = Math.min(Math.floor(r.pathIdx), r.path.length - 1);
        r.x = r.path[idx].x;
        r.y = r.path[idx].y;
        // 沿途撒火花，让轨迹发亮
        this.particles.push({
          x: r.x, y: r.y,
          vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3),
          color: r.color, alpha: 0.9, decay: 0.05, size: 1.6
        });
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.0, 0, Math.PI * 2);
        ctx.fill();
        if (idx >= r.path.length - 1) {
          this.explode(r.x, r.y, r.color);
          this.rockets.splice(i, 1);
        }
        continue;
      }

      // 物理火箭
      r.x += r.vx;
      r.y += r.vy;
      r.vy += this.gravity;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(r.x, r.y + 4, 1.2, 0, Math.PI * 2);
      ctx.fill();

      if (r.y <= r.targetY || r.vy >= 0) {
        if (r.text) {
          this.explodeText(r.x, r.y, r.text, r.color);
        } else {
          this.explode(r.x, r.y, r.color);
        }
        this.rockets.splice(i, 1);
      }
    }

    // 更新普通粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vy += this.gravity * 0.56;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 更新文字粒子：先汇聚成字，定格后渐隐
    for (let i = this.textParticles.length - 1; i >= 0; i--) {
      const p = this.textParticles[i];
      if (p.hold > 0) {
        p.hold--;
        p.x += (p.tx - p.x) * 0.14;
        p.y += (p.ty - p.y) * 0.14;
      } else {
        p.alpha -= p.decay;
        p.x += (p.tx - p.x) * 0.06;
        p.y += (p.ty - p.y) * 0.06;
      }
      if (p.alpha <= 0) {
        this.textParticles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 节日文字（盖在粒子之上，始终清晰）
    this.drawGreeting();

    this.canvas.requestAnimationFrame((t) => this.loop(t));
  }
});
