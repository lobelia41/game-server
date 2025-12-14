const WebSocket = require("ws");

const PORT = 3000;
const wss = new WebSocket.Server({ port: PORT });

console.log("WebSocket server started on port", PORT);

wss.on("connection", ws => {
  console.log("client connected");

  ws.on("message", msg => {
    console.log("received:", msg.toString());
    ws.send(JSON.stringify({ type: "pong" }));
  });

  ws.on("close", () => {
    console.log("client disconnected");
  });
});
