import { InternalAction } from '../enums/index';
import { BaseAction } from './base';

export type PingAction = BaseAction<
  InternalAction.Ping,
  { sentAt: number },
  { receivedAt: number }
>;