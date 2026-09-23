// 烟花模拟器 —— 一比一复刻 fangyanhua.top（fork 自 NianBroken/Firework_Simulator）
// 单 canvas 等效双 canvas 物理引擎：用 globalCompositeOperation='lighter' + 半透明黑覆盖形成拖尾。

const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;
const GRAVITY = 0.9;

// ===== 调色板（与 fangyanhua 完全一致）=====
const COLORS = {
  Red: '#ff0043',
  Green: '#14fc56',
  Blue: '#1e7fff',
  Purple: '#e60aff',
  Gold: '#ffbf36',
  White: '#ffffff'
};
const COLOR_CODES = Object.values(COLORS);
const INVISIBLE = '_INVISIBLE_';
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];

// ===== 画质 =====
const QUALITY_LOW = 1, QUALITY_NORMAL = 2, QUALITY_HIGH = 3;

// ===== 照亮天空 =====
const SKY_LIGHT_NONE = 0, SKY_LIGHT_DIM = 1, SKY_LIGHT_NORMAL = 2;

// ===== 全局状态（对应原版 store.config）=====
const SHELL_NAMES = ['Random', 'Crackle', 'Crossette', 'Crysanthemum', 'Falling Leaves', 'Floral', 'Ghost', 'Horse Tail', 'Palm', 'Ring', 'Strobe', 'Willow'];
const SIZE_NAMES = ['3"', '4"', '6"', '8"', '12"', '16"'];
const SCALE_OPTIONS = [0.5, 0.62, 0.75, 0.9, 1.0, 1.5, 2.0];

let lastColor = null;
function randomColorSimple() {
  return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0];
}
function randomColor(options) {
  const notSame = options && options.notSame;
  const notColor = options && options.notColor;
  const limitWhite = options && options.limitWhite;
  let color = randomColorSimple();
  if (limitWhite && color === COLORS.White && Math.random() < 0.6) color = randomColorSimple();
  if (notSame) { while (color === lastColor) color = randomColorSimple(); }
  else if (notColor) { while (color === notColor) color = randomColorSimple(); }
  lastColor = color;
  return color;
}
function whiteOrGold() { return Math.random() < 0.5 ? COLORS.Gold : COLORS.White; }
function makePistilColor(shellColor) {
  return (shellColor === COLORS.White || shellColor === COLORS.Gold) ? randomColor({ notColor: shellColor }) : whiteOrGold();
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(n) { return (Math.random() * n) | 0; }
function pointDist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }
function pointAngle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

// ===== 粒子对象池 =====
function createCollection() {
  const c = {};
  COLOR_CODES_W_INVIS.forEach(color => { c[color] = []; });
  return c;
}

const Star = {
  drawWidth: 3,
  airDrag: 0.98,
  airDragHeavy: 0.992,
  active: createCollection(),
  _pool: [],
  _new() { return {}; },
  add(x, y, color, angle, speed, life, speedOffX, speedOffY) {
    const inst = this._pool.pop() || this._new();
    inst.visible = true;
    inst.heavy = false;
    inst.x = x; inst.y = y;
    inst.prevX = x; inst.prevY = y;
    inst.color = color;
    inst.speedX = Math.sin(angle) * speed + (speedOffX || 0);
    inst.speedY = Math.cos(angle) * speed + (speedOffY || 0);
    inst.life = life;
    inst.fullLife = life;
    inst.spinAngle = Math.random() * PI_2;
    inst.spinSpeed = 0.8;
    inst.spinRadius = 0;
    inst.sparkFreq = 0;
    inst.sparkSpeed = 1;
    inst.sparkTimer = 0;
    inst.sparkColor = color;
    inst.sparkLife = 750;
    inst.sparkLifeVariation = 0.25;
    inst.strobe = false;
    inst.secondColor = null;
    inst.transitionTime = 0;
    inst.colorChanged = false;
    inst.onDeath = null;
    this.active[color].push(inst);
    return inst;
  },
  returnInstance(inst) {
    inst.onDeath && inst.onDeath(inst);
    inst.onDeath = null;
    inst.secondColor = null;
    inst.transitionTime = 0;
    inst.colorChanged = false;
    this._pool.push(inst);
  }
};

const Spark = {
  drawWidth: 0,
  airDrag: 0.9,
  active: createCollection(),
  _pool: [],
  _new() { return {}; },
  add(x, y, color, angle, speed, life) {
    const inst = this._pool.pop() || this._new();
    inst.x = x; inst.y = y;
    inst.prevX = x; inst.prevY = y;
    inst.color = color;
    inst.speedX = Math.sin(angle) * speed;
    inst.speedY = Math.cos(angle) * speed;
    inst.life = life;
    this.active[color].push(inst);
    return inst;
  },
  returnInstance(inst) { this._pool.push(inst); }
};

// ===== 爆心闪光 =====
const BurstFlash = {
  active: [],
  _pool: [],
  add(x, y, radius) {
    const inst = this._pool.pop() || {};
    inst.x = x; inst.y = y; inst.radius = radius;
    inst.life = 1;       // 渐隐系数（1→0）
    inst.decay = 0.11;   // 每帧衰减
    this.active.push(inst);
    return inst;
  },
  returnInstance(inst) { inst.life = 1; inst.decay = 0.11; this._pool.push(inst); }
};

// ===== 各种死亡效果（挂在 star.onDeath）=====
function createParticleArc(start, arcLength, count, randomness, factory) {
  const angleDelta = arcLength / count;
  const end = start + arcLength - angleDelta * 0.5;
  if (end > start) {
    for (let a = start; a < end; a += angleDelta) factory(a + Math.random() * angleDelta * randomness);
  } else {
    for (let a = start; a > end; a += angleDelta) factory(a + Math.random() * angleDelta * randomness);
  }
}
function createBurst(count, factory, startAngle = 0, arcLength = PI_2) {
  const R = 0.5 * Math.sqrt(count / Math.PI);
  const C = 2 * R * Math.PI;
  const C_HALF = C / 2;
  for (let i = 0; i <= C_HALF; i++) {
    const ringAngle = i / C_HALF * PI_HALF;
    const ringSize = Math.cos(ringAngle);
    const partsPerFullRing = C * ringSize;
    const partsPerArc = partsPerFullRing * (arcLength / PI_2);
    const angleInc = PI_2 / partsPerFullRing;
    const angleOffset = Math.random() * angleInc + startAngle;
    const maxRandomAngleOffset = angleInc * 0.33;
    for (let j = 0; j < partsPerArc; j++) {
      const randomAngleOffset = Math.random() * maxRandomAngleOffset;
      const angle = angleInc * j + angleOffset + randomAngleOffset;
      factory(angle, ringSize);
    }
  }
}
function crossetteEffect(star) {
  const startAngle = Math.random() * PI_HALF;
  createParticleArc(startAngle, PI_2, 4, 0.5, (angle) => {
    Star.add(star.x, star.y, star.color, angle, Math.random() * 0.6 + 0.75, 600);
  });
}
function floralEffect(star) {
  const count = 12 + 6 * (state.quality === QUALITY_HIGH ? 3 : state.quality);
  createBurst(count, (angle, speedMult) => {
    Star.add(star.x, star.y, star.color, angle, speedMult * 2.4, 1000 + Math.random() * 300, star.speedX, star.speedY);
  });
  BurstFlash.add(star.x, star.y, 46);
  sound.play('burstSmall', 1);
}
function fallingLeavesEffect(star) {
  createBurst(7, (angle, speedMult) => {
    const ns = Star.add(star.x, star.y, INVISIBLE, angle, speedMult * 2.4, 2400 + Math.random() * 600, star.speedX, star.speedY);
    ns.sparkColor = COLORS.Gold;
    ns.sparkFreq = 144 / state.quality;
    ns.sparkSpeed = 0.28;
    ns.sparkLife = 750;
    ns.sparkLifeVariation = 3.2;
  });
  BurstFlash.add(star.x, star.y, 46);
  sound.play('burstSmall', 1);
}
function crackleEffect(star) {
  const count = state.quality === QUALITY_HIGH ? 32 : 16;
  createParticleArc(0, PI_2, count, 1.8, (angle) => {
    Spark.add(star.x, star.y, COLORS.Gold, angle, Math.pow(Math.random(), 0.45) * 2.4, 300 + Math.random() * 200);
  });
}

// ===== 12 种烟花类型 factory =====
function crysanthemumShell(size = 1) {
  const glitter = Math.random() < 0.25;
  const singleColor = Math.random() < 0.72;
  const color = singleColor ? randomColor({ limitWhite: true }) : [randomColor(), randomColor({ notSame: true })];
  const pistil = singleColor && Math.random() < 0.42;
  const pistilColor = pistil && makePistilColor(color);
  const secondColor = singleColor && (Math.random() < 0.2 || color === COLORS.White) ? (pistilColor || randomColor({ notColor: color, limitWhite: true })) : null;
  const streamers = !pistil && color !== COLORS.White && Math.random() < 0.42;
  let starDensity = glitter ? 1.1 : 1.25;
  if (state.quality === QUALITY_LOW) starDensity *= 0.8;
  if (state.quality === QUALITY_HIGH) starDensity = 1.2;
  return { shellSize: size, spreadSize: 300 + size * 100, starLife: 900 + size * 200, starDensity, color, secondColor, glitter: glitter ? 'light' : '', glitterColor: whiteOrGold(), pistil, pistilColor, streamers };
}
function ringShell(size = 1) {
  const color = randomColor();
  const pistil = Math.random() < 0.75;
  return { shellSize: size, ring: true, color, spreadSize: 300 + size * 100, starLife: 900 + size * 200, starCount: 2.2 * PI_2 * (size + 1), pistil, pistilColor: makePistilColor(color), glitter: !pistil ? 'light' : '', glitterColor: color === COLORS.Gold ? COLORS.Gold : COLORS.White, streamers: Math.random() < 0.3 };
}
function crossetteShell(size = 1) {
  const color = randomColor({ limitWhite: true });
  return { shellSize: size, spreadSize: 300 + size * 100, starLife: 750 + size * 160, starLifeVariation: 0.4, starDensity: 0.85, color, crossette: true, pistil: Math.random() < 0.5, pistilColor: makePistilColor(color) };
}
function floralShell(size = 1) {
  return { shellSize: size, spreadSize: 300 + size * 120, starDensity: 0.12, starLife: 500 + size * 50, starLifeVariation: 0.5, color: Math.random() < 0.65 ? 'random' : (Math.random() < 0.15 ? randomColor() : [randomColor(), randomColor({ notSame: true })]), floral: true };
}
function fallingLeavesShell(size = 1) {
  return { shellSize: size, color: INVISIBLE, spreadSize: 300 + size * 120, starDensity: 0.12, starLife: 500 + size * 50, starLifeVariation: 0.5, glitter: 'medium', glitterColor: COLORS.Gold, fallingLeaves: true };
}
function willowShell(size = 1) {
  return { shellSize: size, spreadSize: 300 + size * 100, starDensity: 0.6, starLife: 3000 + size * 300, glitter: 'willow', glitterColor: COLORS.Gold, color: INVISIBLE };
}
function crackleShell(size = 1) {
  const color = Math.random() < 0.75 ? COLORS.Gold : randomColor();
  return { shellSize: size, spreadSize: 380 + size * 75, starDensity: state.quality === QUALITY_LOW ? 0.65 : 1, starLife: 600 + size * 100, starLifeVariation: 0.32, glitter: 'light', glitterColor: COLORS.Gold, color, crackle: true, pistil: Math.random() < 0.65, pistilColor: makePistilColor(color) };
}
function horsetailShell(size = 1) {
  const color = randomColor();
  return { shellSize: size, horsetail: true, color, spreadSize: 250 + size * 38, starDensity: 0.9, starLife: 2500 + size * 300, glitter: 'medium', glitterColor: Math.random() < 0.5 ? whiteOrGold() : color, strobe: color === COLORS.White };
}
function ghostShell(size = 1) {
  const shell = crysanthemumShell(size);
  shell.starLife *= 1.5;
  const ghostColor = randomColor({ notColor: COLORS.White });
  shell.streamers = true;
  const pistil = Math.random() < 0.42;
  shell.pistil = pistil;
  shell.pistilColor = pistil && makePistilColor(ghostColor);
  shell.color = INVISIBLE;
  shell.secondColor = ghostColor;
  shell.glitter = '';
  return shell;
}
function strobeShell(size = 1) {
  const color = randomColor({ limitWhite: true });
  return { shellSize: size, spreadSize: 280 + size * 92, starLife: 1100 + size * 200, starLifeVariation: 0.40, starDensity: 1.1, color, glitter: 'light', glitterColor: COLORS.White, strobe: true, strobeColor: Math.random() < 0.5 ? COLORS.White : null, pistil: Math.random() < 0.5, pistilColor: makePistilColor(color) };
}
function palmShell(size = 1) {
  const color = randomColor();
  const thick = Math.random() < 0.5;
  return { shellSize: size, color, spreadSize: 250 + size * 75, starDensity: thick ? 0.15 : 0.4, starLife: 1800 + size * 200, glitter: thick ? 'thick' : 'heavy' };
}

const shellTypes = {
  'Random': null, 'Crackle': crackleShell, 'Crossette': crossetteShell, 'Crysanthemum': crysanthemumShell,
  'Falling Leaves': fallingLeavesShell, 'Floral': floralShell, 'Ghost': ghostShell, 'Horse Tail': horsetailShell,
  'Palm': palmShell, 'Ring': ringShell, 'Strobe': strobeShell, 'Willow': willowShell
};
function randomShellName() {
  return Math.random() < 0.5 ? 'Crysanthemum' : SHELL_NAMES[(Math.random() * (SHELL_NAMES.length - 1) + 1) | 0];
}
function randomFastShell() {
  const blacklist = ['Falling Leaves', 'Floral', 'Willow'];
  let name = state.config.shell === 'Random' ? randomShellName() : state.config.shell;
  if (state.config.shell === 'Random') {
    while (blacklist.includes(name)) name = randomShellName();
  }
  return shellTypes[name];
}
function makeShell(name, size) {
  if (name === 'Random') {
    const fn = Math.random() < 0.5 ? crysanthemumShell : randomFastShell();
    return new Shell(fn(size));
  }
  return new Shell(shellTypes[name](size));
}

// ===== Shell 类（火箭升空 + 爆炸）=====
class Shell {
  constructor(options) {
    Object.assign(this, options);
    this.starLifeVariation = options.starLifeVariation || 0.125;
    this.color = options.color || randomColor();
    this.glitterColor = options.glitterColor || this.color;
    if (!this.starCount) {
      const density = options.starDensity || 1;
      const scaledSize = this.spreadSize / 54;
      this.starCount = Math.max(6, scaledSize * scaledSize * density);
    }
  }
  launch(position, launchHeight) {
    const width = state.stageW, height = state.stageH;
    const hpad = 60, vpad = 50;
    const minHeightPercent = 0.45;
    const minHeight = height - height * minHeightPercent;
    const launchX = position * (width - hpad * 2) + hpad;
    const launchY = height;
    const burstY = minHeight - (launchHeight * (minHeight - vpad));
    const launchDistance = launchY - burstY;
    // 火箭上升：在寿命内精确升到 burstY（直线模型，不受重力/阻力影响），避免时间单位错配飞出屏幕
    const riseMs = 1000 + launchDistance * 0.2;
    // Star.add 用 angle=PI → speedY = cos(PI)*speed = -speed，故 speed 取正值时向上
    const riseSpeed = launchDistance / (riseMs / 16.67);
    const comet = this.comet = Star.add(
      launchX, launchY,
      (typeof this.color === 'string' && this.color !== 'random') ? this.color : COLORS.White,
      Math.PI, riseSpeed, riseMs
    );
    comet.noGravity = true;
    comet.heavy = true;
    comet.pureRise = true;
    comet.spinRadius = rand(0.32, 0.85);
    comet.sparkFreq = 32 / state.quality;
    if (state.quality === QUALITY_HIGH) comet.sparkFreq = 8;
    comet.sparkLife = 320;
    comet.sparkLifeVariation = 3;
    if (this.glitter === 'willow' || this.fallingLeaves) {
      comet.sparkFreq = 20 / state.quality;
      comet.sparkSpeed = 0.5;
      comet.sparkLife = 500;
    }
    if (this.color === INVISIBLE) comet.sparkColor = COLORS.Gold;
    if (Math.random() > 0.4 && !this.horsetail) {
      comet.secondColor = INVISIBLE;
      comet.transitionTime = Math.pow(Math.random(), 1.5) * 700 + 500;
    }
    comet.onDeath = (c) => this.burst(c.x, c.y);
    sound.play('lift', 1);
  }
  burst(x, y) {
    const speed = this.spreadSize / 96;
    let color, onDeath, sparkFreq, sparkSpeed, sparkLife;
    let sparkLifeVariation = 0.25;
    let playedDeathSound = false;
    if (this.crossette) onDeath = (star) => {
      if (!playedDeathSound) { sound.play('crackleSmall', 1); playedDeathSound = true; }
      crossetteEffect(star);
    };
    if (this.crackle) onDeath = (star) => {
      if (!playedDeathSound) { sound.play('crackle', 1); playedDeathSound = true; }
      crackleEffect(star);
    };
    if (this.floral) onDeath = floralEffect;
    if (this.fallingLeaves) onDeath = fallingLeavesEffect;

    if (this.glitter === 'light') { sparkFreq = 400; sparkSpeed = 0.3; sparkLife = 300; sparkLifeVariation = 2; }
    else if (this.glitter === 'medium') { sparkFreq = 200; sparkSpeed = 0.44; sparkLife = 700; sparkLifeVariation = 2; }
    else if (this.glitter === 'heavy') { sparkFreq = 80; sparkSpeed = 0.8; sparkLife = 1400; sparkLifeVariation = 2; }
    else if (this.glitter === 'thick') { sparkFreq = 16; sparkSpeed = state.quality === QUALITY_HIGH ? 1.65 : 1.5; sparkLife = 1400; sparkLifeVariation = 3; }
    else if (this.glitter === 'streamer') { sparkFreq = 32; sparkSpeed = 1.05; sparkLife = 620; sparkLifeVariation = 2; }
    else if (this.glitter === 'willow') { sparkFreq = 120; sparkSpeed = 0.34; sparkLife = 1400; sparkLifeVariation = 3.8; }
    sparkFreq = sparkFreq / state.quality;

    let firstStar = true;
    const starFactory = (angle, speedMult) => {
      const standardInitialSpeed = this.spreadSize / 1800;
      const star = Star.add(
        x, y, color || randomColor(),
        angle, speedMult * speed,
        this.starLife + Math.random() * this.starLife * this.starLifeVariation,
        this.horsetail ? (this.comet && this.comet.speedX) : 0,
        this.horsetail ? (this.comet && this.comet.speedY) : -standardInitialSpeed
      );
      if (this.secondColor) {
        star.transitionTime = this.starLife * (Math.random() * 0.05 + 0.32);
        star.secondColor = this.secondColor;
      }
      if (this.strobe) {
        star.transitionTime = this.starLife * (Math.random() * 0.08 + 0.46);
        star.strobe = true;
        star.strobeFreq = Math.random() * 20 + 40;
        if (this.strobeColor) star.secondColor = this.strobeColor;
      }
      star.onDeath = onDeath;
      if (this.glitter) {
        star.sparkFreq = sparkFreq;
        star.sparkSpeed = sparkSpeed;
        star.sparkLife = sparkLife;
        star.sparkLifeVariation = sparkLifeVariation;
        star.sparkColor = this.glitterColor;
        star.sparkTimer = Math.random() * star.sparkFreq;
      }
    };

    if (typeof this.color === 'string') {
      if (this.color === 'random') color = null;
      else color = this.color;
      if (this.ring) {
        const ringStartAngle = Math.random() * Math.PI;
        const ringSquash = Math.pow(Math.random(), 2) * 0.85 + 0.15;
        createParticleArc(0, PI_2, this.starCount, 0, angle => {
          const initSpeedX = Math.sin(angle) * speed * ringSquash;
          const initSpeedY = Math.cos(angle) * speed;
          const newSpeed = pointDist(0, 0, initSpeedX, initSpeedY);
          const newAngle = pointAngle(0, 0, initSpeedX, initSpeedY) + ringStartAngle;
          const star = Star.add(x, y, color, newAngle, newSpeed, this.starLife + Math.random() * this.starLife * this.starLifeVariation);
          if (this.glitter) {
            star.sparkFreq = sparkFreq; star.sparkSpeed = sparkSpeed;
            star.sparkLife = sparkLife; star.sparkLifeVariation = sparkLifeVariation;
            star.sparkColor = this.glitterColor; star.sparkTimer = Math.random() * star.sparkFreq;
          }
        });
      } else {
        createBurst(this.starCount, starFactory);
      }
    } else if (Array.isArray(this.color)) {
      if (Math.random() < 0.5) {
        const start = Math.random() * Math.PI, start2 = start + Math.PI, arc = Math.PI;
        color = this.color[0];
        createBurst(this.starCount, starFactory, start, arc);
        color = this.color[1];
        createBurst(this.starCount, starFactory, start2, arc);
      } else {
        color = this.color[0]; createBurst(this.starCount / 2, starFactory);
        color = this.color[1]; createBurst(this.starCount / 2, starFactory);
      }
    }

    if (this.pistil) {
      const inner = new Shell({ spreadSize: this.spreadSize * 0.5, starLife: this.starLife * 0.6, starLifeVariation: this.starLifeVariation, starDensity: 1.4, color: this.pistilColor, glitter: 'light', glitterColor: this.pistilColor === COLORS.Gold ? COLORS.Gold : COLORS.White });
      inner.burst(x, y);
    }
    if (this.streamers) {
      const inner = new Shell({ spreadSize: this.spreadSize * 0.9, starLife: this.starLife * 0.8, starLifeVariation: this.starLifeVariation, starCount: Math.floor(Math.max(6, this.spreadSize / 45)), color: COLORS.White, glitter: 'streamer' });
      inner.burst(x, y);
    }
    BurstFlash.add(x, y, this.spreadSize / 4);
    if (this.comet) {
      const maxDiff = 2;
      const sizeDiff = Math.min(maxDiff, state.config.size - this.shellSize);
      const soundScale = (1 - sizeDiff / maxDiff) * 0.3 + 0.7;
      sound.play('burst', soundScale);
    }
  }
}

// ===== 音效管理器（InnerAudioContext 池，对应 lift/burst/burstSmall/crackle/crackleSmall）=====
const sound = {
  enabled: true,
  pools: {
    lift: { vol: 1.0, files: ['audio/lift1.mp3', 'audio/lift2.mp3', 'audio/lift3.mp3'], pool: [] },
    burst: { vol: 1.0, files: ['audio/burst1.mp3', 'audio/burst2.mp3'], pool: [] },
    burstSmall: { vol: 0.25, files: ['audio/burst-sm-1.mp3', 'audio/burst-sm-2.mp3'], pool: [] },
    crackle: { vol: 0.2, files: ['audio/crackle1.mp3'], pool: [] },
    crackleSmall: { vol: 0.3, files: ['audio/crackle-sm-1.mp3'], pool: [] }
  },
  _lastSmall: 0,
  init() {
    for (const k in this.pools) {
      const p = this.pools[k];
      p.idx = 0;
      for (let i = 0; i < 4; i++) {
        const a = wx.createInnerAudioContext();
        a.src = p.files[i % p.files.length];
        a.obeyMuteSwitch = false;
        p.pool.push(a);
      }
    }
  },
  play(type, scale = 1) {
    if (!this.enabled) return;
    scale = clamp(scale, 0, 1);
    if (scale <= 0) return;
    if (type === 'burstSmall') {
      const now = Date.now();
      if (now - this._lastSmall < 20) return;
      this._lastSmall = now;
    }
    const p = this.pools[type];
    if (!p) return;
    const a = p.pool[p.idx];
    p.idx = (p.idx + 1) % p.pool.length;
    try {
      a.stop();
      a.volume = p.vol * scale;
      a.seek(0);
      a.play();
    } catch (e) {}
  },
  toggle() { this.enabled = !this.enabled; },
  resume() { this.enabled = true; },
  pause() { this.enabled = false; }
};

// ===== 主状态（对应 store）=====
const state = {
  paused: false,
  menuOpen: false,
  config: {
    shell: 'Random',
    size: 2,
    quality: QUALITY_NORMAL,
    skyLighting: String(SKY_LIGHT_NORMAL),
    scaleFactor: 0.9,
    autoLaunch: true,
    finale: true,
    longExposure: false,
    hideControls: false,
    fullscreen: false
  },
  stageW: 0, stageH: 0,
  quality: QUALITY_NORMAL,
  isLowQuality: false,
  isHighQuality: false,
  currentFrame: 0,
  autoLaunchTime: 0,
  finaleCount: 32,
  currentFinaleCount: 0,
  isFirstSeq: true,
  // 照亮天空
  currentSky: { r: 0, g: 0, b: 0 },
  targetSky: { r: 0, g: 0, b: 0 }
};

// 颜色 → RGB
const COLOR_TUPLES = {};
COLOR_CODES.forEach(hex => {
  const n = parseInt(hex.slice(1), 16);
  COLOR_TUPLES[hex] = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
});
COLOR_TUPLES[INVISIBLE] = { r: 0, g: 0, b: 0 };

// ===== 燃放序列 =====
function seqRandomShell() { const s = new Shell(makeShellConfig(state.config.shell, state.config.size)); s.launch(Math.random(), Math.random()); return 900; }
function seqTwoRandom() { for (let i = 0; i < 2; i++) { const s = new Shell(makeShellConfig(state.config.shell, state.config.size)); s.launch(Math.random(), Math.random()); } return 700; }
function seqTriple() { for (let i = 0; i < 3; i++) { const s = new Shell(makeShellConfig(state.config.shell, state.config.size)); s.launch(Math.random(), Math.random()); } return 700; }
function seqPyramid() {
  const count = 5 + randInt(4);
  for (let i = 0; i < count; i++) {
    const s = new Shell(makeShellConfig(state.config.shell, state.config.size));
    const delay = i * 120;
    setTimeout(() => s.launch(i / (count - 1), 0.4), delay);
  }
  return count * 120 + 1200;
}
function seqSmallBarrage() {
  const count = 8 + randInt(8);
  for (let i = 0; i < count; i++) {
    const s = new Shell(makeShellConfig(state.config.shell, Math.max(0, state.config.size - 1)));
    setTimeout(() => s.launch(Math.random(), Math.random()), i * 60);
  }
  return count * 60 + 1200;
}
function startSequence() {
  if (state.isFirstSeq) {
    state.isFirstSeq = false;
    const s = new Shell(crysanthemumShell(state.config.size));
    s.launch(0.5, 0.5);
    return 2400;
  }
  if (state.config.finale) {
    const s = new Shell(makeShellConfig(state.config.shell, state.config.size));
    s.launch(Math.random(), Math.random());
    if (state.currentFinaleCount < state.finaleCount) { state.currentFinaleCount++; return 170; }
    state.currentFinaleCount = 0; return 6000;
  }
  const r = Math.random();
  if (r < 0.08) return seqSmallBarrage();
  if (r < 0.1) return seqPyramid();
  if (r < 0.6) return seqRandomShell();
  if (r < 0.8) return seqTwoRandom();
  return seqTriple();
}

// 根据配置造一个 shell（Random 时随机）
function makeShellConfig(name, size) {
  if (name === 'Random') {
    const fn = Math.random() < 0.5 ? crysanthemumShell : randomFastShell();
    return fn(size);
  }
  return shellTypes[name](size);
}

// ===== Page =====
Page({
  data: {
    showPanel: false,
    soundOn: true,
    paused: false,
    hideControls: false,
    // 设置项数据
    shellIndex: 0,
    sizeIndex: 2,
    qualityIndex: 1,
    skyIndex: 2,
    scaleIndex: 3,
    shellOptions: SHELL_NAMES,
    sizeOptions: SIZE_NAMES,
    qualityOptions: ['低', '正常', '高'],
    skyOptions: ['不', '暗', '正常'],
    scaleOptions: SCALE_OPTIONS.map(v => (v * 100) + '%'),
    autoLaunch: true,
    finale: true,
    longExposure: false,
    fullscreen: false
  },

  onLoad() {
    // 读取本地设置
    try {
      const saved = wx.getStorageSync('fw_config');
      if (saved) Object.assign(state.config, saved);
    } catch (e) {}
    this.syncConfigToData();
  },

  onReady() {
    this.initAudio();
    this.initCanvas();
    this.applyConfig();
  },

  onUnload() {
    this.running = false;
    if (this.rafId) clearTimeout(this.rafId);
  },

  initAudio() { sound.init(); },

  syncConfigToData() {
    const c = state.config;
    this.setData({
      shellIndex: Math.max(0, SHELL_NAMES.indexOf(c.shell)),
      sizeIndex: clamp(parseInt(c.size), 0, 5),
      qualityIndex: parseInt(c.quality) - 1,
      skyIndex: parseInt(c.skyLighting),
      scaleIndex: Math.max(0, SCALE_OPTIONS.indexOf(parseFloat(c.scaleFactor))),
      autoLaunch: c.autoLaunch,
      finale: c.finale,
      longExposure: c.longExposure,
      hideControls: c.hideControls,
      fullscreen: c.fullscreen
    });
  },

  initCanvas() {
    const q = wx.createSelectorQuery();
    q.select('#fw').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      this.canvas = canvas; this.ctx = ctx; this.dpr = dpr;
      canvas.width = res[0].width * dpr;
      canvas.height = res[0].height * dpr;
      this.cssW = res[0].width; this.cssH = res[0].height;
      this.applyConfig();
      console.log('[fw] canvas css=' + this.cssW + 'x' + this.cssH + ' dpr=' + dpr +
        ' pixel=' + canvas.width + 'x' + canvas.height +
        ' stage=' + Math.round(state.stageW) + 'x' + Math.round(state.stageH));
      this.running = true;
      this.lastTime = Date.now();
      const loop = () => {
        if (!this.running) return;
        const now = Date.now();
        let dt = now - this.lastTime;
        this.lastTime = now;
        if (dt > 50) dt = 50;
        try {
          this.frame(dt);
        } catch (e) {
          // 单帧异常不应中断整条动画循环
          console.error('[fw] frame error', e);
        }
        // 用 setTimeout 自调度，兼容模拟器（部分基础库/模拟器下 canvas.requestAnimationFrame 不会持续触发）
        if (state.currentFrame % 100 === 0) {
          let _n = 0;
          COLOR_CODES.forEach(c => { _n += Star.active[c].length; });
          let _sp = 0;
          COLOR_CODES.forEach(c => { _sp += Spark.active[c].length; });
          console.log('[fw] frame=' + state.currentFrame + ' stars=' + _n + ' sparks=' + _sp);
        }
        this.rafId = setTimeout(loop, 16);
      };
      this.rafId = setTimeout(loop, 16);
    });
  },

  applyConfig() {
    if (!this.ctx) return;
    const c = state.config;
    state.quality = parseInt(c.quality);
    state.isLowQuality = state.quality === QUALITY_LOW;
    state.isHighQuality = state.quality === QUALITY_HIGH;
    const sf = parseFloat(c.scaleFactor) || 0.9;
    state.stageW = this.cssW / sf;
    state.stageH = this.cssH / sf;
    this.ctx.setTransform(this.dpr * sf, 0, 0, this.dpr * sf, 0, 0);
    this.setData({ hideControls: c.hideControls || c.fullscreen });
  },

  // ===== 每帧 =====
  frame(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    state.currentFrame++;
    const speed = 1; // simSpeed=1

    if (!state.paused) {
      // 自动燃放
      if (state.config.autoLaunch) {
        state.autoLaunchTime -= dt;
        if (state.autoLaunchTime <= 0) {
          state.autoLaunchTime = startSequence() * 1.25;
        }
      }
      this.updatePhysics(dt);
    }
    this.render();
  },

  updatePhysics(dt) {
    const tick = dt / 16.67;
    const gAcc = GRAVITY / 60 * tick;
    const starDrag = Math.pow(Star.airDrag, tick);
    const starDragHeavy = Math.pow(Star.airDragHeavy, tick);
    const sparkDrag = Math.pow(Spark.airDrag, tick);

    COLOR_CODES_W_INVIS.forEach(color => {
      const stars = Star.active[color];
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i];
        if (star.updateFrame === state.currentFrame) continue;
        star.updateFrame = state.currentFrame;
        star.life -= dt;
        if (star.life <= 0) {
          stars.splice(i, 1);
          Star.returnInstance(star);
          continue;
        }
        const burnRate = Math.pow(star.life / star.fullLife, 0.5);
        const burnRateInverse = 1 - burnRate;
        star.prevX = star.x; star.prevY = star.y;
        star.x += star.speedX * tick;
        star.y += star.speedY * tick;
        if (!star.pureRise) {
          if (!star.heavy) { star.speedX *= starDrag; star.speedY *= starDrag; }
          else { star.speedX *= starDragHeavy; star.speedY *= starDragHeavy; }
          if (!star.noGravity) star.speedY += gAcc;
        }
        if (star.spinRadius) {
          star.spinAngle += star.spinSpeed * tick;
          star.x += Math.sin(star.spinAngle) * star.spinRadius * tick;
          star.y += Math.cos(star.spinAngle) * star.spinRadius * tick;
        }
        if (star.sparkFreq) {
          star.sparkTimer -= dt;
          while (star.sparkTimer < 0) {
            star.sparkTimer += star.sparkFreq * 0.75 + star.sparkFreq * burnRateInverse * 4;
            Spark.add(star.x, star.y, star.sparkColor, Math.random() * PI_2, Math.random() * star.sparkSpeed * burnRate, star.sparkLife * 0.8 + Math.random() * star.sparkLifeVariation * star.sparkLife);
          }
        }
        if (star.life < star.transitionTime) {
          if (star.secondColor && !star.colorChanged) {
            star.colorChanged = true;
            star.color = star.secondColor;
            stars.splice(i, 1);
            Star.active[star.secondColor].push(star);
            if (star.secondColor === INVISIBLE) star.sparkFreq = 0;
          }
          if (star.strobe) {
            star.visible = Math.floor(star.life / star.strobeFreq) % 3 === 0;
          }
        }
      }
      const sparks = Spark.active[color];
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        spark.life -= dt;
        if (spark.life <= 0) { sparks.splice(i, 1); Spark.returnInstance(spark); continue; }
        spark.prevX = spark.x; spark.prevY = spark.y;
        spark.x += spark.speedX * tick;
        spark.y += spark.speedY * tick;
        spark.speedX *= sparkDrag; spark.speedY *= sparkDrag;
        spark.speedY += gAcc;
      }
    });
  },

  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = state.stageW, H = state.stageH;
    const sf = parseFloat(state.config.scaleFactor) || 0.9;

    // 拖尾清屏：半透明黑覆盖（同时充当背景清屏，不填实色，才能保留长拖尾）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${state.config.longExposure ? 0.0025 : 0.175})`;
    ctx.fillRect(0, 0, W, H);

    // 照亮天空：在拖尾之上叠加一层随当前绽放颜色变化的微光（additive）
    if (parseInt(state.config.skyLighting) !== SKY_LIGHT_NONE) {
      let total = 0; const t = state.targetSky; t.r = 0; t.g = 0; t.b = 0;
      COLOR_CODES.forEach(color => {
        const tuple = COLOR_TUPLES[color];
        const count = Star.active[color].length;
        total += count;
        t.r += tuple.r * count; t.g += tuple.g * count; t.b += tuple.b * count;
      });
      const maxStar = 500;
      const intensity = Math.pow(Math.min(1, total / maxStar), 0.3);
      const maxC = Math.max(1, t.r, t.g, t.b);
      const maxSat = parseInt(state.config.skyLighting) * 15;
      t.r = t.r / maxC * maxSat * intensity;
      t.g = t.g / maxC * maxSat * intensity;
      t.b = t.b / maxC * maxSat * intensity;
      const c = state.currentSky;
      c.r += (t.r - c.r) / 10; c.g += (t.g - c.g) / 10; c.b += (t.b - c.b) / 10;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0.14)`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 爆心闪光（lighter 渐变，按 life 渐隐）
    ctx.globalCompositeOperation = 'lighter';
    for (let i = BurstFlash.active.length - 1; i >= 0; i--) {
      const bf = BurstFlash.active[i];
      const a = Math.max(0, bf.life);
      const g = ctx.createRadialGradient(bf.x, bf.y, 0, bf.x, bf.y, bf.radius);
      g.addColorStop(0.024, `rgba(255,255,255,${a})`);
      g.addColorStop(0.125, `rgba(255,160,20,${0.2 * a})`);
      g.addColorStop(0.32, `rgba(255,140,20,${0.11 * a})`);
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bf.x - bf.radius, bf.y - bf.radius, bf.radius * 2, bf.radius * 2);
      bf.life -= bf.decay;
      if (bf.life <= 0) { BurstFlash.active.splice(i, 1); BurstFlash.returnInstance(bf); }
    }
    ctx.globalCompositeOperation = 'source-over';

    // 粒子（lighter 混合，线段拖尾）
    ctx.globalCompositeOperation = 'lighter';
    // Stars
    ctx.lineCap = state.isLowQuality ? 'square' : 'round';
    COLOR_CODES.forEach(color => {
      const stars = Star.active[color];
      if (!stars.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Star.drawWidth;
      ctx.beginPath();
      stars.forEach(star => {
        if (star.visible) { ctx.moveTo(star.x, star.y); ctx.lineTo(star.prevX, star.prevY); }
      });
      ctx.stroke();
    });
    // 白色高光核
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    COLOR_CODES.forEach(color => {
      Star.active[color].forEach(star => {
        if (star.visible) { ctx.moveTo(star.x, star.y); ctx.lineTo(star.x - star.speedX * 1.6, star.y - star.speedY * 1.6); }
      });
    });
    ctx.stroke();
    // Sparks
    ctx.lineWidth = Spark.drawWidth || 1;
    COLOR_CODES.forEach(color => {
      const sparks = Spark.active[color];
      if (!sparks.length) return;
      ctx.strokeStyle = color;
      ctx.beginPath();
      sparks.forEach(spark => { ctx.moveTo(spark.x, spark.y); ctx.lineTo(spark.prevX, spark.prevY); });
      ctx.stroke();
    });

    ctx.globalCompositeOperation = 'source-over';
  },

  // ===== 交互 =====
  onTapCanvas(e) {
    if (state.paused) return;
    const t = e.touches ? e.touches[0] : e.detail;
    const x = e.detail ? e.detail.x : (t ? t.x : 0);
    const y = e.detail ? e.detail.y : (t ? t.y : 0);
    const sf = parseFloat(state.config.scaleFactor) || 0.9;
    const px = x / sf, py = y / sf;
    const pos = px / state.stageW;
    const lh = 1 - py / state.stageH;
    const s = makeShell(state.config.shell, state.config.size);
    s.launch(clamp(pos, 0, 1), clamp(lh, 0, 1));
  },

  onTogglePause() {
    state.paused = !state.paused;
    this.setData({ paused: state.paused });
  },

  onToggleSound() {
    sound.toggle();
    this.setData({ soundOn: sound.enabled });
  },

  onTogglePanel() { this.setData({ showPanel: !this.data.showPanel }); },
  onClosePanel() { this.setData({ showPanel: false }); },

  persist() {
    try { wx.setStorageSync('fw_config', state.config); } catch (e) {}
  },

  onShellChange(e) {
    state.config.shell = SHELL_NAMES[+e.detail.value];
    this.setData({ shellIndex: +e.detail.value }); this.persist();
  },
  onSizeChange(e) {
    state.config.size = +e.detail.value;
    this.setData({ sizeIndex: +e.detail.value }); this.persist();
  },
  onQualityChange(e) {
    state.config.quality = String(+e.detail.value + 1);
    this.setData({ qualityIndex: +e.detail.value }); this.applyConfig(); this.persist();
  },
  onSkyChange(e) {
    state.config.skyLighting = String(+e.detail.value);
    this.setData({ skyIndex: +e.detail.value }); this.persist();
  },
  onScaleChange(e) {
    state.config.scaleFactor = SCALE_OPTIONS[+e.detail.value];
    this.setData({ scaleIndex: +e.detail.value }); this.applyConfig(); this.persist();
  },
  onAutoLaunch(e) {
    state.config.autoLaunch = e.detail.value;
    this.setData({ autoLaunch: e.detail.value }); this.persist();
  },
  onFinale(e) {
    state.config.finale = e.detail.value;
    this.setData({ finale: e.detail.value }); this.persist();
  },
  onLongExposure(e) {
    state.config.longExposure = e.detail.value;
    this.setData({ longExposure: e.detail.value }); this.persist();
  },
  onHideControls(e) {
    state.config.hideControls = e.detail.value;
    this.setData({ hideControls: e.detail.value }); this.applyConfig(); this.persist();
  },
  onFullscreen(e) {
    state.config.fullscreen = e.detail.value;
    this.setData({ fullscreen: e.detail.value, hideControls: state.config.hideControls || e.detail.value }); this.applyConfig(); this.persist();
    if (e.detail.value && wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: true });
  },
  noop() {}
});
