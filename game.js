(() => {
  'use strict';

  /* ---------------------------------------------------------
     Elementos
  --------------------------------------------------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const frame = document.getElementById('frame');

  const ui = {
    pScore: document.getElementById('pScore'),
    aiScore: document.getElementById('aiScore'),
    aiName: document.getElementById('aiName'),
    best: document.getElementById('bestScore'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    overlayBtn: document.getElementById('overlayBtn'),
    difficulty: document.getElementById('difficulty'),
    btnPause: document.getElementById('btnPause'),
    btnRestart: document.getElementById('btnRestart'),
    btnSound: document.getElementById('btnSound'),
    btnFull: document.getElementById('btnFull'),
  };

  /* ---------------------------------------------------------
     Configuração
  --------------------------------------------------------- */
  const WIN_SCORE = 11;
  const TAU = Math.PI * 2;

  const LEVELS = {
    easy:   { label: 'Fácil',   aiName: 'Aprendiz', speed: 0.55, error: 0.30, react: 0.20 },
    normal: { label: 'Normal',  aiName: 'Veterano', speed: 0.82, error: 0.13, react: 0.09 },
    hard:   { label: 'Difícil', aiName: 'Mestre',   speed: 1.10, error: 0.04, react: 0.03 },
  };

  const state = {
    phase: 'menu', // menu | countdown | playing | paused | over
    prevPhase: 'playing',
    timer: 0,
    countdown: 0,
    scoreP: 0,
    scoreAI: 0,
    difficulty: 'normal',
    sound: true,
    best: Number(localStorage.getItem('pp_best') || 0),
    rally: 0,
    lastServeTo: 1,
  };

  const player = { y: 0, targetY: 0, w: 12, h: 80, score: 0 };
  const ai = { y: 0, w: 12, h: 80, score: 0 };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 8, trail: [] };

  let W = 0, H = 0, dpr = 1;
  let audioCtx = null;

  /* ---------------------------------------------------------
     Utilidades
  --------------------------------------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  function beep(freq, dur = 0.08, type = 'square', vol = 0.06) {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (_) { /* áudio indisponível */ }
  }

  /* ---------------------------------------------------------
     Dimensionamento responsivo
  --------------------------------------------------------- */
  function resize() {
    const rect = frame.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(280, Math.round(rect.width));
    H = Math.max(200, Math.round(rect.height));

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ph = clamp(H * 0.17, 40, 130);
    const pw = clamp(W * 0.012, 8, 16);
    player.h = ai.h = ph;
    player.w = ai.w = pw;
    ball.r = clamp(Math.min(W, H) * 0.017, 6, 12);

    if (state.phase === 'menu') {
      player.y = H / 2 - ph / 2;
      ai.y = player.y;
      player.targetY = player.y;
      ball.x = W / 2;
      ball.y = H / 2;
    }
    player.y = clamp(player.y, 0, H - player.h);
    ai.y = clamp(ai.y, 0, H - ai.h);
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(frame);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  /* ---------------------------------------------------------
     Jogo
  --------------------------------------------------------- */
  const margin = () => clamp(W * 0.035, 10, 40);
  const px = () => margin();
  const ax = () => W - margin() - ai.w;

  function baseSpeed() {
    return Math.min(W, H) * 0.42 * (1 + Math.min(state.rally, 12) * 0.03);
  }

  function serve(dirToPlayer) {
    // dirToPlayer = true => a bola vai para a esquerda (após ponto do jogador)
    const dir = dirToPlayer ? -1 : 1;
    const angle = rand(-0.42, 0.42);
    const sp = baseSpeed();
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = Math.cos(angle) * sp * dir;
    ball.vy = Math.sin(angle) * sp;
    ball.trail.length = 0;
    state.rally = 0;
  }

  function startRound() {
    state.phase = 'countdown';
    state.countdown = 1.35;
    state.timer = 0;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = ball.vy = 0;
    ball.trail.length = 0;
    player.y = clamp(player.y, 0, H - player.h);
    ai.y = clamp(ai.y, 0, H - ai.h);
    ui.overlay.hidden = true;
  }

  function newGame() {
    state.scoreP = 0;
    state.scoreAI = 0;
    state.rally = 0;
    player.y = H / 2 - player.h / 2;
    ai.y = player.y;
    player.targetY = player.y;
    ui.pScore.textContent = '0';
    ui.aiScore.textContent = '0';
    startRound();
  }

  function point(who) {
    if (who === 'player') {
      state.scoreP++;
      ui.pScore.textContent = state.scoreP;
      if (state.scoreP > state.best) {
        state.best = state.scoreP;
        localStorage.setItem('pp_best', String(state.best));
        ui.best.textContent = state.best;
      }
      beep(880, 0.12, 'square', 0.08);
      state.lastServeTo = 0; // próximo saque vai para a direita (contra o computador)
    } else {
      state.scoreAI++;
      ui.aiScore.textContent = state.scoreAI;
      beep(220, 0.18, 'sawtooth', 0.06);
      state.lastServeTo = 1; // próximo saque vai para a esquerda (contra você)
    }

    if (state.scoreP >= WIN_SCORE || state.scoreAI >= WIN_SCORE) {
      const win = state.scoreP >= WIN_SCORE;
      state.phase = 'over';
      ui.overlayTitle.textContent = win ? 'Você venceu!' : 'Fim de jogo';
      ui.overlayText.textContent = win
        ? `${state.scoreP} x ${state.scoreAI} contra ${LEVELS[state.difficulty].aiName}.`
        : `${LEVELS[state.difficulty].aiName} venceu por ${state.scoreAI} x ${state.scoreP}. Tente outro nível!`;
      ui.overlayBtn.textContent = 'Jogar de novo';
      ui.overlay.hidden = false;
      beep(win ? 1180 : 160, 0.4, win ? 'triangle' : 'sawtooth', 0.08);
      return;
    }
    startRound();
  }

  /* ---------------------------------------------------------
     Controles
  --------------------------------------------------------- */
  function pointerMove(clientY) {
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    player.targetY = y - player.h / 2;
  }

  canvas.addEventListener('mousemove', (e) => pointerMove(e.clientY));
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    pointerMove(e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    pointerMove(e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('mousedown', (e) => {
    if (state.phase === 'menu' || state.phase === 'over') startGame();
    pointerMove(e.clientY);
  });

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'w', 's', ' ', 'r'].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === ' ' || k === 'spacebar') togglePause();
    if (k === 'r') { if (state.phase !== 'menu') newGame(); }
    if ((k === 'enter') && (state.phase === 'menu' || state.phase === 'over')) startGame();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  function togglePause() {
    if (state.phase === 'menu' || state.phase === 'over') { startGame(); return; }
    if (state.phase === 'playing' || state.phase === 'countdown') {
      state.prevPhase = state.phase;
      state.phase = 'paused';
      ui.overlayTitle.textContent = 'Pausado';
      ui.overlayText.textContent = 'Pressione Espaço ou toque em Continuar.';
      ui.overlayBtn.textContent = 'Continuar';
      ui.overlay.hidden = false;
    } else if (state.phase === 'paused') {
      state.phase = state.prevPhase || 'playing';
      ui.overlay.hidden = true;
    }
  }

  function startGame() {
    state.difficulty = ui.difficulty.value;
    ui.aiName.textContent = LEVELS[state.difficulty].aiName;
    newGame();
  }

  ui.overlayBtn.addEventListener('click', () => {
    if (state.phase === 'paused') togglePause();
    else startGame();
  });

  ui.btnPause.addEventListener('click', togglePause);
  ui.btnRestart.addEventListener('click', () => { if (state.phase !== 'menu') newGame(); });

  ui.difficulty.addEventListener('change', () => {
    state.difficulty = ui.difficulty.value;
    ui.aiName.textContent = LEVELS[state.difficulty].aiName;
    if (state.phase === 'menu' || state.phase === 'over') {
      state.phase = 'menu';
      ui.overlayTitle.textContent = 'Ping-Pong';
      ui.overlayText.textContent = 'Vença o computador. Jogue até 11 pontos.';
      ui.overlayBtn.textContent = 'Começar';
      ui.overlay.hidden = false;
    }
  });

  ui.btnSound.addEventListener('click', () => {
    state.sound = !state.sound;
    ui.btnSound.textContent = state.sound ? 'Som: ligado' : 'Som: desligado';
    if (state.sound) beep(660, 0.08);
  });

  ui.btnFull.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
    } else {
      document.exitFullscreen();
    }
  });

  /* ---------------------------------------------------------
     Loop
  --------------------------------------------------------- */
  let last = performance.now();

  function update(dt) {
    // Teclado move o alvo do paddle do jogador
    const keySpeed = H * 1.4 * dt;
    if (keys.has('arrowup') || keys.has('w')) player.targetY -= keySpeed;
    if (keys.has('arrowdown') || keys.has('s')) player.targetY += keySpeed;
    player.targetY = clamp(player.targetY, 0, H - player.h);

    // Movimento do jogador (rápido, segue o alvo)
    const playerMax = H * 6 * dt;
    player.y += clamp(player.targetY - player.y, -playerMax, playerMax);
    player.y = clamp(player.y, 0, H - player.h);

    if (state.phase === 'countdown') {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.phase = 'playing';
        serve(state.lastServeTo === 1);
      }
      return;
    }
    if (state.phase !== 'playing') return;

    // IA
    const lvl = LEVELS[state.difficulty];
    const targetX = ax();
    const dist = Math.abs(ball.x - targetX);
    const timeToReach = dist / Math.max(1, Math.abs(ball.vx));
    const predicted = ball.y + ball.vy * timeToReach;
    const error = Math.sin(performance.now() / 900 + state.rally) * lvl.error * H;
    let aim = predicted + error;
    // só persegue quando a bola vem na direção dela
    if (ball.vx < 0 && ball.x < W * 0.35) aim = ai.y + (ai.h / 2 - (H / 2)) * 0.4;
    aim = clamp(aim - ai.h / 2, 0, H - ai.h);
    const aiMax = Math.max(1, H * lvl.speed * dt);
    ai.y += clamp(aim - ai.y, -aiMax, aiMax);
    ai.y = clamp(ai.y, 0, H - ai.h);

    // Bola
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 9) ball.trail.shift();

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Paredes
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      beep(320, 0.05, 'square', 0.04);
    } else if (ball.y + ball.r >= H) {
      ball.y = H - ball.r;
      ball.vy = -Math.abs(ball.vy);
      beep(320, 0.05, 'square', 0.04);
    }

    // Paddle do jogador
    const pX = px();
    if (ball.vx < 0 && ball.x - ball.r <= pX + player.w && ball.x + ball.r >= pX &&
        ball.y + ball.r > player.y && ball.y - ball.r < player.y + player.h) {
      bounce(ball.y - (player.y + player.h / 2), 1, 1);
      ball.x = pX + player.w + ball.r;
      beep(520, 0.06, 'square', 0.06);
    }

    // Paddle da IA
    const aX = ax();
    if (ball.vx > 0 && ball.x + ball.r >= aX && ball.x - ball.r <= aX + ai.w &&
        ball.y + ball.r > ai.y && ball.y - ball.r < ai.y + ai.h) {
      bounce(ball.y - (ai.y + ai.h / 2), -1, 1.06);
      ball.x = aX - ball.r;
      beep(480, 0.06, 'square', 0.06);
    }

    // Pontos
    if (ball.x + ball.r < 0) point('ai');
    else if (ball.x - ball.r > W) point('player');
  }

  function bounce(offset, dirX, speedMul) {
    state.rally++;
    const maxAngle = 0.95; // radianos
    let angle = clamp((offset / (player.h / 2)) * maxAngle, -maxAngle, maxAngle);
    const sp = Math.min(baseSpeed() * speedMul, Math.min(W, H) * 1.15);
    ball.vx = Math.cos(angle) * sp * dirX;
    ball.vy = Math.sin(angle) * sp;
    if (Math.abs(ball.vy) < sp * 0.18) {
      ball.vy = (ball.vy >= 0 ? 1 : -1) * sp * 0.18;
    }
  }

  /* ---------------------------------------------------------
     Desenho
  --------------------------------------------------------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Fundo
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1226');
    g.addColorStop(1, '#060a16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Rede central
    ctx.save();
    ctx.setLineDash([12, 16]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();

    // Sombras dos paddles
    const pX = px(), aX = ax();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(pX + 3, player.y + 4, player.w, player.h, player.w / 2); ctx.fill();
    roundRect(aX + 3, ai.y + 4, ai.w, ai.h, ai.w / 2); ctx.fill();

    // Paddles
    ctx.fillStyle = '#35e6ff';
    ctx.shadowColor = 'rgba(53,230,255,.7)';
    ctx.shadowBlur = 18;
    roundRect(pX, player.y, player.w, player.h, player.w / 2); ctx.fill();

    ctx.fillStyle = '#ff4d8d';
    ctx.shadowColor = 'rgba(255,77,141,.7)';
    roundRect(aX, ai.y, ai.w, ai.h, ai.w / 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Rastro da bola
    for (let i = 0; i < ball.trail.length; i++) {
      const t = ball.trail[i];
      const a = (i / ball.trail.length) * 0.32;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r * (0.35 + 0.55 * (i / ball.trail.length)), 0, TAU);
      ctx.fill();
    }

    // Bola
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(255,255,255,.85)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Contagem
    if (state.phase === 'countdown') {
      const n = Math.max(1, Math.ceil(state.countdown / 0.45));
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `700 ${Math.round(Math.min(W, H) * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n > 0 ? String(n) : 'Vai!', W / 2, H / 2);
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------
     Início
  --------------------------------------------------------- */
  ui.best.textContent = state.best;
  ui.aiName.textContent = LEVELS[state.difficulty].aiName;
  resize();
  requestAnimationFrame(loop);

  //_hook de depuração (útil para testes automatizados)
  window.__pp = { state, player, ai, ball };
})();
