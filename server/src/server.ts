import { EventEmitter } from 'node:events';
import { Hono } from 'hono';
import { serve, ServerType } from '@hono/node-server';
import {
  BaseAction,
  InternalActions,
  DisconnectReason,
  ServerRequest,
  ServerResponse,
  ClientRequest,
  ClientResponse,
  PayloadType,
  ResponseErrorReason,
  PROTOCOL_VERSION,
} from '@script-bridge/protocol';
import { Session } from './session';
import { ClientAction } from './client-action';
import { NamespaceRequiredError, UnhandledRequestError } from './errors';
import { registerHandlers } from './handlers';

type Awaitable<Value> = PromiseLike<Value> | Value;

interface ServerOptions {
  port: number;

  /** The interval ticks clients should wait before sending a query. Defaults to `8` */
  requestIntervalTicks?: number;
  
  /** 
   * A multiplier indicating how many times the `requestIntervalTicks` 
   * can be exceeded before considering the request as failed. 
   * Defaults to `20`.
   * Set `Infinity` to disable auto disconnection.
   */
  timeoutThresholdMultiplier?: number;
}

type ActionHandler<T extends BaseAction> = (action: ClientAction<T>) => Awaitable<void>;

export class ScriptBridgeServer extends EventEmitter<ServerEvents> {
  public static readonly PROTOCOL_VERSION = PROTOCOL_VERSION;

  public readonly sessions = new Map<string, Session>();
  public readonly port: number;
  public readonly requestIntervalTicks: number = 8;
  public readonly timeoutThresholdMultiplier: number = 20;

  private readonly actionHandlers = new Map<string, ActionHandler<BaseAction>>();
  private readonly app: Hono;
  private server: ServerType;

  constructor(options: ServerOptions) {
    super();
    this.app = new Hono();

    this.port = options.port;
    if (options.requestIntervalTicks !== undefined) this.requestIntervalTicks = options.requestIntervalTicks;
    if (options.timeoutThresholdMultiplier !== undefined) this.timeoutThresholdMultiplier = options.timeoutThresholdMultiplier;

    this.app.get('/new', (c) => {
      const session = new Session(this);
      return c.json<ServerResponse<InternalActions.SessionCreate['response']>>({
        type: PayloadType.Response,
        data: {
          sessionId: session.id,
          requestIntervalTicks: this.requestIntervalTicks,
        },
      });
    });

    this.app.get('/query', (c) => {
      const sessionId = c.req.header('session-id');
      const session = sessionId ? this.sessions.get(sessionId) : undefined;
      if (!session) {
        return c.json<ServerResponse>({
          type: PayloadType.Response,
          error: true,
          message: 'Session is invalid',
          errorReason: ResponseErrorReason.InvalidSession,
        });
      }

      const requests = session.getQueue();
      
      for (const request of requests) this.emit('requestSend', request, session);
      this.emit('queryReceive', session);
      
      return c.json<ServerRequest[]>(requests);
    });

    this.app.post('/query', async (c) => {
      const body = await c.req.json<ClientRequest | ClientResponse>();
      const session = this.sessions.get(body.sessionId);

      if (!session) {
        return c.json<ServerResponse>({
          type: PayloadType.Response,
          error: true,
          errorReason: ResponseErrorReason.InvalidSession,
          message: 'Invalid session',
        });
      }

      if (body.type === PayloadType.Request) {
        this.emit('requestReceive', body, session);
        
        const response = await this.handleRequest(session, body);
        this.emit('responseSend', response, session);
        return c.json<ServerResponse>(response);

      } else if (body.type === PayloadType.Response) {
        this.handleResponse(session, body);
        this.emit('responseReceive', body, session);
        return c.body(null, 200);

      } else {
        return c.json<ServerResponse>({
          type: PayloadType.Response,
          error: true,
          errorReason: ResponseErrorReason.InvalidPayload,
          message: 'Invalid payload type',
        });
      }
    });

    registerHandlers(this);
  }

  public async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server = serve({
        fetch: this.app.fetch,
        port: this.port,
      }, () => {
        this.emit('serverOpen');
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.disconnect()));
    this.server.close();
    this.emit('serverClose');
  }

  public broadcast<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    data?: A['request'],
    timeout: number = 10_000
  ): Promise<ClientResponse<A['response']>[]> {
    if (typeof channelId !== 'string') throw new TypeError('channelId must be a string');
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);

    return Promise.all(
      [...this.sessions.values()].map((session) => session.send(channelId, data, timeout))
    );
  }
  
  public registerHandler<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    handler: ActionHandler<A>
  ): void {
    if (typeof channelId !== 'string') throw new TypeError('channelId must be a string');
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);

    if (this.actionHandlers.has(channelId)) {
      process.emitWarning(`[ScriptBridge::registerHandler] Overwriting existing handler for channel: ${channelId}`);
    } 
    this.actionHandlers.set(channelId, handler);
  }

  private async handleRequest(session: Session, request: ClientRequest): Promise<ServerResponse> {
    const handler = this.actionHandlers.get(request.channelId);
    if (!handler) {
      this.emit('error', new UnhandledRequestError(request.channelId));
      return {
        type: PayloadType.Response,
        error: true,
        errorReason: ResponseErrorReason.UnhandledRequest,
        message: `No handler found for channel: ${request.channelId}`,
      };
    }

    try {
      const response: ServerResponse = {
        type: PayloadType.Response,
        error: false,
        data: undefined,
      };

      const action = new ClientAction(
        request.data,
        (data) => {
          response.data = data;
        },
        session,
      );
      
      await handler(action);
      
      return response;
      
    } catch (error) {
      this.emit('error', error);
      return {
        type: PayloadType.Response,
        error: true,
        errorReason: ResponseErrorReason.InternalError,
        message: 'An error occurred while handling the request\n' + error.message,
      };
    }
  }

  private handleResponse(session: Session, response: ClientResponse): void {
    const awaitingResponse = session._awaitingResponses.get(response.requestId);
    if (!awaitingResponse) {
      this.emit('error', new Error(`Received response for unknown request: ${response.requestId}`));
      return;
    }
    awaitingResponse(response);
  }
}

interface ServerEvents {
  serverOpen: [];
  serverClose: [];
  clientConnect: [session: Session];
  clientDisconnect: [session: Session, reason: DisconnectReason];
  sessionCreate: [session: Session];
  sessionDestroy: [session: Session];
  queryReceive: [session: Session];
  requestSend: [request: ServerRequest, session: Session];
  responseSend: [response: ServerResponse, session: Session];
  requestReceive: [request: ClientRequest, session: Session];
  responseReceive: [response: ClientResponse, session: Session];
  error: [error: Error];
}
