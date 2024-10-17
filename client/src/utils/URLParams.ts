export class URLParams {
  private params: Record<string, string> = {};

  constructor(query: Record<string, string>);
  constructor(query: string);
  constructor(query: string | Record<string, string> = '') {
    if (typeof query === 'string') {
      query.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) this.params[key] = value;
      });
    } else {
      this.params = query;
    }
  }

  get(key: string): string | null {
    return this.params[key] ?? null;
  }

  set(key: string, value: string): void {
    this.params[key] = value;
  }

  toString(): string {
    return Object.entries(this.params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }
}