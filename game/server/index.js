/* ============================================================
   Campus Master Lab IA — Servidor multijugador (Fase 3)
   9 salas (Colyseus filterBy roomId), cuentas persistentes,
   monedas por sala, chat anti-spam, asientos y emotes.
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
const AVATARS = ["kai", "vera", "tato", "zoe", "max", "nina", "leo", "robi"];
const ROOM_IDS = ["plaza", "cafe", "juegos", "auditorio", "biblioteca", "jardin", "robots", "observatorio", "taller"];

// ---------- Geometría (espejo del cliente) ----------
const FLOOR_CX = 950, FLOOR_CY = 610, FLOOR_RX = 590, FLOOR_RY = 370;
const FOUNTAIN = { x: 945, y: 575, r: 185 };

function makeIsWalkable(hasFountain) {
  return (x, y) => {
    const dx = (x - FLOOR_CX) / FLOOR_RX;
    const dy = (y - FLOOR_CY) / FLOOR_RY;
    if (dx * dx + dy * dy > 1) return false;
    if (hasFountain && Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) <= FOUNTAIN.r) return false;
    return true;
  };
}

function makeRandomFloorPoint(isWalkable) {
  return () => {
    for (let i = 0; i < 200; i++) {
      const x = FLOOR_CX - FLOOR_RX + Math.random() * FLOOR_RX * 2;
      const y = FLOOR_CY - FLOOR_RY + Math.random() * FLOOR_RY * 2;
      if (isWalkable(x, y)) return { x, y };
    }
    return { x: 960, y: 880 };
  };
}

// ---------- Estado sincronizado ----------
class Player extends Schema {}
defineTypes(Player, {
  name: "string",
  avatar: "string",
  admin: "boolean",
  x: "number",
  y: "number",
  flip: "boolean",
  moving: "boolean",
  dir: "string",
  sit: "number",     // índice de asiento o -1
  score: "number",
});

class Coin extends Schema {}
defineTypes(Coin, { x: "number", y: "number" });

class SalaState extends Schema {}
defineTypes(SalaState, {
  players: { map: Player },
  coins: { map: Coin },
});

const COIN_COUNT = 8;
const PICKUP_DIST = 70;
const CHAT_MAX_LEN = 120;
const CHAT_WINDOW_MS = 5000;
const CHAT_WINDOW_MAX = 3;
const EMOTES = ["dance", "laugh", "wave", "heart", "party"];
const EMOTE_COOLDOWN_MS = 1200;
const MAX_SEATS = 12;

const onlineUsers = new Set();

// ---------- Búsqueda del Tesoro (estado global entre salas) ----------
const hunt = { active: false, area: null, x: 0, y: 0, prize: 0 };
const liveRooms = new Set();
function globalBroadcast(type, data) {
  for (const r of liveRooms) r.broadcast(type, data);
}
const ROOM_NAMES = {
  plaza: "Plaza Central", cafe: "Café IA", juegos: "Sala de Juegos",
  auditorio: "Auditorio", biblioteca: "Biblioteca", jardin: "Jardín Neural",
  robots: "Lab de Robots", observatorio: "Observatorio", taller: "Taller Maker",
};

class SalaRoom extends Room {
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

    // Al viajar entre salas hay un leave+join rápido: dar margen a que
    // la sesión anterior se libere antes de rechazar por doble sesión.
    for (let i = 0; i < 8 && onlineUsers.has(key); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (onlineUsers.has(key)) {
      throw new Error("Esa cuenta ya está conectada en otro dispositivo.");
    }
    onlineUsers.add(key);
    return { key };
  }

  onCreate(options) {
    this.area = ROOM_IDS.includes(options?.area) ? options.area : "plaza";
    this.maxClients = 40;
    this.setState(new SalaState());
    this.state.players = new MapSchema();
    this.state.coins = new MapSchema();
    this.coinSeq = 0;
    this.chatLog = new Map();
    this.lastEmoteAt = new Map();

    this.isWalkable = makeIsWalkable(this.area === "plaza");
    this.randomFloorPoint = makeRandomFloorPoint(this.isWalkable);

    for (let i = 0; i < COIN_COUNT; i++) this.spawnCoin();
    liveRooms.add(this);
    console.log(`[sala:${this.area}] creada`);

    const isAdmin = (client) => users[client.auth?.key]?.role === "admin";

    // --- Panel de Host ---
    this.onMessage("admin:announce", (client, data) => {
      if (!isAdmin(client)) return;
      const text = String(data?.text || "").trim().slice(0, 140);
      if (!text) return;
      globalBroadcast("announce", { text });
    });

    this.onMessage("admin:hunt", (client, data) => {
      if (!isAdmin(client)) return;
      const area = ROOM_IDS.includes(data?.area) ? data.area : null;
      const prize = Math.max(1, Math.min(500, Number(data?.prize) || 100));
      if (!area || hunt.active) return;
      const walk = makeIsWalkable(area === "plaza");
      const spot = makeRandomFloorPoint(walk)();
      hunt.active = true;
      hunt.area = area;
      hunt.x = spot.x;
      hunt.y = spot.y;
      hunt.prize = prize;
      globalBroadcast("announce", {
        text: `🔎 ¡BÚSQUEDA DEL TESORO! Una Chispa Dorada de ${prize} Master Coins está escondida en el campus…`,
      });
      for (const r of liveRooms) {
        if (r.area === area) r.broadcast("hunt-spawn", { x: hunt.x, y: hunt.y, prize });
      }
      console.log(`[hunt] escondida en ${area} (${spot.x | 0},${spot.y | 0}) premio ${prize}`);
    });

    this.onMessage("admin:hunt-cancel", (client) => {
      if (!isAdmin(client) || !hunt.active) return;
      hunt.active = false;
      globalBroadcast("hunt-despawn", {});
      globalBroadcast("announce", { text: "La Búsqueda del Tesoro fue cancelada." });
    });

    this.onMessage("hunt-claim", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !hunt.active || hunt.area !== this.area) return;
      if (Math.hypot(p.x - hunt.x, p.y - hunt.y) > 95) return;
      hunt.active = false;
      p.score += hunt.prize;
      const u = users[client.auth?.key];
      if (u) { u.coins = p.score; saveUsers(); }
      globalBroadcast("hunt-despawn", {});
      globalBroadcast("announce", {
        text: `🏆 ¡${p.name} encontró la Chispa Dorada en ${ROOM_NAMES[this.area]}! +${hunt.prize} Master Coins`,
      });
      console.log(`[hunt] encontrada por ${p.name} (+${hunt.prize})`);
    });

    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof data !== "object") return;
      const x = Number(data.x), y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!this.isWalkable(x, y)) return;
      p.x = x;
      p.y = y;
      p.flip = !!data.flip;
      p.moving = !!data.moving;
      p.sit = -1;
      if (data.dir === "up" || data.dir === "down" || data.dir === "side") p.dir = data.dir;
    });

    this.onMessage("sit", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const seat = Number(data?.seat);
      if (!Number.isInteger(seat) || seat < -1 || seat >= MAX_SEATS) return;
      p.sit = seat;
      p.moving = false;
    });

    this.onMessage("emote", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !EMOTES.includes(data?.type)) return;
      const now = Date.now();
      if (now - (this.lastEmoteAt.get(client.sessionId) || 0) < EMOTE_COOLDOWN_MS) return;
      this.lastEmoteAt.set(client.sessionId, now);
      this.broadcast("emote", { id: client.sessionId, type: data.type });
    });

    this.onMessage("avatar", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || !AVATARS.includes(data.avatar)) return;
      p.avatar = data.avatar;
      const u = users[client.auth?.key];
      if (u) { u.avatar = data.avatar; saveUsers(); }
    });

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
    const { x, y } = this.randomFloorPoint();
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
    const spawn = this.randomFloorPoint();
    p.x = spawn.x;
    p.y = spawn.y;
    p.flip = false;
    p.moving = false;
    p.dir = "down";
    p.sit = -1;
    p.score = u.coins || 0;
    p.admin = u.role === "admin";
    this.state.players.set(client.sessionId, p);
    if (hunt.active && hunt.area === this.area) {
      client.send("hunt-spawn", { x: hunt.x, y: hunt.y, prize: hunt.prize });
    }
    console.log(`[sala:${this.area}] + ${p.name} (${p.avatar}) — ${this.state.players.size}`);
  }

  onDispose() {
    liveRooms.delete(this);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    const u = users[client.auth?.key];
    if (p && u) { u.coins = p.score; saveUsers(); }
    if (client.auth?.key) onlineUsers.delete(client.auth.key);
    this.state.players.delete(client.sessionId);
    this.chatLog.delete(client.sessionId);
    this.lastEmoteAt.delete(client.sessionId);
    console.log(`[sala:${this.area}] - ${client.sessionId} — ${this.state.players.size}`);
  }
}

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: http.createServer() });
gameServer.define("sala", SalaRoom).filterBy(["area"]);
gameServer.listen(port).then(() => {
  console.log(`🧪✦ Servidor Campus Master Lab IA (9 salas) en ws://0.0.0.0:${port}`);
});
