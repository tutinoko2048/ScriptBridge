import { BaseAction, ScriptBridgeClient } from '../src';
import { createInterface } from 'node:readline/promises';

const client = new ScriptBridgeClient({
  url: 'http://localhost:8000'
});

client.connect()
  .then(() => {
    console.log('[ScriptBridgeClient] connected!');
  })
  .catch(e => {
    console.error('[ScriptBridgeClient] failed to connect', e.message);
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
    client.connect();
    return;
  }
  if (message === '.disconnect') {
    client.disconnect();
    return;
  }

  const res = await client.send<TestAction>('custom:test', { message }).catch(e => console.error(e.message));
  console.log(res);
});

client.registerHandler<TestAction>('custom:test', action => {
  console.log('[test]', action.data);
  action.respond();
});