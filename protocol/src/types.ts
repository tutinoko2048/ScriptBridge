import { PayloadType, ResponseErrorReason } from './enums/index';

/** script->server */
export interface ClientRequest<T = unknown> {
  type: PayloadType.Request;
  channelId: string;
  sessionId: string;
  data: T;
}
/** server->script */
export type ServerResponse<T = unknown> = {
  type: PayloadType.Response;
  error?: false;
  data: T;
} | {
  type: PayloadType.Response;
  error: true;
  message: string;
  errorReason: ResponseErrorReason;
};

/** server->script */
export interface ServerRequest<T = unknown> {
  type: PayloadType.Request;
  channelId: string;
  requestId: string;
  data: T;
}
/** script->server */
export type ClientResponse<T = unknown> = {
  type: PayloadType.Response;
  error?: false;
  sessionId: string;
  requestId: string;
  data: T;
} | {
  type: PayloadType.Response;
  error: true;
  message: string;
  errorReason: ResponseErrorReason;
  sessionId: string;
  requestId: string;
};