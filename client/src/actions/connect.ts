import { InternalAction } from '../enums';
import { BaseAction } from './base'

/** server-bound */
export type ConnectAction = BaseAction<
  InternalAction.Connect,
  {
    clientId: string;
    protocolVersion: number;
  },
  void
>;