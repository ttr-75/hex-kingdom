import 'dotenv/config';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom';

const app = express();
const port = Number(process.env.PORT) || 2567;

// Middleware
app.use(cors());
app.use(express.json());

// HTTP Server
const httpServer = createServer(app);

// Colyseus Server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer
  })
});

// Register rooms
gameServer.define('game', GameRoom);

// Monitoring (nur für Development)
if (process.env.NODE_ENV !== 'production') {
  app.use('/colyseus', monitor());
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API Endpoints
app.get('/api/rooms', async (_req, res) => {
  const rooms = await (gameServer as any).matchMaker.query({});
  res.json(rooms);
});

// Start server
httpServer.listen(port, () => {
  console.log(`🎮 Hex Kingdom Server läuft auf Port ${port}`);
  console.log(`📊 Monitor verfügbar unter http://localhost:${port}/colyseus`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM empfangen, fahre Server herunter...');
  gameServer.gracefullyShutdown(true);
});
