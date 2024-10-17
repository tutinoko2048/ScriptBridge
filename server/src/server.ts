import * as http from 'node:http';
import express from 'express';
import { EventEmitter } from 'node:events';
import { ServerResponse, ClientRequest, ClientResponse, PayloadType, ResponseErrorReason, ServerRequest } from './types';
import { BaseAction } from './actions';
import { Session } from './session';
import { ClientAction } from './client-action';
import { NamespaceRequiredError, UnhandledRequestError } from './errors';
import { InternalActions } from './actions';
import { registerHandlers } from './handlers';

type Awaitable<Value> = PromiseLike<Value> | Value;

interface ServerEvents {
  serverOpen: [];
  serverClose: [];
  clientConnect: [session: Session];
  clientDisconnect: [session: Session];
  sessionCreate: [session: Session];
  sessionDestroy: [session: Session];
  queryReceive: [session: Session];
  requestSend: [request: ServerRequest, session: Session];
  responseSend: [response: ServerResponse, session: Session];
  requestReceive: [request: ClientRequest, session: Session];
  responseReceive: [response: ClientResponse, session: Session];
  error: [error: Error];
}

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
  public static readonly PROTOCOL_VERSION = 1;

  public readonly options: ServerOptions;
  public readonly sessions = new Map<string, Session>();

  private readonly server: http.Server;
  private readonly app: express.Application;
  private readonly actionHandlers = new Map<string, ActionHandler<BaseAction>>();

  constructor(options: ServerOptions) {
    super();
    this.app = express();
    this.server = http.createServer(this.app);
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.options = options;
    this.options.requestIntervalTicks = options.requestIntervalTicks ?? 8;
    this.options.timeoutThresholdMultiplier = options.timeoutThresholdMultiplier ?? 20;

    this.app.get<
      void,
      ServerResponse<InternalActions.SessionCreate['response']>,
      void,
      InternalActions.SessionCreate['request']
    >('/new', (_, res) => {
      const session = new Session(this);
      res.json({
        type: PayloadType.Response,
        data: {
          sessionId: session.id,
          requestIntervalTicks: this.options.requestIntervalTicks!,
        },
      });
    });

    this.app.get<
      void,
      ServerResponse | ServerRequest[],
      void,
      { sessionId: string }
    >('/query', (req, res) => {
      const session = this.sessions.get(req.query.sessionId);
      if (!session) {
        res.json({
          type: PayloadType.Response,
          error: true,
          message: 'Session is invalid',
          errorReason: ResponseErrorReason.InvalidSession,
        });
        return;
      }

      const requests = session.getQueue();
      res.json(requests);

      for (const request of requests) this.emit('requestSend', request, session);
      this.emit('queryReceive', session);
    });

    this.app.post<
      void,
      ServerResponse,
      ClientRequest | ClientResponse
    >('/query', (req, res) => {
      const body = req.body;      
      const session = this.sessions.get(body.sessionId);

      if (!session) return void res.sendStatus(400);

      if (body.type === PayloadType.Request) {
        this.emit('requestReceive', body, session);
        this.handleRequest(session, body, (data: ServerResponse) => {
          res.json(data);
          this.emit('responseSend', data, session);
        });

      } else if (body.type === PayloadType.Response) {
        this.handleResponse(session, body);
        this.emit('responseReceive', body, session);
        
        res.sendStatus(200);
      } else {
        res.sendStatus(400);
      }
    });

    registerHandlers(this);
  }

  public async start(): Promise<void> {
    return new Promise<void>(resolve => {
      this.server.listen(this.options.port, () => {
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

  private async handleRequest(session: Session, request: ClientRequest, respond: (data: ServerResponse) => void): Promise<void> {
    const handler = this.actionHandlers.get(request.channelId);
    if (!handler) {
      this.emit('error', new UnhandledRequestError(request.channelId));
      respond({
        type: PayloadType.Response,
        error: true,
        errorReason: ResponseErrorReason.UnhandledRequest,
        message: `No handler found for channel: ${request.channelId}`,
      });
      return;
    }
    let isResponded = false;
    try {
      const action = new ClientAction(
        request.data,
        (data) => {
          if (isResponded) return;
          respond({ error: false, data, type: PayloadType.Response });
          isResponded = true;
        },
        session,
      );
      await handler(action);
    } catch (error) {
      this.emit('error', error);
      if (!isResponded) respond({
        type: PayloadType.Response,
        error: true,
        errorReason: ResponseErrorReason.InternalError,
        message: 'An error occurred while handling the request\n' + error.message,
      });
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
