import { Session } from './session';
import { BaseAction } from './actions';

/** Represents action from client */
export class ClientAction<T extends BaseAction> {
  constructor(
    public readonly data: T['request'],
    public readonly respond: (data: T['response']) => void,
    public readonly session: Session,
  ) {}
}