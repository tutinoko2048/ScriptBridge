import { InternalAction } from '../enums';
import { BaseAction } from './base';

/** server-bound */
export type SessionCreateAction = BaseAction<
  InternalAction.SessionCreate,
  void,
  {
    sessionId: string;
    requestIntervalTicks: number;
  }
>