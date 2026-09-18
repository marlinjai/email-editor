import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * A local HTTP server `assets.import` fetches from in tests: real sockets, so
 * redirects, lying or missing Content-Length and slow answers behave as they
 * would from a real remote host. Listens on 127.0.0.1, which the import's SSRF
 * guard refuses unless the harness opts in with an open `webhookUrlPolicy`.
 */
export type Route =
  | { status?: number; body: Buffer; headers?: Record<string, string>; chunked?: boolean }
  | { redirect: string }
  | 'hang';

export class ImageServer {
  readonly hits: string[] = [];
  private readonly routes = new Map<string, Route>();
  private readonly hanging: ServerResponse[] = [];

  private constructor(private readonly server: Server) {}

  static async start(): Promise<ImageServer> {
    const server = createServer();
    const s = new ImageServer(server);
    server.on('request', (req, res) => s.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return s;
  }

  url(path: string): string {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('image server is not listening');
    return `http://127.0.0.1:${addr.port}${path}`;
  }

  on(path: string, route: Route): this {
    this.routes.set(path, route);
    return this;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const path = req.url ?? '/';
    this.hits.push(path);
    const route = this.routes.get(path);
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    if (route === 'hang') {
      this.hanging.push(res);
      return;
    }
    if ('redirect' in route) {
      res.writeHead(302, { location: route.redirect }).end();
      return;
    }
    const headers: Record<string, string> = { 'content-type': 'image/png', ...(route.headers ?? {}) };
    if (!route.chunked && headers['content-length'] === undefined) headers['content-length'] = String(route.body.length);
    res.writeHead(route.status ?? 200, headers);
    if (route.chunked) {
      // No Content-Length: the body arrives in pieces, so only counting can stop it.
      const size = 64 * 1024;
      for (let i = 0; i < route.body.length; i += size) res.write(route.body.subarray(i, i + size));
      res.end();
      return;
    }
    res.end(route.body);
  }

  async stop(): Promise<void> {
    for (const res of this.hanging.splice(0)) res.destroy();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
