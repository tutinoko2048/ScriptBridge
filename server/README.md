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