import { system } from '@minecraft/server';
import {
  type ClientRequest,
  type ClientResponse,
  type ServerRequest,
  type ServerResponse,
  ConnectionMode,
  PayloadType,
  ResponseErrorReason,
  DisconnectReason,
  BaseAction,
  InternalAction,
  InternalActions,
  PROTOCOL_VERSION,
} from '@script-bridge/protocol';
import { NamespaceRequiredError, NoActiveSessionError } from './errors';
import { HttpClient } from './http-client';
import { ServerAction } from './server-action';
import { registerHandlers } from './handlers';
import { Emitter } from './utils/emitter';

type Awaitable<Value> = PromiseLike<Value> | Value;

export interface ClientOptions {
  /** Server URL (including port) */
  url: string;
  /** Custom identifier for client, this will be sent to the server */
  clientId?: string;
  connectionMode?: ConnectionMode;
}

type ActionHandler<T extends BaseAction> = (action: ServerAction<T>) => Awaitable<void>;

export interface ClientEvents {
  'connect': { sessionId: string };
  'disconnect': { reason: DisconnectReason };
}

export class ScriptBridgeClient extends Emitter<ClientEvents> {
  public static readonly PROTOCOL_VERSION = PROTOCOL_VERSION;

  /** Custom identifier for client, this will be sent to the server */
  public readonly clientId: string = '';

  public readonly connectionMode: ConnectionMode = ConnectionMode.Polling;

  private readonly http = new HttpClient();
  private readonly actionHandlers = new Map<string, ActionHandler<BaseAction>>();
  private readonly deltaTimes: number[] = [];
  private readonly maxReconnectAttempts = 10;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private failCount = 0;
  private currentSessonId: string | null = null;
  private queryInterval: number | null = null;
  
  constructor(options: ClientOptions) {
    super();
    this.http.baseUrl = options.url;
    if (options.clientId !== undefined) this.clientId = options.clientId;
    if (options.connectionMode !== undefined) this.connectionMode = options.connectionMode;
    
    registerHandlers(this);
  }

  get isConnected() {
    return !!this.currentSessonId && !this.isReconnecting;
  }

  get averagePing() {
    if (this.deltaTimes.length === 0) return -1;
    return this.deltaTimes.reduce((a, b) => a + b, 0) / this.deltaTimes.length;
  }

  public connect() {
    return new Promise<void>(async (resolve, reject) => {
      if (this.isReconnecting) {
        console.warn('[ScriptBridge] Already reconnecting, skipping...');
        return;
      }

      this.isReconnecting = true;
      
      try {
        await this.createSession();
        await this.send<InternalActions.Connect>(InternalAction.Connect, {
          clientId: this.clientId,
          protocolVersion: ScriptBridgeClient.PROTOCOL_VERSION
        });
        
        this.reconnectAttempts = 0;
        this.failCount = 0;
        this.isReconnecting = false;
        this.emit('connect', { sessionId: this.currentSessonId! });
        resolve();
      } catch (e) {
        this.isReconnecting = false;
        console.error('[ScriptBridge] Failed to create session:', e.message);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[ScriptBridge] Max reconnect attempts reached, giving up');
          reject(new Error('Max reconnect attempts reached'));
          return;
        }
        
        const backoffSeconds = Math.min(Math.pow(2, this.reconnectAttempts), 60);
        const backoffTicks = backoffSeconds * 20;
        
        this.reconnectAttempts++;
        console.error(`[ScriptBridge] Reconnect after ${backoffSeconds} seconds... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        system.runTimeout(() => {
          this.connect().then(resolve).catch(reject);
        }, backoffTicks);
      }
    });
  }

  public async disconnect(reason: DisconnectReason = DisconnectReason.Disconnect) {
    if (!this.currentSessonId) throw new NoActiveSessionError();
    
    try {
      await this.send<InternalActions.Disconnect>(InternalAction.Disconnect, { reason });
    } catch (e) {
      console.warn('[ScriptBridge] Failed to send disconnect message:', e.message);
    }
    
    this.http.cancelAll(DisconnectReason[reason]);
    this.destroy();
    
    this.emit('disconnect', { reason });
  }

  public destroy() {
    this.stopInterval();
    this.http.cancelAll('Client destroyed');
    this.currentSessonId = null;
    this.deltaTimes.length = 0;
    this.failCount = 0;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }

  public async send<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    data?: A['request']
  ): Promise<ServerResponse<A['response']>> {
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);

    // セッションIDがあり、再接続中でない場合、または内部アクションの場合は送信を許可
    if (!this.currentSessonId) throw new NoActiveSessionError();
    if (this.isReconnecting && !channelId.startsWith('__internal__:')) {
      throw new NoActiveSessionError();
    }
    
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
      throw new Error('Failed to parse response body');
    }
  }

  public registerHandler<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    handler: ActionHandler<A>
  ): void {
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);
    if (this.actionHandlers.has(channelId)) {
      console.warn('[ScriptBridge] Overwriting existing handler for channel:', channelId);
    }
    this.actionHandlers.set(channelId, handler);
  }

  private async handleRequest(
    request: ServerRequest,
    respond: (data: ClientResponse) => void
  ): Promise<void> {
    const { requestId, channelId, data } = request;
    const sessionId = this.currentSessonId!;

    const handler = this.actionHandlers.get(channelId);
    if (!handler) {
      console.error('[ScriptBridge] No handler found for channel:', channelId);
      respond({
        type: PayloadType.Response,
        error: true,
        message: `No handler found for channel: ${channelId}`,
        errorReason: ResponseErrorReason.UnhandledRequest,
        sessionId,
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
            sessionId,
            requestId,
            data,
          });
          isResponded = true;
        }
      );
      await handler(action);

    } catch (error) {
      console.error('[ScriptBridge] Error while handling request:', channelId, error);
      if (!isResponded) respond({
        type: PayloadType.Response,
        error: true,
        message: 'An error occurred while handling the request\n' + error.message,
        errorReason: ResponseErrorReason.InternalError,
        sessionId,
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
      console.error('[ScriptBridge] Failed to parse query response');
      return [];
    }

    if (Array.isArray(body)) return body;
      
    if (body?.error && body.errorReason === ResponseErrorReason.InvalidSession) {
      if (!this.isConnected || this.isReconnecting) return [];

      console.error('[ScriptBridge] Invalid session, creating new session...');
      this.scheduleReconnect();
      return [];
    }

    console.error(`[ScriptBridge] Unexpected response: ${JSON.stringify(body)}`);
    return [];
  }

  private async createSession() {
    this.currentSessonId = null;

    const rawBody = await this.http.GET('/new', { timeout: 5*20 });
    let body: ServerResponse<InternalActions.SessionCreate['response']>;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      throw new Error('Failed to parse response body');
    }
    
    // errorプロパティが存在し、かつtrueの場合のみエラーとして扱う
    if ('error' in body && body.error) {
      throw new Error(`Failed to create session: ${body.message}, reason: ${ResponseErrorReason[body.errorReason]}`);
    }
    
    // 成功レスポンスの場合
    if ('data' in body) {
      this.currentSessonId = body.data.sessionId;
      this.startInterval(body.data.requestIntervalTicks);
    } else {
      throw new Error('Invalid response format: missing data property');
    }
  }

  private startInterval(intervalTicks: number): void {
    if (this.queryInterval !== null) return;

    this.queryInterval = system.runInterval(async () => {
      if (!this.isConnected || this.isReconnecting) return;

      const sentAt = Date.now();
      let requests: ServerRequest[];
      try {
        requests = await this.queryData();
        this.failCount = 0;
      } catch (e) {
        console.error(`[ScriptBridge] [query] fetch failed:`, e.message || e);
        this.http.cancelAll('Request timeout');
        
        this.failCount++;
        if (this.failCount >= 3) {
          console.error('[ScriptBridge] Multiple timeouts detected, reconnecting...');
          this.scheduleReconnect();
        }
        return;
      }

      for (const request of requests) {
        this.handleRequest(request, response => {
          this.http.POST('/query', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          }).catch(e => console.error('[ScriptBridge] Failed to send response:', e));
        });
      }

      this.deltaTimes.push(Date.now() - sentAt);
      if (this.deltaTimes.length > 10) this.deltaTimes.shift();
    }, intervalTicks);
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting) return;
    
    this.emit('disconnect', { reason: DisconnectReason.ConnectionLost });
    
    this.destroy();
    
    const backoffSeconds = Math.min(Math.pow(2, this.reconnectAttempts), 60);
    const backoffTicks = backoffSeconds * 20;
    
    console.error(`[ScriptBridge] Reconnect after ${backoffSeconds} seconds...`);
    
    system.runTimeout(() => {
      this.connect().then(() => {
        console.log('[ScriptBridge] Reconnected to server!');
      }).catch(e => {
        console.error('[ScriptBridge] Reconnection failed:', e.message);
      });
    }, backoffTicks);
  }

  private stopInterval(): void {    
    if (this.queryInterval !== null) {
      system.clearRun(this.queryInterval);
      this.queryInterval = null;
    }
  }
}