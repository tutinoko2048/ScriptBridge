import { BaseAction, DisconnectReason } from '@script-bridge/protocol';
import { ScriptBridgeClient } from '../src';
import { createInterface } from 'node:readline/promises';

const client = new ScriptBridgeClient({
  url: 'http://localhost:8000'
});

client.connect();

client.on('connect', ({ sessionId }) => {
  console.log(new Date(), '[ScriptBridgeClient] connected:', sessionId);
});

client.on('disconnect', ({ reason }) => {
  console.log(new Date(), '[ScriptBridgeClient] disconnected:', DisconnectReason[reason]);
});

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
  if (message === '.connect') {
    await client.connect();
    return;
  }
  if (message === '.disconnect') {
    await client.disconnect();
    return;
  }

  if (message === '.test') {
    (client as any).currentSessonId += 'a';
    return;
  }

  const res = await client.send<TestAction>('custom:test', { message }).catch(e => console.error(e.message));
  console.log(res);
});

// setInterval(() => {
//  client.isConnected &&
//   client.send<TestAction>('custom:test', { message:'A' }).catch(e => console.error(new Date(), e.message));
// }, 100)

client.registerHandler<TestAction>('custom:test', action => {
  console.log('[test]', action.data);
  action.respond();
});