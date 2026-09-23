// 放烟花 —— Canvas 2D 粒子动画 + 爆炸音效 + 节日文字
// 升空火箭(rise) -> 抵达目标点爆炸(explode，同时播放 boom 音效) -> 粒子受重力/阻力衰减，叠加拖尾发光
// 画布中央叠加一行发光节日文字（data.greeting 可改）

const COLORS = [
  '#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b5179e',
  '#f72585', '#ff9e00', '#7b2ff7', '#00f5d4', '#fefae0'
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

Page({
  data: {
    greeting: '新年快乐', // 画布中央文字，可改成任意文案
    muted: false
  },

  onReady() {
    this.muted = false;
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

  // ===== 音效：代码包内音频，用音频池实现重叠播放 =====
  initAudio() {
    if (this.audioPool) return;
    this.audioPool = [];
    this.audioIdx = 0;
    this.lastSound = 0;
    const N = 5; // 同时最多 5 个爆炸声重叠
    for (let i = 0; i < N; i++) {
      const a = wx.createInnerAudioContext();
      a.src = 'audio/boom.wav'; // 相对 miniprogramRoot 的代码包内音频
      a.obeyMuteSwitch = false;  // 音效不受静音键影响（玩具类小程序惯例）
      a.volume = 0.6;
      a.onError((e) => console.warn('boom audio error', e));
      this.audioPool.push(a);
    }
  },

  destroyAudio() {
    if (!this.audioPool) return;
    this.audioPool.forEach((a) => {
      try { a.destroy(); } catch (e) {}
    });
    this.audioPool = null;
  },

  playBoom() {
    if (this.muted || !this.audioPool) return;
    const now = Date.now();
    if (now - this.lastSound < 90) return; // 节流，避免一帧多爆糊成一片
    this.lastSound = now;
    const a = this.audioPool[this.audioIdx];
    this.audioIdx = (this.audioIdx + 1) % this.audioPool.length;
    try {
      a.stop();
      a.seek(0);
      a.play();
    } catch (e) {}
  },

  onToggleMute() {
    this.muted = !this.muted;
    this.setData({ muted: this.muted });
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

    // 点击处爆炸
    this.launch(x, y);
    // 追加两发随机，热闹些
    this.launch(rand(this.W * 0.12, this.W * 0.88), rand(this.H * 0.12, this.H * 0.45));
    this.launch(rand(this.W * 0.12, this.W * 0.88), rand(this.H * 0.12, this.H * 0.45));
  },

  // 发射一枚火箭：从底部升到 targetY 后爆炸
  launch(x, targetY) {
    if (!this.W) return;
    this.rockets.push({
      x: x != null ? x : rand(this.W * 0.2, this.W * 0.8),
      y: this.H + 8,
      vx: rand(-0.4, 0.4),
      vy: rand(-11.5, -9.5),
      targetY: targetY != null ? targetY : rand(this.H * 0.15, this.H * 0.45),
      color: pick(COLORS)
    });
  },

  // 在 (x,y) 产生一圈爆炸粒子
  explode(x, y, color) {
    const count = 70 + ((Math.random() * 40) | 0);
    const speed = rand(2.4, 3.8);
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
    // 爆炸音效
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
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.08;

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
        this.explode(r.x, r.y, r.color);
        this.rockets.splice(i, 1);
      }
    }

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vy += 0.045;
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

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 节日文字（盖在粒子之上，始终清晰）
    this.drawGreeting();

    this.canvas.requestAnimationFrame((t) => this.loop(t));
  }
});
