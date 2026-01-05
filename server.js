const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {}; // roomId -> room

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj) {
  [...room.players, ...room.spectators].forEach(c => {
    send(c.ws, obj);
  });
}

function roomInfo(room) {
  return {
    type: "roomInfo",
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      isHost: p.isHost
    })),
    spectators: room.spectators.map(s => ({
      id: s.id,
      name: s.name
    })),
    playerCount: room.players.length,
    spectatorCount: room.spectators.length,
    maxPlayers: room.maxPlayers,
    maxSpectators: room.maxSpectators,
    phase: room.phase
  };
}

function ensureHost(room) {
  if (!room.players.some(p => p.isHost) && room.players.length > 0) {
    room.players[0].isHost = true;
  }
}

function onPlayerDisconnected(room, disconnectedId) {
    // プレイヤーから削除
    room.players = room.players.filter(p => p.id !== disconnectedId);

    // 人数チェック
    if (room.players.length <= 1) {
        broadcast(room, {
            type: "gameAbort",
            reason: "notEnoughPlayers"
        });
        destroyRoom(room);
        return;
    }

    // ホスト切断なら権限移譲
    if (room.hostId === disconnectedId) {
        const newHost = room.players[0];
        newHost.isHost = true;
        room.hostId = newHost.id;
    }

    broadcastRoomInfo(room);
}

wss.on("connection", ws => {
  ws.id = null;
  ws.roomId = null;

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    // ===== ルーム作成 or 参加 =====
if (data.type === "join") {
  const roomId = data.roomId;
  const clientId = data.id;
  const isHost = data.isHost === true;

  // ルームが無い & ホストじゃない → 失敗
  if (!rooms[roomId] && !isHost) {
    send(ws, {
      type: "joinResult",
      success: false,
      reason: "room_not_found"
    });
    return;
  }

  // ホストなら作成
  if (!rooms[roomId]) {
    rooms[roomId] = {
      maxPlayers: 4,
      maxSpectators: 1,
      players: [],
      spectators: [],
      phase: "waiting"
      selectedChars: {} 
    };
  }

  const room = rooms[roomId];

  ws.id = clientId;
  ws.roomId = roomId;

  // ===== プレイヤー or 観戦 判定 =====
  if (room.players.length < room.maxPlayers && room.phase === "waiting") {
    // プレイヤーとして参加
    room.players.push({
      id: ws.id,
      name: data.name || "NoName",
      ws,
      ready: false,
      isHost: room.players.length === 0
    });
  } else {
    // 満員処理
   if (room.spectators.length >= room.maxSpectators) {
    send(ws, {
      type: "joinResult",
      success: false,
      reason: "spectator_full"
    });
    return;
   }
    // 観戦として参加
    room.spectators.push({
      id: ws.id,
      name: data.name || "NoName",
      ws
    });
  }

  // 成功通知（観戦でも success=true）
  send(ws, {
    type: "joinResult",
    success: true
  });

  broadcast(room, roomInfo(room));
}

if (data.type === "leave") {
  const room = rooms[ws.roomId];
  if (!room) return;

  room.players = room.players.filter(p => p.id !== ws.id);
  room.spectators = room.spectators.filter(s => s.id !== ws.id);

  ensureHost(room);
  broadcast(room, roomInfo(room));
}

    // ===== 準備完了 =====
    if (data.type === "ready") {
      const room = rooms[ws.roomId];
      if (!room) return;

      const player = room.players.find(p => p.id === ws.id);
      if (player) {
        player.ready = data.ready;
        broadcast(room, roomInfo(room));
      }
    }

    // ===== ゲーム開始（ホストのみ）=====
    if (data.type === "start") {
      const room = rooms[ws.roomId];
      if (!room) return;

      const player = room.players.find(p => p.id === ws.id);
      if (!player || !player.isHost) return;

      if (
        room.players.length >= 2 &&
        room.players.every(p => p.ready || p.isHost)
      ) {
        room.selectedChars = {};
        room.phase = "playing";
        broadcast(room, { type: "gameStart" });
      }
    }

if (data.type === "requestRoomInfo") {
  const room = rooms[ws.roomId];
  if (!room) return;

  send(ws, roomInfo(room));
}

if (data.type === "selectChar") {
  const room = rooms[ws.roomId];
  if (!room) return;

  room.selectedChars[ws.id] = data.charId;

  // 全員分そろった？
  if (Object.keys(room.selectedChars).length === room.players.length) {
    broadcast(room, {
      type: "charResult",
      results: Object.entries(room.selectedChars).map(
        ([playerId, charId]) => ({ playerId, charId })
      )
    });
  }
}
    
    // ===== 役割変更 =====
if (data.type === "changeRole") {
  const room = rooms[ws.roomId];
  if (!room || room.phase !== "waiting") return;

  // 今の情報を取得
  let user =
    room.players.find(p => p.id === ws.id) ||
    room.spectators.find(s => s.id === ws.id);

  if (!user) return;

  const name = user.name;

  // 削除
  room.players = room.players.filter(p => p.id !== ws.id);
  room.spectators = room.spectators.filter(s => s.id !== ws.id);

  if (data.to === "player") {
    if (room.players.length < room.maxPlayers) {
      room.players.push({
        id: ws.id,
        name,
        ws,
        ready: false,
        isHost: false
      });
    } else {
      room.spectators.push({ id: ws.id, name, ws });
    }
  } else {
    room.spectators.push({ id: ws.id, name, ws });
  }

  ensureHost(room);
  broadcast(room, roomInfo(room));
}
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;

    room.players = room.players.filter(p => p.id !== ws.id);
    room.spectators = room.spectators.filter(s => s.id !== ws.id);

    if (room.players.length === 0 && room.spectators.length === 0) {
      delete rooms[ws.roomId];
      return;
    }

    ensureHost(room);
    broadcast(room, roomInfo(room));
  });
});

console.log("WebSocket server started on port " + PORT);
