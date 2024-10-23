import { SessionCreateAction } from './session-create';
import { DisconnectAction } from './disconnect';
import { PingAction } from './ping';
import { ConnectAction } from './connect';

export namespace InternalActions {
  export type SessionCreate = SessionCreateAction;
  export type Connect = ConnectAction;
  export type Disconnect = DisconnectAction;
  export type Ping = PingAction;
}

