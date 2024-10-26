# ScriptBridge
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
- JavaScript
```javascript
const { ScriptBridgeServer } = require('@script-bridge/server');
const server = new ScriptBridgeServer({ port: 8000 });
server.start();
```

- TypeScript
```typescript
import { ScriptBridgeServer } from '@script-bridge/server';
const server = new ScriptBridgeServer({ port: 8000 });
server.start();
```

## Client
### Usage
- Download the client from the [releases](https://github.com/tutinoko2048/ScriptBridge/releases) page.
- Put the client in your project.

> [!NOTE]
> You need to enable Beta API toggle and allow `@minecraft/server-net` module in `[BDS]/config/permissions.json`.

### Example
```typescript
import { ScriptBridgeClient } from './path/to/script-bridge-client';
const client = new ScriptBridgeClient({ url: 'http://localhost:8000' });
client.connect();
```
