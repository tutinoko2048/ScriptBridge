export class NamespaceRequiredError extends Error {
  constructor(
    public channelId: string
  ) {
    super(`Channel ID "${channelId}" must include a namespace`);
  }
}