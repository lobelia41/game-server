const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const wss = new WebSocket.Server({ port: PORT });

wss.on("connection", ws => {
  console.log("client connected");

  ws.on("message", msg => {
    console.log("received:", msg.toString());
    ws.send("pong");
  });
});

console.log("WebSocket server started on port " + PORT);
