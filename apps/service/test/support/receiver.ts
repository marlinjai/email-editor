import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type ReceivedRequest = { headers: Record<string, string | string[] | undefined>; rawBody: string };
export type Behavior = { status: number; body?: string } | 'hang';

/**
 * A local HTTP server the webhook delivery loop tests point real endpoints at:
 * a real socket, a real HTTP round trip, so a signature check runs against
 * bytes that actually crossed a wire, not a mocked fetch. Runs on
 * 127.0.0.1 on an ephemeral port (SSRF-blocked by default; tests opt in with
 * `webhookUrlPolicy: { allowInsecureHttp: true, allowPrivateTargets: true }`).
 */
export class TestReceiver {
  readonly received: ReceivedRequest[] = [];
  private queue: Behavior[] = [];
  private defaultBehavior: Behavior = { status: 200, body: 'ok' };
  private readonly hanging: ServerResponse[] = [];

  private constructor(private readonly server: Server) {}

  static async start(): Promise<TestReceiver> {
    const server = createServer();
    const receiver = new TestReceiver(server);
    server.on('request', (req, res) => receiver.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return receiver;
  }

  get port(): number {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('receiver is not listening');
    return addr.port;
  }

  url(path = '/'): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  /** Queues one response for the next request received; falls back to `setDefault` once drained. */
  queueNext(behavior: Behavior): this {
    this.queue.push(behavior);
    return this;
  }

  setDefault(behavior: Behavior): this {
    this.defaultBehavior = behavior;
    return this;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      this.received.push({ headers: req.headers, rawBody });
      const behavior = this.queue.shift() ?? this.defaultBehavior;
      if (behavior === 'hang') {
        this.hanging.push(res);
        return;
      }
      res.writeHead(behavior.status, { 'content-type': 'text/plain' });
      res.end(behavior.body ?? '');
    });
  }

  /** Destroys every response left hanging, so a "the provider stopped answering" test can finish. */
  releaseHanging(): void {
    for (const res of this.hanging.splice(0)) res.destroy();
  }

  async close(): Promise<void> {
    this.releaseHanging();
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }
}
