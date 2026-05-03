export interface RuntimeParams {
  __ow_method?: string;
  __ow_headers?: Record<string, string>;
  __ow_body?: string | object;
  __ow_path?: string;
  [key: string]: unknown;
}

export interface RuntimeResponse {
  statusCode: number;
  headers: Record<string, string>;
  /**
   * For web actions, OpenWhisk's `resultAsHttp` path handles JSON more reliably when `body`
   * is a structured JSON value (object/array) than when it is a string with `Content-Type:
   * application/json`. Non-JSON responses should use a string (e.g. HTML or plain text).
   * Streaming SSE may use a Node.js Readable stream as `body` when the runtime supports it.
   */
  body?: unknown;
}
