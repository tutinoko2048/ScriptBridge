export class UnhandledRequestError extends Error {
  constructor(public channelId: string) {
    super(`Received request for unhandled channel: ${channelId}`);
  }
}