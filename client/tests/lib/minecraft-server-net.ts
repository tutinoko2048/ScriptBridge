// Type definitions for Minecraft Bedrock Edition script APIs
// Project: https://docs.microsoft.com/minecraft/creator/
// Definitions by: Jake Shirley <https://github.com/JakeShirley>
//                 Mike Ammerlaan <https://github.com/mammerla>

/* *****************************************************************************
   Copyright (c) Microsoft Corporation.
   ***************************************************************************** */

export enum HttpRequestMethod {
  Delete = 'Delete',
  Get = 'Get',
  Head = 'Head',
  Post = 'Post',
  Put = 'Put',
}

const _abortControllers = new Map<number, AbortController>();
let _abortControllerId = 0;

export class HttpClient {
  async request(config: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    _abortControllers.set(_abortControllerId++, controller);

    const { method, uri, headers, body } = config;
    const _res = await fetch(uri, {
      method,
      headers: this.transformHeaders(headers),
      body,
      signal: controller.signal
    });

    _abortControllers.delete(_abortControllerId);

    return new HttpResponse(
      await _res.text(),
      headers,
      config,
      _res.status
    );
  }

  cancelAll(reason: string): void {
    for (const controller of _abortControllers.values()) {
      controller.abort(reason);
    }
    _abortControllers.clear();
  }

  private transformHeaders(headers: HttpHeader[]): Record<string, string> {
    return headers.reduce((acc, header) => {
      acc[header.key] = header.value;
      return acc;
    }, {} as Record<string, string>);
  }
}

export class HttpHeader {
  constructor(
    public key: string,
    public value: string
  ) {}
}

export class HttpRequest {
  body: string;
  headers: HttpHeader[];
  method: HttpRequestMethod;
  timeout: number;
  constructor(public uri: string) {};
  addHeader(
    key: string,
    value: string
  ): HttpRequest {
    this.headers.push(new HttpHeader(key, value));
    return this;
  }

  setBody(body: string): HttpRequest {
    this.body = body;
    return this;
  }

  setHeaders(headers: HttpHeader[]): HttpRequest {
    this.headers = headers;
    return this;
  }

  setMethod(method: HttpRequestMethod): HttpRequest {
    this.method = method;
    return this;
  }

  setTimeout(timeout: number): HttpRequest {
    this.timeout = timeout;
    return this;
  }
}

/**
 * Main object that contains result information from a request.
 */
export class HttpResponse {
  constructor(
    readonly body: string,
    readonly headers: HttpHeader[],
    readonly request: HttpRequest,
    readonly status: number
  ) {}
}

export const http = new HttpClient();
