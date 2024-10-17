export class NoActiveSessionError extends Error {
  constructor() {
    super('No active session exists');
  }
}