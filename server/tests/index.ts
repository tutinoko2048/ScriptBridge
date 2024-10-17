import { BaseAction, ScriptBridgeServer } from '../src';
import { createInterface } from 'node:readline/promises';

const server = new ScriptBridgeServer({ port: 8000 });
server.start();
server.on('serverOpen', () => console.log('[Event] open'));
server.on('serverClose', () => console.log('[Event] close'));

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
