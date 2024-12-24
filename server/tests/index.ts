import { BaseAction, DisconnectReason } from '@script-bridge/protocol';
import { ScriptBridgeServer } from '../src';
import { createInterface } from 'node:readline/promises';

const server = new ScriptBridgeServer({ port: 8000 });
server.start();
server.on('serverOpen', () => console.log('[Event] serverOpen'));
server.on('serverClose', () => console.log('[Event] serverClose'));
server.on('error', e => console.error(new Date(), '[Event] error', e.message));
server.on('clientConnect', session => console.log(new Date(), '[Event] clientConnect', session.id));
server.on('clientDisconnect', (session, reason) => console.log(new Date(), '[Event] clientDisconnect', session.id, DisconnectReason[reason]));

type TestAction = BaseAction<
  'custom:test',
  { message: string },
  void
>

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', async message => {
  const res = await server.broadcast<TestAction>('custom:test', { message });
  console.log(res);
})

server.registerHandler<TestAction>('custom:test', action => {
  console.log('[test]', action.data);
  action.respond();
});
