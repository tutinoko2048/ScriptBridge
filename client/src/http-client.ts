import { http, HttpHeader, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import { URLParams } from './utils/URLParams';

interface GetOptions {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

interface PostOptions {
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpClient {
  public baseUrl: string = '';

  public async GET(path: string, options?: GetOptions): Promise<string> {
    let url = this.baseUrl + path;
    if (options?.params) url += '?' + new URLParams(options.params).toString();
    const request = new HttpRequest(url)
      .setMethod(HttpRequestMethod.Get);
    if (options?.headers) request.setHeaders(this.toHttpHeaders(options.headers))
    if (options?.timeout) request.setTimeout(options.timeout);
    const response = await http.request(request);
    if (response.status !== 200) throw new Error(`(${response.status}) Failed to GET ${path}: ${response.body}`);
    return response.body;
  }

  public async POST(path: string, options?: PostOptions): Promise<string> {
    const request = new HttpRequest(this.baseUrl + path)
      .setMethod(HttpRequestMethod.Post);
    if (options?.headers) request.setHeaders(this.toHttpHeaders(options.headers));
    if (options?.body) request.setBody(options.body);
    if (options?.timeout) request.setTimeout(options.timeout);
    const response = await http.request(request);
    if (response.status !== 200) throw new Error(`(${response.status}) Failed to POST ${path}: ${response.body}`);
    return response.body;
  }

  public cancelAll(reason: string): void {
    http.cancelAll(reason);
  }

  private toHttpHeaders(headers?: Record<string, string>): HttpHeader[] {
    if (!headers) return [];
    return Object.entries(headers).map(([key, value]) => new HttpHeader(key, value));
  }
}