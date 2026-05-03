import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect,
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
const roomInput = document.getElementById("roomId");
const roleSelect = document.getElementById("role");
const joinButton = document.getElementById("joinButton");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let roomId = "";
let role = "";
let playerId = "";
let players = {};

let myPlayer = {
  x: 180,
  y: 260,
  role: "runner",
  alive: true,
  updatedAt: 0
};

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

joinButton.onclick = async () => {
  roomId = roomInput.value.trim().toUpperCase();
  role = roleSelect.value;

  if (!roomId) {
    alert("部屋コードを入力してください");
    return;
  }

  playerId = role;
  myPlayer.role = role;

  if (role === "runner") {
    myPlayer.x = 80;
    myPlayer.y = 260;
  } else {
    myPlayer.x = 280;
    myPlayer.y = 260;
  }

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);

  await set(playerRef, {
    ...myPlayer,
    updatedAt: serverTimestamp()
  });

  onDisconnect(playerRef).remove();

  onValue(ref(db, `rooms/${roomId}/players`), snapshot => {
    players = snapshot.val() || {};
  });

  menu.style.display = "none";
};

// キーボード操作 PC用
window.addEventListener("keydown", e => {
  if (e.key === "ArrowUp" || e.key === "w") keys.up = true;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = true;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
});

window.addEventListener("keyup", e => {
  if (e.key === "ArrowUp" || e.key === "w") keys.up = false;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = false;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
});

// スマホ操作：画面を押している方向に移動
let touchTarget = null;

canvas.addEventListener("touchstart", e => {
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();

  touchTarget = {
    x: t.clientX - rect.left,
    y: t.clientY - rect.top
  };
});

canvas.addEventListener("touchmove", e => {
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();

  touchTarget = {
    x: t.clientX - rect.left,
    y: t.clientY - rect.top
  };

  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", () => {
  touchTarget = null;
});

function updateLocalPlayer() {
  if (!roomId || !playerId) return;

  let dx = 0;
  let dy = 0;

  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;

  if (touchTarget) {
    dx = touchTarget.x - myPlayer.x;
    dy = touchTarget.y - myPlayer.y;

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
  }

  const speed = role === "runner" ? 2.3 : 2.0;

  myPlayer.x += dx * speed;
  myPlayer.y += dy * speed;

  myPlayer.x = Math.max(10, Math.min(canvas.width - 10, myPlayer.x));
  myPlayer.y = Math.max(10, Math.min(canvas.height - 10, myPlayer.y));
}

let lastSync = 0;

function syncPlayer() {
  if (!roomId || !playerId) return;

  const now = Date.now();

  // 1秒20回くらいに制限
  if (now - lastSync < 50) return;
  lastSync = now;

  update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    x: Math.round(myPlayer.x),
    y: Math.round(myPlayer.y),
    role: myPlayer.role,
    alive: myPlayer.alive,
    updatedAt: serverTimestamp()
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // マップ枠
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  // 発電機仮表示
  drawGenerator(80, 80);
  drawGenerator(280, 120);
  drawGenerator(180, 420);

  // ゲート仮表示
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(canvas.width / 2 - 30, 10, 60, 10);

  Object.keys(players).forEach(id => {
    const p = players[id];

    if (p.role === "runner") {
      ctx.fillStyle = "#38bdf8";
    } else {
      ctx.fillStyle = "#ef4444";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.role === "killer" ? 13 : 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.role === "runner" ? "逃" : "鬼", p.x, p.y - 18);
  });

  // 接触判定の仮表示
  const runner = players.runner;
  const killer = players.killer;

  if (runner && killer) {
    const dist = Math.hypot(runner.x - killer.x, runner.y - killer.y);

    if (dist < 24) {
      ctx.fillStyle = "white";
      ctx.font = "24px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("捕獲！", canvas.width / 2, canvas.height / 2);
    }
  }
}

function drawGenerator(x, y) {
  ctx.fillStyle = "#facc15";
  ctx.fillRect(x - 12, y - 12, 24, 24);

  ctx.fillStyle = "#111827";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("発", x, y + 4);
}

function loop() {
  updateLocalPlayer();
  syncPlayer();
  draw();
  requestAnimationFrame(loop);
}

loop();
