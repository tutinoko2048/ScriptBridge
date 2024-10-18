import { system } from '@minecraft/server';
import {
  type ClientRequest,
  type ClientResponse,
  type ServerRequest,
  type ServerResponse,
  ConnectionMode,
  PayloadType,
  ResponseErrorReason
} from './types';
import { BaseAction, InternalActions } from './actions';
import { NamespaceRequiredError, NoActiveSessionError } from './errors/index';
import { HttpClient } from './http-client';
import { ServerAction } from './server-action';
import { DisconnectReason, InternalAction } from './enums';
import { registerHandlers } from './handlers';

type Awaitable<Value> = PromiseLike<Value> | Value;

interface ClientOptions {
  /** Server URL (including port) */
  url: string;
  /** Custom identifier for client, this will be sent to the server */
  clientId?: string;
  connectionMode?: ConnectionMode;
}

type ActionHandler<T extends BaseAction> = (action: ServerAction<T>) => Awaitable<void>;

export class ScriptBridgeClient {
  public static readonly PROTOCOL_VERSION = 1;

  /** Custom identifier for client, this will be sent to the server */
  public readonly clientId: string = '';

  public readonly connectionMode: ConnectionMode = ConnectionMode.Polling;

  private readonly http = new HttpClient();
  private readonly actionHandlers = new Map<string, ActionHandler<BaseAction>>();
  private readonly deltaTimes: number[] = [];
  private currentSessonId: string | null = null;
  private failCount = 0;
  private queryInterval: number | null = null;
  
  constructor(options: ClientOptions) {
    this.http.baseUrl = options.url;
    if (options.clientId !== undefined) this.clientId = options.clientId;
    if (options.connectionMode !== undefined) this.connectionMode = options.connectionMode;
    
    registerHandlers(this);
  }

  get isConnected() {
    return !!this.currentSessonId;
  }

  get ping() {
    if (this.deltaTimes.length === 0) return 0;
    return this.deltaTimes.reduce((a, b) => a + b, 0) / this.deltaTimes.length;
  }

  public connect() {
    return new Promise<void>(async (resolve) => {
      try {
        await this.createSession();
        await this.send<InternalActions.Connect>(InternalAction.Connect, {
          clientId: this.clientId,
          protocolVersion: ScriptBridgeClient.PROTOCOL_VERSION
        });
        resolve();
      } catch (e) {
        console.error('[ScriptBridgeClient] Failed to create session:', e.message);
        console.error('[ScriptBridgeClient] reconnect after 5 seconds...');
        system.runTimeout(() => {
          this.connect().then(resolve);
        }, 5*20);
      }
    });
  }

  public async disconnect(reason: DisconnectReason = DisconnectReason.Disconnect) {
    if (!this.currentSessonId) throw new NoActiveSessionError();
    await this.send<InternalActions.Disconnect>(InternalAction.Disconnect, { reason });
    this.http.cancelAll(DisconnectReason[reason]);
    this.destroy();
  }

  public destroy() {
    this.stopInterval();
    this.currentSessonId = null;
    this.deltaTimes.length = 0;
    this.failCount = 0;
  }

  public async send<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    data?: A['request']
  ): Promise<ServerResponse<A['response']>> {
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);

    if (!this.isConnected) throw new NoActiveSessionError();
    
    const payload: ClientRequest = {
      data,
      sessionId: this.currentSessonId!,
      channelId,
      type: PayloadType.Request
    };

    const rawBody = await this.http.POST('/query', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    try {
      return JSON.parse(rawBody);
    } catch (e) {
      throw new Error('[ScriptBridgeClient] Failed to parse response body');
    }
  }

  public registerHandler<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    handler: ActionHandler<A>
  ): void {
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);
    if (this.actionHandlers.has(channelId)) {
      console.warn('[ScriptBridge::registerHandler] Overwriting existing handler for channel:', channelId);
    }
    this.actionHandlers.set(channelId, handler);
  }

  private async handleRequest(
    request: ServerRequest,
    respond: (data: ClientResponse) => void
  ): Promise<void> {
    const { requestId, channelId, data } = request;
    const handler = this.actionHandlers.get(channelId);
    if (!handler) {
      console.error(new Date(), 'No handler found for channel:', channelId);
      respond({
        type: PayloadType.Response,
        error: true,
        message: `No handler found for channel: ${channelId}`,
        errorReason: ResponseErrorReason.UnhandledRequest,
        sessionId: this.currentSessonId!,
        requestId,
      });
      return;
    }

    let isResponded = false;
    try {
      const action = new ServerAction(
        data,
        (data: unknown) => {
          if (isResponded) return;
          respond({
            type: PayloadType.Response,
            error: false,
            sessionId: this.currentSessonId!,
            requestId,
            data,
          });
          isResponded = true;
        }
      );
      await handler(action);

    } catch (error) {
      console.error(new Date(), 'Error while handling request:', channelId, error);
      if (!isResponded) respond({
        type: PayloadType.Response,
        error: true,
        message: 'An error occurred while handling the request\n' + error.message,
        errorReason: ResponseErrorReason.InternalError,
        sessionId: this.currentSessonId!,
        requestId,
      });
    }
  }

  private async queryData(): Promise<ServerRequest[]> {
    if (!this.currentSessonId) throw new NoActiveSessionError();

    const rawBody = await this.http.GET('/query', {
      headers: { 'session-id': this.currentSessonId },
      timeout: 5*20,
    });
    let body: ServerResponse | ServerRequest[] | undefined;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error('[ScriptBridgeClient] Failed to parse query response');
    }

    if (Array.isArray(body)) return body;
      
    if (body?.error && body.errorReason === ResponseErrorReason.InvalidSession) {
      console.error('[ScriptBridgeClient] Invalid session, creating new session...');        
      this.destroy();
      await this.connect();
      return [];
    }

    console.error(`[ScriptBridgeClient] Unexpected response: ${JSON.stringify(body)}`);
    return [];
  }

  private async createSession() {    
    this.currentSessonId = null;

    const rawBody = await this.http.GET('/new', { timeout: 5*20 });
    let body: ServerResponse<InternalActions.SessionCreate['response']>;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      throw new Error('[ScriptBridgeClient] Failed to parse response body');
    }
    if (body.error) throw new Error(`[ScriptBridgeClient] Failed to create session: ${body.message}, reason: ${ResponseErrorReason[body.errorReason]}`);
    
    this.currentSessonId = body.data.sessionId;
    this.startInterval(body.data.requestIntervalTicks);
  }

  private startInterval(intervalTicks: number): void {
    if (this.queryInterval !== null) return;

    this.queryInterval = system.runInterval(async () => {
      if (!this.isConnected) return;

      const sentAt = Date.now();
      let requests: ServerRequest[];
      try {
        requests = await this.queryData()
      } catch (e) {
        console.error(`[ScriptBridgeClient] fetch failed`);
        this.http.cancelAll('Request timeout');
        if (this.failCount++ >= 3) {
          this.destroy();
          console.error('[ScriptBridgeClient] Destroyed session due to multiple timeouts');
          console.error('[ScriptBridgeClient] Reconnect after 5 seconds...');          
          this.failCount = 0;
          
          system.runTimeout(() => {
            this.connect().then(() => console.log('[ScriptBridgeClient] Reconnected to server!'));
          }, 5*20);
        }
        return;
      }

      for (const request of requests) {
        this.handleRequest(request, response => {
          this.http.POST('/query', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          }).catch(e => console.error('[ScriptBridgeClient] Failed to send response:', e));
        });
      }

      this.deltaTimes.push(Date.now() - sentAt);
      if (this.deltaTimes.length > 10) this.deltaTimes.shift();
    }, intervalTicks);
  }

  private stopInterval(): void {    
    if (this.queryInterval !== null) {
      system.clearRun(this.queryInterval);
      this.queryInterval = null;
    }
  }
}