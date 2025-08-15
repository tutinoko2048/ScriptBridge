# ScriptBridge

ScriptBridge is an HTTP-based library that enables **bidirectional communication** between Minecraft Bedrock Edition's Script API (addons) and external backend servers.

## Table of Contents

- [ScriptBridge](#scriptbridge)
  - [Table of Contents](#table-of-contents)
  - [🌟 Key Features](#-key-features)
  - [📦 Architecture](#-architecture)
  - [🚀 How It Works](#-how-it-works)
  - [🎯 Use Cases](#-use-cases)
  - [Server](#server)
    - [Installation](#installation)
    - [Example](#example)
      - [Basic Usage](#basic-usage)
      - [Advanced Usage with Event Handlers](#advanced-usage-with-event-handlers)
      - [Graceful Shutdown](#graceful-shutdown)
  - [Client](#client)
    - [Installation](#installation-1)
      - [As bundled script](#as-bundled-script)
      - [As npm package](#as-npm-package)
    - [Example](#example-1)
      - [Basic Usage](#basic-usage-1)
      - [Advanced Usage with Event Handlers](#advanced-usage-with-event-handlers-1)
      - [Error Handling and Reconnection](#error-handling-and-reconnection)
      - [Sending Data to Server](#sending-data-to-server)
    - [Configuration](#configuration)
      - [ServerOptions](#serveroptions)

## 🌟 Key Features

- **Bidirectional Communication**: Real-time message exchange between client (Minecraft) ↔ server
- **Session Management**: Automatic session creation, management, and timeout detection
- **Type Safety**: Full TypeScript support for enhanced development experience
- **Error Handling**: Robust connection management with automatic reconnection
- **Custom Actions**: Flexible message processing through namespaced channels
- **Protocol Version Management**: Compatibility checking between client and server

## 📦 Architecture

This library consists of three packages:

- **`@script-bridge/server`** - Node.js/Express-based HTTP server
- **`@script-bridge/client`** - Minecraft Script API client
- **`@script-bridge/protocol`** - Shared type definitions and protocol specifications

## 🚀 How It Works

1. **Client (Minecraft)** sends HTTP requests using `@minecraft/server-net`
2. **Server (Node.js)** provides HTTP endpoints via Express.js
3. **Polling mechanism** allows clients to periodically fetch messages from server
4. **Action-Response pattern** handles custom message processing
5. **Session management** supports multiple concurrent client connections

## 🎯 Use Cases

- **Chat Bridge**: Discord ↔ Minecraft chat integration
- **Player Management**: Synchronization with external databases
- **Event Notifications**: Sending in-game events to external systems
- **Remote Administration**: Server management through web dashboards
- **Data Analytics**: Collection and analysis of player behavior data

## Server
### Installation
- npm
```
npm install @script-bridge/server
```
- yarn
```
yarn add @script-bridge/server
```
- pnpm
```
pnpm add @script-bridge/server
```
- bun
```
bun install @script-bridge/server
```

### Example

#### Basic Usage
- JavaScript
```javascript
const { ScriptBridgeServer } = require('@script-bridge/server');

const server = new ScriptBridgeServer({ 
  port: 8000,
  requestIntervalTicks: 8, // Client query interval in ticks (default: 8)
  timeoutThresholdMultiplier: 20 // Timeout threshold multiplier (default: 20)
});

server.start().then(() => {
  console.log('ScriptBridge server started on port 8000');
});
```

- TypeScript
```typescript
import { ScriptBridgeServer } from '@script-bridge/server';

const server = new ScriptBridgeServer({ 
  port: 8000,
  requestIntervalTicks: 8,
  timeoutThresholdMultiplier: 20
});

await server.start();
console.log('ScriptBridge server started on port 8000');
```

#### Advanced Usage with Event Handlers
```typescript
import { ScriptBridgeServer } from '@script-bridge/server';

const server = new ScriptBridgeServer({ port: 8000 });

// Listen to server events
server.on('serverOpen', () => {
  console.log('Server is now listening');
});

server.on('clientConnect', (session) => {
  console.log(`Client connected: ${session.id}`);
});

server.on('clientDisconnect', (session, reason) => {
  console.log(`Client disconnected: ${session.id}, reason: ${reason}`);
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});

// Register custom action handlers
server.registerHandler('myapp:chat', (action) => {
  const { message, playerName } = action.data;
  console.log(`${playerName}: ${message}`);
  
  // Respond to the client
  action.respond({ success: true, timestamp: Date.now() });
});

// Broadcast messages to all connected clients
server.registerHandler('myapp:broadcast', async (action) => {
  const { message } = action.data;
  
  try {
    const responses = await server.broadcast('myapp:receive-message', {
      message,
      timestamp: Date.now()
    });
    
    action.respond({ 
      success: true, 
      clientCount: responses.length 
    });
  } catch (error) {
    action.respond({ 
      success: false, 
      error: error.message 
    });
  }
});

await server.start();
```

#### Graceful Shutdown
```typescript
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await server.stop();
  process.exit(0);
});
```

## Client
### Installation
#### As bundled script
- Download the client from the [releases](https://github.com/tutinoko2048/ScriptBridge/releases) page.
- Put the client in your project.
#### As npm package
- This library is also vailable on npm as `@script-bridge/client`.

> [!NOTE]
> You need to enable Beta API toggle and allow `@minecraft/server-net` module in `[BDS]/config/permissions.json`.

### Example

#### Basic Usage
```typescript
import { ScriptBridgeClient } from './path/to/script-bridge-client';

const client = new ScriptBridgeClient({ 
  url: 'http://localhost:8000',
  clientId: 'my-minecraft-addon', // Optional: Custom client identifier
});

// Connect to server
await client.connect();
console.log('Connected to ScriptBridge server!');
```

#### Advanced Usage with Event Handlers
```typescript
import { ScriptBridgeClient, DisconnectReason } from './path/to/script-bridge-client';
import { world, system } from '@minecraft/server';

const client = new ScriptBridgeClient({ 
  url: 'http://localhost:8000',
  clientId: 'chat-bridge-addon'
});

// Listen to connection events
client.on('connect', ({ sessionId }) => {
  console.log(`Connected with session: ${sessionId}`);
  world.sendMessage('§aConnected to server!');
});

client.on('disconnect', ({ reason }) => {
  console.log(`Disconnected: ${DisconnectReason[reason]}`);
  world.sendMessage('§cDisconnected from server');
});

// Register action handlers
client.registerHandler('myapp:receive-message', (action) => {
  const { message, timestamp } = action.data;
  world.sendMessage(`§7[Server] §f${message}`);
  
  // Respond to acknowledge receipt
  action.respond({ received: true });
});

client.registerHandler('myapp:player-request', (action) => {
  const players = world.getPlayers().map(player => ({
    name: player.name,
    id: player.id,
    location: player.location
  }));
  
  action.respond({ players });
});

// Send messages to server
world.afterEvents.chatSend.subscribe(async (event) => {
  try {
    const response = await client.send('myapp:chat', {
      message: event.message,
      playerName: event.sender.name,
      timestamp: Date.now()
    });
    
    if (response.error) {
      console.error('Failed to send chat message:', response.message);
    }
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
});

// Connect with retry logic
try {
  await client.connect();
} catch (error) {
  console.error('Failed to connect:', error.message);
}
```

#### Error Handling and Reconnection
```typescript
import { ScriptBridgeClient } from './path/to/script-bridge-client';
import { system } from '@minecraft/server';

const client = new ScriptBridgeClient({ url: 'http://localhost:8000' });


// Check connection status
console.log('Connected:', client.isConnected);
console.log('Average ping:', client.averagePing, 'ms');
```

#### Sending Data to Server
```typescript
// Simple request-response
const response = await client.send('myapp:get-config', {
  section: 'gameplay'
});

if (!response.error) {
  console.log('Config received:', response.data);
} else {
  console.error('Error:', response.message);
}

// Send player data periodically
system.runInterval(async () => {
  if (!client.isConnected) return;
  
  const playerCount = world.getPlayers().length;
  
  try {
    await client.send('myapp:heartbeat', {
      playerCount,
      timestamp: Date.now(),
      serverLoad: system.currentTick
    });
  } catch (error) {
    console.warn('Failed to send heartbeat:', error.message);
  }
}, 200); // Every 10 seconds (200 ticks)
```


### Configuration

#### ServerOptions
```typescript
interface ServerOptions {
  port: number;
  requestIntervalTicks?: number;
  timeoutThresholdMultiplier?: number;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | Required | The port number on which the server will listen for HTTP requests |
| `requestIntervalTicks` | `number` | `8` | The interval in Minecraft ticks (1 tick = 50ms) that clients should wait between query requests. Lower values increase responsiveness but may cause higher server load |
| `timeoutThresholdMultiplier` | `number` | `20` | A multiplier for determining client timeout. If a client exceeds `requestIntervalTicks × timeoutThresholdMultiplier` without sending a query, it will be considered disconnected. Set to `Infinity` to disable automatic disconnection |

**Example configurations:**
```typescript
// High performance setup (faster but more resource intensive)
const fastServer = new ScriptBridgeServer({
  port: 8000,
  requestIntervalTicks: 4,        // 200ms interval
  timeoutThresholdMultiplier: 10  // 2 second timeout
});

// Conservative setup (slower but more stable)
const stableServer = new ScriptBridgeServer({
  port: 8000,
  requestIntervalTicks: 20,       // 1 second interval
  timeoutThresholdMultiplier: 30  // 30 second timeout
});

// No auto-disconnect (manual session management)
const persistentServer = new ScriptBridgeServer({
  port: 8000,
  requestIntervalTicks: 8,
  timeoutThresholdMultiplier: Infinity
});
```