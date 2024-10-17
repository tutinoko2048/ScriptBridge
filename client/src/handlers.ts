import { InternalActions } from './actions';
import type { ScriptBridgeClient } from './client';
import { DisconnectReason, InternalAction } from './enums';

export const registerHandlers = (client: ScriptBridgeClient) => {
  client.registerHandler<InternalActions.Disconnect>(InternalAction.Disconnect, (action) => {
    console.warn(`[ScriptBridgeClient] disconnected from server: ${DisconnectReason[action.data.reason]}`);
    client.destroy();
    action.respond();
  });
}