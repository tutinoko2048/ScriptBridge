import { randomUUID } from 'crypto';
import { ServerRequest, ClientResponse, PayloadType, ResponseErrorReason } from './types';
import { DisconnectReason, InternalAction } from './enums';
import type { ScriptBridgeServer } from './server';
import { NamespaceRequiredError } from './errors';
import { BaseAction, InternalActions } from './actions';

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
    private readonly serverInstance: ScriptBridgeServer
  ) {
    this.serverInstance.sessions.set(this.id, this);
    this.serverInstance.emit('sessionCreate', this);
  }

  public async disconnect(reason: DisconnectReason = DisconnectReason.Disconnect): Promise<void> {
    await this.send<InternalActions.Disconnect>(InternalAction.Disconnect, { reason });
    this.serverInstance.emit('clientDisconnect', this, reason);
    this.destroy();
  }

  public destroy(): void {
    this.clearResponses();
    this.stopConnectionCheck();
    this.serverInstance.sessions.delete(this.id);
    this.serverInstance.emit('sessionDestroy', this);
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
        
        this.serverInstance.emit('responseReceive', response, this);

        if (this.deltaTimes.length >= 10) this.deltaTimes.shift();
        this.deltaTimes.push(Date.now() - sentAt);
      });
    });
  }

  public async sendPing(): Promise<number> {
    const start = Date.now();
    const res = await this.send<InternalActions.Ping>(InternalAction.Ping, undefined, 20_000);
    if (res.error) throw new Error(res.message);
    return Date.now() - start;
  }

  public get ping(): number {
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
    const options = this.serverInstance.options;
    this.connectionCheckInterval = setInterval(() => {
      if (
        this.lastQueryReceivedAt &&
        Date.now() - this.lastQueryReceivedAt > options.requestIntervalTicks! * 50 * options.timeoutThresholdMultiplier!
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
