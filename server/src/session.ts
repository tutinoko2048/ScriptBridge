import { randomUUID } from 'crypto';
import {
  ServerRequest,
  ClientResponse,
  PayloadType,
  ResponseErrorReason,
  DisconnectReason,
  BaseAction,
  InternalAction,
  InternalActions,
} from '@script-bridge/protocol';
import type { ScriptBridgeServer } from './server';
import { NamespaceRequiredError } from './errors';

export class Session {
  /** session id */
  public readonly id = randomUUID();
  
  /** client-defined id */
  public clientId: string;

  public readonly _awaitingResponses = new Map<string, (response: ClientResponse) => void>();
  
  private readonly sendQueue: ServerRequest[] = [];
  private readonly deltaTimes: number[] = [];
  private lastQueryReceivedAt: number | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly server: ScriptBridgeServer
  ) {
    this.server.sessions.set(this.id, this);
    this.server.emit('sessionCreate', this);
  }

  public async disconnect(reason: DisconnectReason = DisconnectReason.Disconnect): Promise<void> {
    await this.send<InternalActions.Disconnect>(InternalAction.Disconnect, { reason }, 5_000);
    this.server.emit('clientDisconnect', this, reason);
    this.destroy();
  }

  public destroy(): void {
    this.clearResponses();
    this.stopConnectionCheck();
    this.server.sessions.delete(this.id);
    this.server.emit('sessionDestroy', this);
  }

  public send<A extends BaseAction = BaseAction>(
    channelId: A['id'],
    data?: A['request'],
    timeout: number = 10_000
  ): Promise<ClientResponse<A['response']>> {
    if (!channelId.includes(':')) throw new NamespaceRequiredError(channelId);

    const requestId = randomUUID();
    this.sendQueue.push({
      type: PayloadType.Request,
      channelId,
      requestId,
      data,
    });
    
    const sentAt = Date.now();

    return new Promise((resolve) => {
      const to = setTimeout(() => {
        this._awaitingResponses.delete(requestId);
        resolve({
          type: PayloadType.Response,
          error: true,
          message: 'Request timed out',
          errorReason: ResponseErrorReason.Timeout,
          sessionId: this.id,
          requestId,
        });
      }, timeout);

      this._awaitingResponses.set(requestId, (response: ClientResponse<A['response']>) => {
        this._awaitingResponses.delete(requestId);
        clearTimeout(to);
        resolve(response);
        
        this.server.emit('responseReceive', response, this);

        if (this.deltaTimes.length >= 10) this.deltaTimes.shift();
        this.deltaTimes.push(Date.now() - sentAt);
      });
    });
  }

  public async sendPing(): Promise<{ roundTrip: number, toClient: number }> {
    const start = Date.now();
    const res = await this.send<InternalActions.Ping>(InternalAction.Ping, undefined, 20_000);
    if (res.error) throw new Error(res.message);
    return {
      roundTrip: Date.now() - start,
      toClient: res.data.receivedAt - start,
    };
  }

  public get averagePing(): number {
    if (this.deltaTimes.length === 0) return -1;
    return this.deltaTimes.reduce((a, b) => a + b, 0) / this.deltaTimes.length;
  }

  public getQueue(): ServerRequest[] {
    this.lastQueryReceivedAt = Date.now();

    const queue = this.sendQueue.slice();
    this.sendQueue.length = 0;
    return queue;
  }

  public onConnect(): void {
    this.startConnectionCheck();
  }
  
  private clearResponses(): void {
    for (const [requestId, respond] of this._awaitingResponses) {
      respond({
        type: PayloadType.Response,
        error: true,
        message: 'Session disconnected',
        errorReason: ResponseErrorReason.Abort,
        sessionId: this.id,
        requestId,
      });
    }
    this._awaitingResponses.clear();
  }

  private startConnectionCheck(): void {
    this.connectionCheckInterval = setInterval(() => {
      if (
        this.lastQueryReceivedAt &&
        Date.now() - this.lastQueryReceivedAt > this.server.requestIntervalTicks * 50 * this.server.timeoutThresholdMultiplier
      ) {
        this.disconnect(DisconnectReason.ConnectionLost);
        this.stopConnectionCheck();
      }
    }, 200);
  }
  
  private stopConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }
}
