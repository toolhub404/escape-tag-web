import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEmqGFIKncZskk4LD92il-ekSvUANulos",
  authDomain: "escape-tag-game.firebaseapp.com",
  databaseURL: "https://escape-tag-game-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "escape-tag-game",
  storageBucket: "escape-tag-game.firebasestorage.app",
  messagingSenderId: "945709179251",
  appId: "1:945709179251:web:6c51da59359caae6592506"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const menu = document.getElementById("menu");
const gameScreen = document.getElementById("gameScreen");
const roomInput = document.getElementById("roomId");
const roleSelect = document.getElementById("role");
const joinButton = document.getElementById("joinButton");
const randomRoomButton = document.getElementById("randomRoomButton");
const leaveButton = document.getElementById("leaveButton");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const roomLabel = document.getElementById("roomLabel");
const roleLabel = document.getElementById("roleLabel");
const statusText = document.getElementById("statusText");
const hintText = document.getElementById("hintText");
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
const actionButton = document.getElementById("actionButton");
const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");

function isGameActive() {
  return connected && !gameScreen.classList.contains("hidden");
}

function setPlayingUi(active) {
  if (active) {
    document.body.classList.add("playing");
  } else {
    document.body.classList.remove("playing");
  }
}

// ピンチズーム / スクロール / ダブルタップズーム抑制
let lastTouchEndTime = 0;

document.addEventListener("gesturestart", event => {
  if (isGameActive()) event.preventDefault();
}, { passive: false });

document.addEventListener("gesturechange", event => {
  if (isGameActive()) event.preventDefault();
}, { passive: false });

document.addEventListener("gestureend", event => {
  if (isGameActive()) event.preventDefault();
}, { passive: false });

document.addEventListener("touchmove", event => {
  if (!isGameActive()) return;

  const target = event.target;
  if (target && target.closest && target.closest(".game-screen")) {
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener("touchend", event => {
  if (!isGameActive()) return;

  const now = Date.now();
  if (now - lastTouchEndTime < 300) {
    event.preventDefault();
  }
  lastTouchEndTime = now;
}, { passive: false });

window.addEventListener("wheel", event => {
  if (isGameActive()) event.preventDefault();
}, { passive: false });

const restartButton = document.getElementById("restartButton");
const backMenuButton = document.getElementById("backMenuButton");

let roomId = "";
let role = "";
let playerId = "";
let players = {};
let roomState = defaultState();
let connected = false;
let lastSync = 0;
let captureCooldownUntil = 0;
let actionPressed = false;

let myPlayer = { x: 90, y: 202, role: "runner", alive: true, updatedAt: 0 };
const input = { x: 0, y: 0 };

const MAP = {
  w: 720,
  h: 405,
  generatorsNeeded: 2,
  runnerLivesMax: 2,
  captureDistance: 27,
  repairDistance: 36,
  gateDistance: 38,
  repairPerSecond: 30,
  syncMs: 50
};

const generators = [
  { id: "g1", x: 95, y: 72 },
  { id: "g2", x: 605, y: 92 },
  { id: "g3", x: 160, y: 315 },
  { id: "g4", x: 560, y: 318 }
];

const gates = [
  { id: "left", x: 14, y: 202, w: 20, h: 92 },
  { id: "right", x: 706, y: 202, w: 20, h: 92 }
];

const walls = [
  { x: 155, y: 54, w: 152, h: 22 },
  { x: 420, y: 58, w: 132, h: 22 },
  { x: 60, y: 160, w: 148, h: 22 },
  { x: 286, y: 142, w: 150, h: 22 },
  { x: 520, y: 164, w: 138, h: 22 },
  { x: 160, y: 246, w: 122, h: 22 },
  { x: 370, y: 252, w: 158, h: 22 },
  { x: 280, y: 338, w: 162, h: 22 }
];

function defaultState() {
  return {
    status: "playing",
    winner: null,
    runnerLives: 2,
    fixed: {},
    progress: {},
    gateOpen: false,
    captures: 0,
    updatedAt: 0
  };
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

randomRoomButton.onclick = () => roomInput.value = randomRoomCode();

joinButton.onclick = async () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) {
    statusText.textContent = "部屋コードを入力してください";
    return;
  }

  roomId = code;
  role = roleSelect.value;
  playerId = role;

  myPlayer = {
    x: role === "runner" ? 90 : 630,
    y: 202,
    role,
    alive: true,
    updatedAt: 0
  };

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await set(playerRef, { ...myPlayer, updatedAt: serverTimestamp() });
  onDisconnect(playerRef).remove();

  await update(ref(db, `rooms/${roomId}/state`), {
    status: "playing",
    updatedAt: serverTimestamp()
  });

  onValue(ref(db, `rooms/${roomId}/players`), snapshot => {
    players = snapshot.val() || {};
  });

  onValue(ref(db, `rooms/${roomId}/state`), snapshot => {
    roomState = { ...defaultState(), ...(snapshot.val() || {}) };
    handleWinDisplay();
  });

  connected = true;
  setPlayingUi(true);
  menu.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  roomLabel.textContent = `ROOM ${roomId}`;
  roleLabel.textContent = role === "runner" ? "逃走者" : "鬼";
  resultOverlay.classList.add("hidden");
};

leaveButton.onclick = async () => await leaveRoom();
backMenuButton.onclick = async () => { resultOverlay.classList.add("hidden"); await leaveRoom(); };

restartButton.onclick = async () => {
  if (!roomId) return;
  await set(ref(db, `rooms/${roomId}/state`), { ...defaultState(), updatedAt: serverTimestamp() });
  await update(ref(db, `rooms/${roomId}/players/runner`), { x: 90, y: 202, alive: true, updatedAt: serverTimestamp() });
  await update(ref(db, `rooms/${roomId}/players/killer`), { x: 630, y: 202, alive: true, updatedAt: serverTimestamp() });

  if (role === "runner") { myPlayer.x = 90; myPlayer.y = 202; }
  else { myPlayer.x = 630; myPlayer.y = 202; }

  resultOverlay.classList.add("hidden");
};

async function leaveRoom() {
  if (roomId && playerId) await remove(ref(db, `rooms/${roomId}/players/${playerId}`));

  connected = false;
  roomId = "";
  role = "";
  playerId = "";
  players = {};
  roomState = defaultState();

  resultOverlay.classList.add("hidden");
  gameScreen.classList.add("hidden");
  setPlayingUi(false);
  menu.classList.remove("hidden");
}

window.addEventListener("keydown", e => {
  if (e.key === "ArrowUp" || e.key === "w") input.y = -1;
  if (e.key === "ArrowDown" || e.key === "s") input.y = 1;
  if (e.key === "ArrowLeft" || e.key === "a") input.x = -1;
  if (e.key === "ArrowRight" || e.key === "d") input.x = 1;
  if (e.key === " ") actionPressed = true;
});

window.addEventListener("keyup", e => {
  if (["ArrowUp", "w", "ArrowDown", "s"].includes(e.key)) input.y = 0;
  if (["ArrowLeft", "a", "ArrowRight", "d"].includes(e.key)) input.x = 0;
  if (e.key === " ") actionPressed = false;
});

let joystickPointer = null;

joystick.addEventListener("pointerdown", e => {
  joystickPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  updateJoystick(e);
});

joystick.addEventListener("pointermove", e => {
  if (e.pointerId !== joystickPointer) return;
  updateJoystick(e);
});

joystick.addEventListener("pointerup", e => {
  if (e.pointerId !== joystickPointer) return;
  joystickPointer = null;
  input.x = 0;
  input.y = 0;
  resetStickPosition();
});

function resetStickPosition() {
  const isSmallHeight = window.innerHeight <= 430;
  stick.style.left = isSmallHeight ? "27px" : "32px";
  stick.style.top = isSmallHeight ? "27px" : "32px";
}

function updateJoystick(e) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = Math.min(34, rect.width * 0.31);
  const len = Math.hypot(dx, dy);

  if (len > max) {
    dx = dx / len * max;
    dy = dy / len * max;
  }

  input.x = dx / max;
  input.y = dy / max;

  const base = (rect.width - stick.offsetWidth) / 2;
  stick.style.left = `${base + dx}px`;
  stick.style.top = `${base + dy}px`;
}

// ACTION長押し時にiPhoneのコピー/選択メニューが出ないようにする
document.addEventListener("contextmenu", event => {
  event.preventDefault();
});

document.addEventListener("selectstart", event => {
  const target = event.target;
  if (target && target.closest && target.closest(".game-screen")) {
    event.preventDefault();
  }
});

actionButton.addEventListener("pointerdown", event => {
  event.preventDefault();
  actionPressed = true;
  try {
    actionButton.setPointerCapture(event.pointerId);
  } catch (e) {}
});

actionButton.addEventListener("pointerup", event => {
  event.preventDefault();
  actionPressed = false;
});

actionButton.addEventListener("pointercancel", event => {
  event.preventDefault();
  actionPressed = false;
});

actionButton.addEventListener("pointerleave", () => {
  actionPressed = false;
});

actionButton.addEventListener("touchstart", event => {
  event.preventDefault();
}, { passive: false });

actionButton.addEventListener("touchend", event => {
  event.preventDefault();
}, { passive: false });

function updateLocal(dt) {
  if (!connected || roomState.winner) return;

  let dx = input.x;
  let dy = input.y;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }

  const speed = role === "runner" ? 150 : 134;
  const oldX = myPlayer.x;
  const oldY = myPlayer.y;

  myPlayer.x += dx * speed * dt;
  if (collidesWithWalls(myPlayer.x, myPlayer.y)) myPlayer.x = oldX;

  myPlayer.y += dy * speed * dt;
  if (collidesWithWalls(myPlayer.x, myPlayer.y)) myPlayer.y = oldY;

  myPlayer.x = clamp(myPlayer.x, 16, MAP.w - 16);
  myPlayer.y = clamp(myPlayer.y, 16, MAP.h - 16);

  if (actionPressed) handleAction(dt);
}

function handleAction(dt) {
  if (!connected || roomState.winner) return;

  if (role === "runner") {
    const gen = nearestGenerator();

    if (gen && dist(myPlayer, gen) < MAP.repairDistance && !roomState.fixed?.[gen.id]) {
      const current = roomState.progress?.[gen.id] || 0;
      const next = Math.min(100, current + MAP.repairPerSecond * dt);
      const fixedObj = { ...(roomState.fixed || {}) };

      if (next >= 100) fixedObj[gen.id] = true;

      const patch = {};
      patch[`progress/${gen.id}`] = Math.round(next);
      if (next >= 100) patch[`fixed/${gen.id}`] = true;
      if (countFixed(fixedObj) >= MAP.generatorsNeeded) patch.gateOpen = true;

      update(ref(db, `rooms/${roomId}/state`), { ...patch, updatedAt: serverTimestamp() });
      return;
    }

    if (roomState.gateOpen) {
      const gate = nearestGate();
      if (gate && gateDistance(gate, myPlayer) < MAP.gateDistance) setWinner("runner");
    }
  }

  if (role === "killer") {
    const now = Date.now();
    if (now < captureCooldownUntil) return;

    const runner = players.runner;
    if (!runner) return;

    if (Math.hypot(runner.x - myPlayer.x, runner.y - myPlayer.y) < MAP.captureDistance) {
      captureCooldownUntil = now + 1800;
      const lives = Math.max(0, (roomState.runnerLives ?? MAP.runnerLivesMax) - 1);
      const captures = (roomState.captures || 0) + 1;

      if (lives <= 0 || captures >= MAP.runnerLivesMax) {
        setWinner("killer");
      } else {
        update(ref(db, `rooms/${roomId}/state`), {
          runnerLives: lives,
          captures,
          updatedAt: serverTimestamp()
        });

        update(ref(db, `rooms/${roomId}/players/runner`), {
          x: 90,
          y: 202,
          updatedAt: serverTimestamp()
        });
      }
    }
  }
}

function syncPlayer() {
  if (!connected || !roomId || !playerId) return;

  const now = Date.now();
  if (now - lastSync < MAP.syncMs) return;
  lastSync = now;

  update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    x: Math.round(myPlayer.x),
    y: Math.round(myPlayer.y),
    role: myPlayer.role,
    alive: myPlayer.alive,
    updatedAt: serverTimestamp()
  });
}

function setWinner(winner) {
  update(ref(db, `rooms/${roomId}/state`), {
    winner,
    status: "ended",
    updatedAt: serverTimestamp()
  });
}

function handleWinDisplay() {
  if (!roomState.winner) {
    resultOverlay.classList.add("hidden");
    return;
  }

  resultOverlay.classList.remove("hidden");

  const isMe = roomState.winner === role;
  resultTitle.textContent = isMe ? "勝利！" : "敗北...";
  resultMessage.textContent =
    roomState.winner === "runner"
      ? "逃走者がゲートから脱出しました。"
      : "鬼が逃走者を2回捕獲しました。";
}

function draw() {
  ctx.clearRect(0, 0, MAP.w, MAP.h);
  drawBackground();
  drawWalls();
  drawGenerators();
  drawGates();
  drawPlayers();
  drawHudOnCanvas();
}

function drawBackground() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, MAP.w, MAP.h);

  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, MAP.w - 16, MAP.h - 16);

  ctx.fillStyle = "rgba(34,197,94,0.10)";
  ctx.fillRect(42, 104, 118, 62);
  ctx.fillRect(520, 232, 126, 72);
  ctx.fillRect(270, 272, 128, 58);
}

function drawWalls() {
  walls.forEach(w => {
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#9ca3af";
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  });
}

function drawGenerators() {
  generators.forEach(g => {
    const fixed = !!roomState.fixed?.[g.id];
    const progress = fixed ? 100 : (roomState.progress?.[g.id] || 0);

    ctx.fillStyle = fixed ? "#22c55e" : "#facc15";
    roundRect(g.x - 17, g.y - 17, 34, 34, 8);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("発", g.x, g.y + 5);

    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.fillRect(g.x - 24, g.y + 25, 48, 6);
    ctx.fillStyle = fixed ? "#22c55e" : "#38bdf8";
    ctx.fillRect(g.x - 24, g.y + 25, 48 * progress / 100, 6);
  });
}

function drawGates() {
  gates.forEach(g => {
    ctx.fillStyle = roomState.gateOpen ? "#22c55e" : "#374151";
    ctx.fillRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "white";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(roomState.gateOpen ? "EXIT" : "LOCK", 0, 4);
    ctx.restore();
  });
}

function drawPlayers() {
  Object.keys(players).forEach(id => {
    const p = players[id];

    ctx.fillStyle = p.role === "runner" ? "#38bdf8" : "#ef4444";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.role === "killer" ? 15 : 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.role === "runner" ? "逃" : "鬼", p.x, p.y - 22);
  });
}

function drawHudOnCanvas() {
  const fixedCount = countFixed(roomState.fixed || {});

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(14, 14, 172, 56, 12);
  ctx.fill();

  ctx.fillStyle = "white";
  ctx.font = "bold 14px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`発電機 ${fixedCount}/${MAP.generatorsNeeded}`, 26, 38);
  ctx.fillText(`逃走者ライフ ${roomState.runnerLives ?? MAP.runnerLivesMax}`, 26, 60);
}

function updateStatusText() {
  const fixedCount = countFixed(roomState.fixed || {});
  const runnerOnline = !!players.runner;
  const killerOnline = !!players.killer;

  if (!connected) return;

  if (!runnerOnline || !killerOnline) {
    statusText.textContent = "相手待ち：同じ部屋コードで別役割の人を入れてください";
    return;
  }

  if (roomState.winner) {
    statusText.textContent = roomState.winner === "runner" ? "逃走者の勝利" : "鬼の勝利";
    return;
  }

  if (role === "runner") {
    statusText.textContent = roomState.gateOpen
      ? "ゲートが開いた！出口でACTION"
      : `発電機を修理：${fixedCount}/${MAP.generatorsNeeded}`;
    hintText.textContent = "発電機の近くでACTION長押し。ゲートが開いたら出口でACTION。";
  } else {
    const cd = Math.max(0, Math.ceil((captureCooldownUntil - Date.now()) / 1000));
    statusText.textContent = cd > 0 ? `捕獲クールタイム ${cd}秒` : "逃走者に近づいてACTIONで捕獲";
    hintText.textContent = "逃走者に近づいてACTION。2回捕獲で勝利。";
  }
}

function collidesWithWalls(x, y) {
  const r = role === "killer" ? 14 : 11;
  return walls.some(w => circleRectCollision(x, y, r, w));
}

function circleRectCollision(cx, cy, r, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function nearestGenerator() {
  let best = null;
  let bestD = Infinity;

  generators.forEach(g => {
    const d = dist(myPlayer, g);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  });

  return best;
}

function nearestGate() {
  let best = null;
  let bestD = Infinity;

  gates.forEach(g => {
    const d = gateDistance(g, myPlayer);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  });

  return best;
}

function gateDistance(gate, p) {
  return Math.hypot(gate.x - p.x, gate.y - p.y);
}

function countFixed(fixed) {
  return Object.values(fixed || {}).filter(Boolean).length;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let lastTime = performance.now();

function loop(now = performance.now()) {
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;

  updateLocal(dt);
  syncPlayer();
  draw();
  updateStatusText();

  requestAnimationFrame(loop);
}

loop();
