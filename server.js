const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const MAX_PLAYERS = 4;
const rooms = {};

function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  room.players.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    /* ===== ルーム作成 ===== */
    if (data.type === "create") {
      const key = data.roomKey;

      if (rooms[key]) {
        ws.send(JSON.stringify({
          type: "error",
          message: "room already exists"
        }));
        return;
      }

      rooms[key] = {
        host: ws,
        players: [ws],
        readySet: new Set(),
        confirmSet: new Set(),
        phase: "LOBBY"
      };

      ws.roomKey = key;
      ws.isHost = true;

      ws.send(JSON.stringify({
        type: "created",
        playerCount: 1,
        isHost: true
      }));

      return;
    }

    /* ===== ルーム参加 ===== */
    if (data.type === "join") {
      const key = data.roomKey;
      const room = rooms[key];

      if (!room) {
        ws.send(JSON.stringify({
          type: "error",
          message: "room not found"
        }));
        return;
      }

      if (room.players.length >= MAX_PLAYERS) {
        ws.send(JSON.stringify({
          type: "error",
          message: "room full"
        }));
        return;
      }

      room.players.push(ws);
      ws.roomKey = key;
      ws.isHost = false;

      broadcast(room, {
        type: "joined",
        playerCount: room.players.length
      });

      return;
    }

    const room = rooms[ws.roomKey];
    if (!room) return;

    /* ===== 準備OK ===== */
    if (data.type === "ready" && room.phase === "LOBBY") {
      room.readySet.add(ws);

      broadcast(room, {
        type: "ready_update",
        readyCount: room.readySet.size,
        playerCount: room.players.length
      });

      if (room.readySet.size === room.players.length && room.players.length >= 2) {
        room.phase = "CONFIRM";
        room.confirmSet.clear();
        broadcast(room, { type: "confirm_request" });
      }
    }

    /* ===== 開始確認 ===== */
    if (data.type === "confirm" && room.phase === "CONFIRM") {
      room.confirmSet.add(ws);

      broadcast(room, {
        type: "confirm_update",
        confirmCount: room.confirmSet.size,
        playerCount: room.players.length
      });

      if (room.confirmSet.size === room.players.length) {
        room.phase = "PLAYING";
        broadcast(room, { type: "start" });
      }
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomKey];
    if (!room) return;

    room.players = room.players.filter(p => p !== ws);
    room.readySet.delete(ws);
    room.confirmSet.delete(ws);
    room.phase = "LOBBY";

    // ホストが抜けたら解散（簡易）
    if (ws.isHost || room.players.length === 0) {
      broadcast(room, { type: "error", message: "room closed" });
      delete rooms[ws.roomKey];
      return;
    }

    broadcast(room, {
      type: "left",
      playerCount: room.players.length
    });
  });
});

console.log("Room create/join server started");
