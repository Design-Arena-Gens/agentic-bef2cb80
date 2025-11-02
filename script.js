/*
  ????? - p5.js
  - ????????????????
  - ????????????????????
  - ???????
*/

// ????
const GAME_STATE = {
  MENU: 'MENU',
  RUNNING: 'RUNNING',
  PICKING: 'PICKING',
  GAME_OVER: 'GAME_OVER',
  PAUSED: 'PAUSED',
};

const CANVAS_ASPECT = 16 / 9;
const BASE_CANVAS_WIDTH = 1100; // ????????
const BASE_CANVAS_HEIGHT = Math.round(BASE_CANVAS_WIDTH / CANVAS_ASPECT);

// ??????
const STORAGE_KEY = 'roguelike_breakout_meta_v1';

// ????
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function randRange(min, max) { return Math.random() * (max - min) + min; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(prob01) { return Math.random() < prob01; }

// ????-??
function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
  const testX = clamp(cx, rx, rx + rw);
  const testY = clamp(cy, ry, ry + rh);
  const distX = cx - testX;
  const distY = cy - testY;
  const distanceSq = distX * distX + distY * distY;
  return distanceSq <= r * r;
}

// --- ??? ---
class MetaProgression {
  constructor() {
    this.data = {
      coins: 0,
      upgrades: {
        baseLife: 0, // +1 ??/?
        basePaddleSpeed: 0, // +8%/?
        baseBallDamage: 0, // +1 ??/?
      },
    };
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.coins != null && parsed.upgrades) {
          this.data = parsed;
        }
      }
    } catch (e) {
      // ??????
    }
  }
  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {}
  }
  addCoins(amount) {
    this.data.coins = Math.max(0, Math.floor(this.data.coins + amount));
    this.save();
  }
  canBuy(key) {
    const cost = this.getCost(key);
    return this.data.coins >= cost;
  }
  buy(key) {
    const cost = this.getCost(key);
    if (this.data.coins >= cost) {
      this.data.coins -= cost;
      this.data.upgrades[key]++;
      this.save();
      return true;
    }
    return false;
  }
  getCost(key) {
    const level = this.data.upgrades[key] || 0;
    if (key === 'baseLife') return 50 + level * 50;
    if (key === 'basePaddleSpeed') return 40 + level * 40;
    if (key === 'baseBallDamage') return 60 + level * 60;
    return 9999;
  }
}

// --- ???? ---
class Paddle {
  constructor(game) {
    this.game = game;
    this.width = 160;
    this.height = 14;
    this.position = createVector(game.worldWidth / 2, game.worldHeight - 48);
    this.speed = 12;
    this.sticky = false;
  }
  resetForRun() {
    const speedBonusPct = 0.08 * game.meta.data.upgrades.basePaddleSpeed;
    this.speed = 12 * (1 + speedBonusPct);
    this.width = 160;
    this.sticky = false;
    this.position.set(this.game.worldWidth / 2, this.game.worldHeight - 48);
  }
  update() {
    // ??????
    if (this.game.inputType === 'mouse' && this.game.pointerActive) {
      const targetX = clamp(this.game.pointerX, this.width / 2 + 8, this.game.worldWidth - this.width / 2 - 8);
      const dx = targetX - this.position.x;
      this.position.x += clamp(dx, -this.speed, this.speed);
    } else {
      let move = 0;
      if (this.game.keys['ArrowLeft'] || this.game.keys['a']) move -= 1;
      if (this.game.keys['ArrowRight'] || this.game.keys['d']) move += 1;
      this.position.x += move * this.speed;
      this.position.x = clamp(this.position.x, this.width / 2 + 8, this.game.worldWidth - this.width / 2 - 8);
    }
  }
  draw() {
    noStroke();
    fill(116, 209, 255);
    rectMode(CENTER);
    rect(this.position.x, this.position.y, this.width, this.height, 8);
  }
}

class Ball {
  constructor(game) {
    this.game = game;
    this.radius = 8;
    this.position = createVector(0, 0);
    this.velocity = createVector(0, 0);
    this.speed = 9;
    this.damage = 1;
    this.penetration = false;
    this.stickyEnabled = false;
    this.stuck = false;
  }
  resetAtPaddle() {
    this.position.set(this.game.paddle.position.x, this.game.paddle.position.y - this.game.paddle.height / 2 - this.radius - 2);
    this.velocity.set(0, -this.speed);
    this.stuck = this.stickyEnabled;
  }
  applyMeta() {
    this.damage = 1 + this.game.meta.data.upgrades.baseBallDamage;
  }
  launchIfStuck() {
    if (this.stuck) {
      const angle = map(this.game.aimAngle, -1, 1, -PI * 0.75, -PI * 0.25);
      const v = p5.Vector.fromAngle(angle).mult(this.speed);
      this.velocity.set(v.x, v.y);
      this.stuck = false;
    }
  }
  update() {
    if (this.stuck) {
      this.position.x = this.game.paddle.position.x;
      this.position.y = this.game.paddle.position.y - this.game.paddle.height / 2 - this.radius - 2;
      return;
    }
    this.position.add(this.velocity);

    // ????
    if (this.position.x - this.radius < 6) {
      this.position.x = 6 + this.radius; this.velocity.x *= -1;
    }
    if (this.position.x + this.radius > this.game.worldWidth - 6) {
      this.position.x = this.game.worldWidth - 6 - this.radius; this.velocity.x *= -1;
    }
    if (this.position.y - this.radius < 6) {
      this.position.y = 6 + this.radius; this.velocity.y *= -1;
    }
    if (this.position.y - this.radius > this.game.worldHeight + 40) {
      this.game.loseLife();
      return;
    }

    // ?????
    const p = this.game.paddle;
    if (circleRectCollision(this.position.x, this.position.y, this.radius, p.position.x - p.width / 2, p.position.y - p.height / 2, p.width, p.height)) {
      const hitRatio = clamp((this.position.x - p.position.x) / (p.width / 2), -1, 1);
      const angle = map(hitRatio, -1, 1, -PI * 0.85, -PI * 0.15);
      const speedMag = this.velocity.mag();
      const v = p5.Vector.fromAngle(angle).setMag(speedMag);
      this.velocity.set(v.x, v.y);
      if (p.sticky || this.stickyEnabled) {
        this.stuck = true;
        this.velocity.set(0, 0);
      }
    }

    // ?????
    for (const brick of this.game.bricks) {
      if (!brick.alive) continue;
      if (circleRectCollision(this.position.x, this.position.y, this.radius, brick.x, brick.y, brick.w, brick.h)) {
        brick.hit(this.damage);
        if (!this.penetration) {
          // ?????????????
          const overlapLeft = Math.abs((this.position.x + this.radius) - brick.x);
          const overlapRight = Math.abs((brick.x + brick.w) - (this.position.x - this.radius));
          const overlapTop = Math.abs((this.position.y + this.radius) - brick.y);
          const overlapBottom = Math.abs((brick.y + brick.h) - (this.position.y - this.radius));
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft) this.velocity.x = -Math.abs(this.velocity.x);
          else if (minOverlap === overlapRight) this.velocity.x = Math.abs(this.velocity.x);
          else if (minOverlap === overlapTop) this.velocity.y = -Math.abs(this.velocity.y);
          else this.velocity.y = Math.abs(this.velocity.y);
        }
        // ????
        this.velocity.mult(1.01);
        break;
      }
    }
  }
  draw() {
    noStroke();
    fill(255, 226, 140);
    circle(this.position.x, this.position.y, this.radius * 2);
  }
}

class Brick {
  constructor(x, y, w, h, hp) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = hp; this.maxHp = hp; this.alive = true;
  }
  hit(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      game.score += 10;
      if (chance(0.18)) game.spawnFloatingText(this.centerX(), this.centerY(), '+??');
      if (chance(0.18)) game.coinsThisRun += 1;
      if (game.bricks.every(b => !b.alive)) {
        game.finishWave();
      }
    } else {
      game.score += 2;
    }
  }
  centerX() { return this.x + this.w / 2; }
  centerY() { return this.y + this.h / 2; }
  draw() {
    if (!this.alive) return;
    const t = clamp(this.hp / this.maxHp, 0, 1);
    const c1 = color(97, 193, 255);
    const c2 = color(255, 97, 97);
    const c = lerpColor(c2, c1, t);
    noStroke(); fill(red(c), green(c), blue(c));
    rect(this.x, this.y, this.w, this.h, 6);
    // ??
    noStroke(); fill(0,0,0,80);
    rect(this.x + 6, this.y + this.h - 10, this.w - 12, 6, 3);
    fill(255,255,255,160);
    rect(this.x + 6, this.y + this.h - 10, (this.w - 12) * t, 6, 3);
  }
}

class FloatingText {
  constructor(x, y, text, col) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, -0.6);
    this.text = text;
    this.col = col || color(191, 233, 255);
    this.life = 60;
  }
  update() { this.pos.add(this.vel); this.life--; }
  draw() {
    if (this.life <= 0) return;
    push();
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), map(this.life, 0, 60, 0, 255));
    textAlign(CENTER, CENTER);
    textSize(14);
    text(this.text, this.pos.x, this.pos.y);
    pop();
  }
}

// --- ???? ---
const UPGRADE_POOL = [
  {
    id: 'wider_paddle', name: '????', desc: '???? +25%', apply: (g) => { g.paddle.width *= 1.25; }
  },
  {
    id: 'ball_speed', name: '????', desc: '?? +20%', apply: (g) => { for (const b of g.balls) b.velocity.mult(1.2); }
  },
  {
    id: 'multi_ball', name: '????', desc: '??? 1 ???', apply: (g) => { g.spawnExtraBall(); }
  },
  {
    id: 'sticky', name: '????', desc: '?????????????', apply: (g) => { g.paddle.sticky = true; for (const b of g.balls) b.stickyEnabled = true; }
  },
  {
    id: 'penetrate', name: '????', desc: '???????', apply: (g) => { for (const b of g.balls) b.penetration = true; }
  },
  {
    id: 'ball_damage', name: '????', desc: '???? +1', apply: (g) => { for (const b of g.balls) b.damage += 1; }
  },
  {
    id: 'life_plus', name: '????', desc: '?? +1 ??', apply: (g) => { g.lives += 1; }
  },
  {
    id: 'magnet', name: '????', desc: '????????????', apply: (g) => { g.magnetAssist = true; }
  },
];

function rollUpgrades(n = 3) {
  const pool = [...UPGRADE_POOL];
  const picks = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

// --- ????? ---
class Game {
  constructor() {
    this.worldWidth = BASE_CANVAS_WIDTH;
    this.worldHeight = BASE_CANVAS_HEIGHT;

    this.state = GAME_STATE.MENU;
    this.meta = new MetaProgression();

    this.paddle = new Paddle(this);
    this.balls = [];
    this.bricks = [];
    this.floatingTexts = [];

    this.keys = {};
    this.inputType = 'mouse';
    this.pointerActive = false;
    this.pointerX = this.worldWidth / 2;

    this.wave = 1;
    this.score = 0;
    this.lives = 3;
    this.coinsThisRun = 0;
    this.magnetAssist = false;

    this.upgradeChoices = [];
    this.aimAngle = 0; // -1..1 ?????
  }

  startRun() {
    this.state = GAME_STATE.RUNNING;
    this.wave = 1;
    this.score = 0;
    this.coinsThisRun = 0;
    this.paddle.resetForRun();
    this.lives = 3 + this.meta.data.upgrades.baseLife;
    this.magnetAssist = false;

    this.balls = [new Ball(this)];
    for (const b of this.balls) { b.applyMeta(); }
    this.balls[0].resetAtPaddle();

    this.generateWave(this.wave);
    this.updateHud();
    this.showToast('???', color(191, 233, 255));
  }

  loseLife() {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.endRun();
      return;
    }
    this.balls = [new Ball(this)];
    for (const b of this.balls) { b.applyMeta(); }
    this.balls[0].resetAtPaddle();
    this.showToast('????', color(255, 140, 140));
    this.updateHud();
  }

  finishWave() {
    // ????
    const reward = 2 + Math.floor(this.wave * 0.75);
    this.coinsThisRun += reward;
    this.showToast(`?? +${reward} ??`, color(191, 233, 255));
    this.state = GAME_STATE.PICKING;
    this.upgradeChoices = rollUpgrades(3);
    this.renderUpgradeOverlay();
  }

  endRun() {
    this.state = GAME_STATE.GAME_OVER;
    this.meta.addCoins(this.coinsThisRun);
    this.renderGameOverOverlay();
  }

  spawnExtraBall() {
    if (this.balls.length >= 5) return;
    const base = this.balls[0];
    const nb = new Ball(this);
    nb.applyMeta();
    nb.position.set(base.position.x + randRange(-10, 10), base.position.y);
    const angle = randRange(-PI * 0.8, -PI * 0.2);
    nb.velocity = p5.Vector.fromAngle(angle).setMag(base.velocity.mag());
    nb.penetration = base.penetration;
    nb.stickyEnabled = base.stickyEnabled;
    this.balls.push(nb);
  }

  spawnFloatingText(x, y, text) {
    this.floatingTexts.push(new FloatingText(x, y, text));
  }
  showToast(text, col) {
    this.spawnFloatingText(this.worldWidth / 2, this.worldHeight * 0.25, text, col);
  }

  updateHud() {
    const waveEl = document.getElementById('hud-wave');
    const scoreEl = document.getElementById('hud-score');
    const livesEl = document.getElementById('hud-lives');
    const coinsEl = document.getElementById('hud-coins');
    if (waveEl) waveEl.textContent = `? ${this.wave} ?`;
    if (scoreEl) scoreEl.textContent = `?? ${this.score}`;
    if (livesEl) livesEl.textContent = `?? ${this.lives}`;
    if (coinsEl) coinsEl.textContent = `?? ${this.meta.data.coins} (+${this.coinsThisRun})`;
  }

  generateWave(wave) {
    const cols = 10;
    const rows = 5 + Math.floor((wave - 1) % 3);
    const margin = 12;
    const wall = 6;
    const gridWidth = this.worldWidth - wall * 2 - margin * 2;
    const brickW = Math.floor(gridWidth / cols) - 4;
    const brickH = 26;
    const startX = wall + margin + 2;
    const startY = 80;

    const baseHp = 1 + Math.floor((wave - 1) * 0.6);

    this.bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (chance(0.08)) continue; // ??
        const x = startX + c * (brickW + 4);
        const y = startY + r * (brickH + 6);
        const variance = chance(0.2) ? 1 : 0;
        const hp = baseHp + variance + (chance(0.1) ? 1 : 0);
        this.bricks.push(new Brick(x, y, brickW, brickH, hp));
      }
    }
  }

  handlePickUpgrade(upg) {
    upg.apply(this);
    this.state = GAME_STATE.RUNNING;
    this.wave += 1;
    this.generateWave(this.wave);
    this.updateHud();
    this.hideOverlay();
  }

  renderUpgradeOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'overlay-card';
    card.innerHTML = `
      <div class="overlay-title">?????? <span class="badge">???</span></div>
      <div class="overlay-subtitle">?????????????</div>
      <div class="card-grid" id="upgrade-grid"></div>
      <div class="btn-row">
        <button class="button small" id="skip-btn">???+1 ???</button>
        <button class="button small" id="menu-btn">????</button>
      </div>
      <div class="footer-note">??????/?????????????????</div>
    `;
    overlay.appendChild(card);

    const grid = card.querySelector('#upgrade-grid');
    this.upgradeChoices.forEach((u) => {
      const el = document.createElement('div');
      el.className = 'upgrade-card';
      el.innerHTML = `<div class="upgrade-name">${u.name}</div><div class="upgrade-desc">${u.desc}</div>`;
      el.onclick = () => this.handlePickUpgrade(u);
      grid.appendChild(el);
    });

    card.querySelector('#skip-btn').onclick = () => {
      this.coinsThisRun += 1;
      this.state = GAME_STATE.RUNNING;
      this.wave += 1;
      this.generateWave(this.wave);
      this.updateHud();
      this.hideOverlay();
    };
    card.querySelector('#menu-btn').onclick = () => this.backToMenu();
  }

  renderMenuOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'overlay-card';
    const coins = this.meta.data.coins;
    const u = this.meta.data.upgrades;
    const getCost = (k) => this.meta.getCost(k);
    card.innerHTML = `
      <div class="overlay-title">?????</div>
      <div class="overlay-subtitle">???? + ?????????<b>${coins}</b></div>

      <div class="overlay-title" style="margin-top: 6px;">????</div>
      <div class="btn-row">
        <button class="button" id="start-btn">??????</button>
      </div>

      <div class="overlay-title" style="margin-top: 12px;">???</div>
      <div class="card-grid">
        <div class="upgrade-card">
          <div class="upgrade-name">????????${u.baseLife}?</div>
          <div class="upgrade-desc">???? +1 ??/?????${getCost('baseLife')} ??</div>
          <div class="btn-row"><button class="button small" id="buy-life">??</button></div>
        </div>
        <div class="upgrade-card">
          <div class="upgrade-name">????????${u.basePaddleSpeed}?</div>
          <div class="upgrade-desc">???? +8%/?????${getCost('basePaddleSpeed')} ??</div>
          <div class="btn-row"><button class="button small" id="buy-speed">??</button></div>
        </div>
        <div class="upgrade-card">
          <div class="upgrade-name">????????${u.baseBallDamage}?</div>
          <div class="upgrade-desc">???? +1/?????${getCost('baseBallDamage')} ??</div>
          <div class="btn-row"><button class="button small" id="buy-damage">??</button></div>
        </div>
      </div>

      <div class="btn-row" style="margin-top: 12px;">
        <button class="button" id="reset-btn">???????????????</button>
      </div>
    `;
    overlay.appendChild(card);

    card.querySelector('#start-btn').onclick = () => this.startRun();
    card.querySelector('#buy-life').onclick = () => { if (this.meta.buy('baseLife')) this.renderMenuOverlay(); };
    card.querySelector('#buy-speed').onclick = () => { if (this.meta.buy('basePaddleSpeed')) this.renderMenuOverlay(); };
    card.querySelector('#buy-damage').onclick = () => { if (this.meta.buy('baseBallDamage')) this.renderMenuOverlay(); };
    card.querySelector('#reset-btn').onclick = () => {
      this.meta.data.upgrades.baseLife = 0;
      this.meta.data.upgrades.basePaddleSpeed = 0;
      this.meta.data.upgrades.baseBallDamage = 0;
      this.meta.save();
      this.renderMenuOverlay();
    };
  }

  renderGameOverOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'overlay-card';
    card.innerHTML = `
      <div class="overlay-title">????</div>
      <div class="overlay-subtitle">???? ${this.wave} ?????${this.score}??????+${this.coinsThisRun}</div>
      <div class="btn-row">
        <button class="button" id="restart-btn">????</button>
        <button class="button" id="menu-btn">????</button>
      </div>
    `;
    overlay.appendChild(card);
    card.querySelector('#restart-btn').onclick = () => this.startRun();
    card.querySelector('#menu-btn').onclick = () => this.backToMenu();
    this.updateHud();
  }

  hideOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }

  backToMenu() {
    this.state = GAME_STATE.MENU;
    this.hideOverlay();
    this.renderMenuOverlay();
    this.updateHud();
  }

  update() {
    if (this.state !== GAME_STATE.RUNNING) return;

    // ???????????????
    if (this.magnetAssist && this.balls[0]) {
      const bx = this.balls[0].position.x;
      this.pointerX = lerp(this.pointerX, bx, 0.07);
    }

    this.paddle.update();
    for (const b of this.balls) b.update();

    // ??
    this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);
    for (const t of this.floatingTexts) t.update();

    this.updateHud();
  }

  draw() {
    // ????
    noStroke();
    // ???????
    fill(255,255,255,18);
    rect(6, 6, this.worldWidth - 12, 6, 4);
    rect(6, 6, 6, this.worldHeight - 12, 4);
    rect(this.worldWidth - 12, 6, 6, this.worldHeight - 12, 4);

    // ??
    for (const br of this.bricks) br.draw();

    // ????
    this.paddle.draw();
    for (const b of this.balls) b.draw();

    // ??????
    if (this.balls.some(b => b.stuck)) {
      const angle = map(this.aimAngle, -1, 1, -PI * 0.75, -PI * 0.25);
      const dir = p5.Vector.fromAngle(angle).mult(90);
      stroke(191, 233, 255, 160); strokeWeight(2);
      line(this.paddle.position.x, this.paddle.position.y - 18, this.paddle.position.x + dir.x, this.paddle.position.y - 18 + dir.y);
      noStroke(); fill(191, 233, 255, 90);
      circle(this.paddle.position.x + dir.x, this.paddle.position.y - 18 + dir.y, 6);
    }

    // ??
    for (const t of this.floatingTexts) t.draw();
  }
}

// --- p5 ???? ---
let game;
let canvas;

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = Math.round(w / CANVAS_ASPECT);
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');

  game = new Game();
  game.backToMenu();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = Math.round(w / CANVAS_ASPECT);
  resizeCanvas(w, h);
  if (game) {
    game.worldWidth = width; game.worldHeight = height;
  }
}

function draw() {
  clear();
  background(0,0,0,0);

  if (!game) return;
  game.update();
  game.draw();
}

// --- ?? ---
function mouseMoved() {
  if (!game) return;
  game.pointerActive = true; game.inputType = 'mouse';
  game.pointerX = mouseX;
}
function mouseDragged() { mouseMoved(); }
function mousePressed() {
  if (!game) return;
  if (game.state === GAME_STATE.RUNNING) {
    for (const b of game.balls) b.launchIfStuck();
  }
}

function keyPressed() {
  if (!game) return;
  game.inputType = 'keyboard';
  game.keys[key] = true;
  if (key === ' ') {
    for (const b of game.balls) b.launchIfStuck();
  }
  if (key === 'Escape') {
    if (game.state === GAME_STATE.RUNNING) { game.state = GAME_STATE.PAUSED; game.renderMenuOverlay(); }
    else if (game.state !== GAME_STATE.RUNNING) { game.hideOverlay(); game.state = GAME_STATE.RUNNING; }
  }
}
function keyReleased() { if (game) game.keys[key] = false; }

// ? Aim ?????????????
function keyIsDownHandler() {
  if (!game || game.state !== GAME_STATE.RUNNING) return;
  const stuck = game.balls.some(b => b.stuck);
  if (!stuck) return;
  let delta = 0;
  if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) delta -= 0.03;
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) delta += 0.03;
  game.aimAngle = clamp(game.aimAngle + delta, -1, 1);
}
setInterval(keyIsDownHandler, 16);
