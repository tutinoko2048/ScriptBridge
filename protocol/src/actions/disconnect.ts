import { BaseAction } from './base';
import { DisconnectReason, InternalAction } from '../enums/index';

export type DisconnectAction = BaseAction<
  InternalAction.Disconnect,
  {
    reason: DisconnectReason;
    message?: string;
  },
  void
>;