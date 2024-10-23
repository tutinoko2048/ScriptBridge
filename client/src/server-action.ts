import { BaseAction } from '@script-bridge/protocol';

/** Represents action from server */
export class ServerAction<A extends BaseAction> {
  constructor(
    public readonly data: A['request'],
    public readonly respond: (data: A['response']) => void
  ) {}
}