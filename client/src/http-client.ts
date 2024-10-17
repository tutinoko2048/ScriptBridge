import { http, HttpHeader, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import { URLParams } from './utils/URLParams';

export class HttpClient {
  public baseUrl: string = '';

  public async GET(path: string, headers?: Record<string, string>, params?: Record<string, string>, timeout?: number): Promise<string> {
    let url = this.baseUrl + path;
    if (params) url += '?' + new URLParams(params).toString();
    const request = new HttpRequest(url)
      .setMethod(HttpRequestMethod.Get)
      .setHeaders(this.toHttpHeaders(headers))
    if (timeout) request.setTimeout(timeout);
    const response = await http.request(request);
    if (response.status !== 200) throw new Error(`Failed to GET ${path} with status ${response.status}`);
    return response.body;
  }

  public async POST(path: string, headers?: Record<string, string>, body?: string, timeout?: number): Promise<string> {
    const request = new HttpRequest(this.baseUrl + path)
      .setMethod(HttpRequestMethod.Post)
      .setHeaders(this.toHttpHeaders(headers));
    if (body) request.setBody(body);
    if (timeout) request.setTimeout(timeout);
    const response = await http.request(request);
    if (response.status !== 200) throw new Error(`Failed to POST ${path} with status ${response.status}`);
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