import { createPerfTimer, measureTime, measureTimeAsync } from './perf';

describe('createPerfTimer', () => {
  beforeEach(() => {
    vi.stubEnv('PERF_LOG', 'true');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('measure records operation and returns result', async () => {
    const timer = createPerfTimer('test-handler');
    const result = await timer.measure('op1', async () => 42);
    expect(result).toBe(42);
  });

  it('measure records duration >= 0', async () => {
    const timer = createPerfTimer('test-handler');
    await timer.measure('op1', async () => 'data');
    const summary = timer.end();
    expect(summary.operations).toHaveLength(1);
    expect(summary.operations[0].operation).toBe('op1');
    expect(summary.operations[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('measure records metadata', async () => {
    const timer = createPerfTimer('handler');
    await timer.measure('query', async () => null, { table: 'users' });
    const summary = timer.end();
    expect(summary.operations[0].meta).toEqual({ table: 'users' });
  });

  it('log adds manual timing entry', () => {
    const timer = createPerfTimer('handler');
    timer.log('manual-op', 50, { note: 'manual' });
    const summary = timer.end();
    expect(summary.operations).toHaveLength(1);
    expect(summary.operations[0].durationMs).toBe(50);
    expect(summary.operations[0].meta).toEqual({ note: 'manual' });
  });

  it('end returns summary with handler name', () => {
    const timer = createPerfTimer('my-handler');
    const summary = timer.end();
    expect(summary.handler).toBe('my-handler');
    expect(summary.totalMs).toBeGreaterThanOrEqual(0);
    expect(summary.operations).toEqual([]);
  });

  it('end includes payload size when provided', () => {
    const timer = createPerfTimer('handler');
    const summary = timer.end(1024);
    expect(summary.payloadBytes).toBe(1024);
  });

  it('end returns undefined payloadBytes when not provided', () => {
    const timer = createPerfTimer('handler');
    const summary = timer.end();
    expect(summary.payloadBytes).toBeUndefined();
  });

  it('end logs when PERF_LOG=true', () => {
    const timer = createPerfTimer('handler');
    timer.end();
    expect(console.log).toHaveBeenCalled();
  });

  it('end does not log in production without PERF_LOG', () => {
    vi.stubEnv('PERF_LOG', '');
    vi.stubEnv('NODE_ENV', 'production');
    const timer = createPerfTimer('handler');
    timer.end();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('end logs in development environment', () => {
    vi.stubEnv('PERF_LOG', '');
    vi.stubEnv('NODE_ENV', 'development');
    const timer = createPerfTimer('handler');
    timer.end();
    expect(console.log).toHaveBeenCalled();
  });

  it('elapsed returns time since creation', async () => {
    const timer = createPerfTimer('handler');
    // Small wait to ensure elapsed > 0
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(timer.elapsed()).toBeGreaterThanOrEqual(0);
  });

  it('tracks multiple operations', async () => {
    const timer = createPerfTimer('multi');
    await timer.measure('op1', async () => 1);
    await timer.measure('op2', async () => 2);
    timer.log('op3', 100);
    const summary = timer.end();
    expect(summary.operations).toHaveLength(3);
  });
});

describe('measureTime', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the function result', () => {
    const result = measureTime('test', () => 99);
    expect(result).toBe(99);
  });

  it('logs performance with label', () => {
    measureTime('my-label', () => null);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('my-label'));
  });
});

describe('measureTimeAsync', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the async function result', async () => {
    const result = await measureTimeAsync('test', async () => 'hello');
    expect(result).toBe('hello');
  });

  it('logs performance with label', async () => {
    await measureTimeAsync('async-label', async () => null);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('async-label'));
  });
});
