import {
  DisconnectReason,
  InternalAction,
  InternalActions,
} from '@script-bridge/protocol';
import type { ScriptBridgeClient } from './client';

export const registerHandlers = (client: ScriptBridgeClient) => {
  client.registerHandler<InternalActions.Disconnect>(InternalAction.Disconnect, (action) => {
    action.respond();
    console.warn(`[ScriptBridge] disconnected from server: ${DisconnectReason[action.data.reason]}`);
    client.destroy();
  });

  client.registerHandler<InternalActions.Ping>(InternalAction.Ping, (action) => {
    action.respond({
      receivedAt: Date.now()
    });
  });
}