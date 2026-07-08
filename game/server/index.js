/* ============================================================
   Campus Master Lab IA — Servidor multijugador (Fase 2+)
   Colyseus: cuentas con registro/login, persistencia de monedas
   y avatar por jugador, monedas del servidor, chat anti-spam.
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Server, Room } = require("colyseus");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");

// ---------- Persistencia simple en disco (prototipo) ----------
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let users = {};
try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
} catch (_) { users = {}; }

let saveTimer = null;
function saveUsers() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), () => {});
  }, 250);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

const USERNAME_RE = /^[\p{L}\p{N} _.-]{3,14}$/u;
const AVATARS = ["kai", "vera", "tato", "zoe"];

// ---------- Geometría de la plaza (espejo del cliente) ----------
const FLOOR_CX = 950, FLOOR_CY = 610, FLOOR_RX = 590, FLOOR_RY = 370;
const FOUNTAIN = { x: 945, y: 575, r: 185 };

function isWalkable(x, y) {
  const dx = (x - FLOOR_CX) / FLOOR_RX;
  const dy = (y - FLOOR_CY) / FLOOR_RY;
  if (dx * dx + dy * dy > 1) return false;
  return Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) > FOUNTAIN.r;
}

function randomFloorPoint() {
  for (let i = 0; i < 200; i++) {
    const x = FLOOR_CX - FLOOR_RX + Math.random() * FLOOR_RX * 2;
    const y = FLOOR_CY - FLOOR_RY + Math.random() * FLOOR_RY * 2;
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: 960, y: 880 };
}

// ---------- Estado sincronizado ----------
class Player extends Schema {}
defineTypes(Player, {
  name: "string",
  avatar: "string",
  x: "number",
  y: "number",
  flip: "boolean",
  moving: "boolean",
  dir: "string",
  score: "number",
});

class Coin extends Schema {}
defineTypes(Coin, { x: "number", y: "number" });

class PlazaState extends Schema {}
defineTypes(PlazaState, {
  players: { map: Player },
  coins: { map: Coin },
});

const COIN_COUNT = 8;
const PICKUP_DIST = 70;
const CHAT_MAX_LEN = 120;
// Anti-spam: máx. 3 mensajes por ventana de 5s y sin repetir el mismo texto
const CHAT_WINDOW_MS = 5000;
const CHAT_WINDOW_MAX = 3;

const onlineUsers = new Set(); // evita doble sesión de la misma cuenta

class PlazaRoom extends Room {
  async onAuth(client, options) {
    const username = String(options?.username || "").trim();
    const password = String(options?.password || "");
    const register = !!options?.register;

    if (!USERNAME_RE.test(username)) {
      throw new Error("El nombre debe tener de 3 a 14 caracteres (letras, números, espacios).");
    }
    if (password.length < 4) {
      throw new Error("La contraseña debe tener al menos 4 caracteres.");
    }
    const key = username.toLowerCase();

    if (register) {
      if (users[key]) throw new Error("Ese nombre ya está registrado. Inicia sesión.");
      const salt = crypto.randomBytes(12).toString("hex");
      users[key] = {
        name: username,
        salt,
        hash: hashPassword(password, salt),
        coins: 0,
        avatar: "kai",
        createdAt: new Date().toISOString(),
      };
      saveUsers();
    } else {
      const u = users[key];
      if (!u || u.hash !== hashPassword(password, u.salt)) {
        throw new Error("Nombre o contraseña incorrectos.");
      }
    }
    if (onlineUsers.has(key)) {
      throw new Error("Esa cuenta ya está conectada en otro dispositivo.");
    }
    onlineUsers.add(key);
    return { key };
  }

  onCreate() {
    this.maxClients = 40;
    this.setState(new PlazaState());
    this.state.players = new MapSchema();
    this.state.coins = new MapSchema();
    this.coinSeq = 0;
    this.chatLog = new Map();   // sessionId -> { times: [], last: "" }

    for (let i = 0; i < COIN_COUNT; i++) this.spawnCoin();

    // Movimiento: el cliente manda su posición; el server valida límites.
    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof data !== "object") return;
      const x = Number(data.x), y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!isWalkable(x, y)) return;
      p.x = x;
      p.y = y;
      p.flip = !!data.flip;
      p.moving = !!data.moving;
      if (data.dir === "up" || data.dir === "down" || data.dir === "side") p.dir = data.dir;
    });

    // Cambiar de avatar (se persiste en la cuenta)
    this.onMessage("avatar", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || !AVATARS.includes(data.avatar)) return;
      p.avatar = data.avatar;
      const u = users[client.auth?.key];
      if (u) { u.avatar = data.avatar; saveUsers(); }
    });

    // Recolección de moneda: validada y persistida.
    this.onMessage("collect", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.id !== "string") return;
      const coin = this.state.coins.get(data.id);
      if (!coin) return;
      if (Math.hypot(coin.x - p.x, coin.y - p.y) > PICKUP_DIST + 40) return;
      this.state.coins.delete(data.id);
      p.score += 1;
      const u = users[client.auth?.key];
      if (u) { u.coins = p.score; saveUsers(); }
      this.broadcast("collected", { id: data.id, by: client.sessionId });
      this.clock.setTimeout(() => this.spawnCoin(), 1500);
    });

    // Chat: anti-spam por ventana deslizante + sin mensajes repetidos.
    this.onMessage("chat", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.text !== "string") return;
      const text = data.text.trim().slice(0, CHAT_MAX_LEN);
      if (!text) return;

      const now = Date.now();
      let log = this.chatLog.get(client.sessionId);
      if (!log) { log = { times: [], last: "" }; this.chatLog.set(client.sessionId, log); }
      log.times = log.times.filter((t) => now - t < CHAT_WINDOW_MS);

      if (log.times.length >= CHAT_WINDOW_MAX) {
        client.send("chat-blocked", { reason: "Vas muy rápido: espera unos segundos ✋" });
        return;
      }
      if (text === log.last) {
        client.send("chat-blocked", { reason: "No repitas el mismo mensaje 🙃" });
        return;
      }
      log.times.push(now);
      log.last = text;
      this.broadcast("chat", { id: client.sessionId, text });
    });
  }

  spawnCoin() {
    const { x, y } = randomFloorPoint();
    const coin = new Coin();
    coin.x = x;
    coin.y = y;
    this.state.coins.set(`c${this.coinSeq++}`, coin);
  }

  onJoin(client) {
    const u = users[client.auth?.key] || {};
    const p = new Player();
    p.name = u.name || "Científic@";
    p.avatar = AVATARS.includes(u.avatar) ? u.avatar : "kai";
    const spawn = randomFloorPoint();
    p.x = spawn.x;
    p.y = spawn.y;
    p.flip = false;
    p.moving = false;
    p.dir = "down";
    p.score = u.coins || 0;
    this.state.players.set(client.sessionId, p);
    console.log(`+ ${p.name} (${p.avatar}) — ${this.state.players.size} en la plaza`);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    const u = users[client.auth?.key];
    if (p && u) { u.coins = p.score; saveUsers(); }
    if (client.auth?.key) onlineUsers.delete(client.auth.key);
    this.state.players.delete(client.sessionId);
    this.chatLog.delete(client.sessionId);
    console.log(`- ${client.sessionId} — ${this.state.players.size} en la plaza`);
  }
}

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: http.createServer() });
gameServer.define("plaza", PlazaRoom);
gameServer.listen(port).then(() => {
  console.log(`🧪✦ Servidor Campus Master Lab IA escuchando en ws://0.0.0.0:${port}`);
});
