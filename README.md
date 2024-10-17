# ScriptBridge
## Server
### Installation
```bash
npm install @script-bridge/server
yarn add @script-bridge/server
pnpm add @script-bridge/server
bun install @script-bridge/server
```

### Example
- JavaScript
```javascript
const { ScriptBridgeServer } = require('@script-bridge/server');
const server = new Server({ port: 8000 });
server.start();
```

- TypeScript
```typescript
import { ScriptBridgeServer } from '@script-bridge/server';
const server = new Server({ port: 8000 });
server.start();
```

## Client
### Usage
- Download the client from the [releases](https://github.com/tutinoko2048/ScriptBridge/releases) page.
- Put the client in your project.

### Example
```typescript
import { ScriptBridgeClient } from './path/to/ScriptBridgeClient/index';
const client = new ScriptBridgeClient({ url: 'http://localhost:8000' });
client.connect();
```