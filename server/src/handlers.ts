import { InternalActions } from './actions';
import { DisconnectReason, InternalAction } from './enums';
import { ScriptBridgeServer } from './server';

export const registerHandlers = (server: ScriptBridgeServer) => {
  server.registerHandler<InternalActions.Connect>(InternalAction.Connect, (action) => {
    const { session, data: { clientId, protocolVersion } } = action;

    action.respond();

    if (ScriptBridgeServer.PROTOCOL_VERSION > protocolVersion) {
      return session.disconnect(DisconnectReason.OutdatedClient);

    } else if (ScriptBridgeServer.PROTOCOL_VERSION < protocolVersion) {
      return session.disconnect(DisconnectReason.OutdatedServer);
    }

    session.clientId = clientId;

    session.onConnect();
    server.emit('clientConnect', session);
  });


  server.registerHandler<InternalActions.Disconnect>(InternalAction.Disconnect, (action) => {
    const { session } = action;
    server.emit('clientDisconnect', session, action.data.reason);
    session.destroy();
    action.respond();
  });
}