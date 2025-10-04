import { BaseAction } from '@script-bridge/protocol';

type Awaitable<Value> = PromiseLike<Value> | Value;

export type ActionHandler<T extends BaseAction> = (action: ServerAction<T>) => Awaitable<void>;

/** Represents action from server */
export type ServerAction<A extends BaseAction> = {
  readonly data: A['request'];
  readonly respond: (data: A['response']) => void;
}
