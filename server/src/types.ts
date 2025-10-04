import { BaseAction } from '@script-bridge/protocol';
import { Session } from './session';

type Awaitable<Value> = Promise<Value> | Value;

export type ActionHandler<T extends BaseAction> = (action: ClientAction<T>) => Awaitable<void>;

/** Represents action from client */
export type ClientAction<A extends BaseAction> = {
  readonly data: A['request'];
  readonly respond: (data: A['response']) => void;
  readonly session: Session;
}
