import { Logger, createLogger, logger, generateRequestId, getRequestId } from './logger';

describe('Logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('NODE_ENV', 'development');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('debug calls console.log', () => {
    const l = new Logger();
    l.debug('test debug');
    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.level).toBe('debug');
    expect(logged.message).toBe('test debug');
  });

  it('info calls console.log', () => {
    const l = new Logger();
    l.info('test info');
    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.level).toBe('info');
  });

  it('warn calls console.warn', () => {
    const l = new Logger();
    l.warn('test warn');
    expect(warnSpy).toHaveBeenCalled();
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.level).toBe('warn');
  });

  it('error calls console.error', () => {
    const l = new Logger();
    l.error('test error');
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.level).toBe('error');
  });

  it('error includes error details', () => {
    const l = new Logger();
    l.error('fail', new Error('boom'));
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.error.name).toBe('Error');
    expect(logged.error.message).toBe('boom');
    expect(logged.error.stack).toBeDefined();
  });

  it('error omits stack in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'debug');
    const l = new Logger();
    l.error('fail', new Error('boom'));
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.error.stack).toBeUndefined();
  });

  it('includes context in log entries', () => {
    const l = new Logger({ requestId: 'req-1', endpoint: '/api/test' });
    l.info('hi');
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.context.requestId).toBe('req-1');
    expect(logged.context.endpoint).toBe('/api/test');
  });

  it('merges per-call context', () => {
    const l = new Logger({ requestId: 'r1' });
    l.info('hi', { extra: 'data' });
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.context.requestId).toBe('r1');
    expect(logged.context.extra).toBe('data');
  });

  it('child creates new logger with merged context', () => {
    const parent = new Logger({ requestId: 'r1' });
    const child = parent.child({ userId: 'u1' });
    child.info('child msg');
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.context.requestId).toBe('r1');
    expect(logged.context.userId).toBe('u1');
  });

  it('setRequestId is chainable', () => {
    const l = new Logger();
    const ret = l.setRequestId('abc');
    expect(ret).toBe(l);
    l.info('msg');
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.context.requestId).toBe('abc');
  });

  it('setUserId is chainable', () => {
    const l = new Logger();
    const ret = l.setUserId('u1');
    expect(ret).toBe(l);
  });

  it('setEndpoint is chainable', () => {
    const l = new Logger();
    const ret = l.setEndpoint('/test');
    expect(ret).toBe(l);
  });

  it('includes timestamp in ISO format', () => {
    const l = new Logger();
    l.info('time test');
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.timestamp).toBeTruthy();
    expect(() => new Date(logged.timestamp)).not.toThrow();
  });
});

describe('log level filtering', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('suppresses debug when LOG_LEVEL=info', () => {
    vi.stubEnv('LOG_LEVEL', 'info');
    const l = new Logger();
    l.debug('should not appear');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('suppresses debug and info when LOG_LEVEL=warn', () => {
    vi.stubEnv('LOG_LEVEL', 'warn');
    const l = new Logger();
    l.debug('no');
    l.info('no');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('only allows error when LOG_LEVEL=error', () => {
    vi.stubEnv('LOG_LEVEL', 'error');
    const l = new Logger();
    l.debug('no');
    l.info('no');
    l.warn('no');
    expect(logSpy).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('defaults to info in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', '');
    const l = new Logger();
    l.debug('should be suppressed');
    expect(logSpy).not.toHaveBeenCalled();
    l.info('should appear');
    expect(logSpy).toHaveBeenCalled();
  });

  it('defaults to debug in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', '');
    const l = new Logger();
    l.debug('should appear');
    expect(logSpy).toHaveBeenCalled();
  });
});

describe('createLogger', () => {
  it('returns a Logger instance', () => {
    const l = createLogger();
    expect(l).toBeInstanceOf(Logger);
  });

  it('accepts initial context', () => {
    const l = createLogger({ endpoint: '/test' });
    expect(l).toBeInstanceOf(Logger);
  });
});

describe('logger singleton', () => {
  it('is a Logger instance', () => {
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe('generateRequestId', () => {
  it('starts with req_ prefix', () => {
    expect(generateRequestId()).toMatch(/^req_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()));
    expect(ids.size).toBe(50);
  });
});

describe('getRequestId', () => {
  it('returns x-request-id header when present', () => {
    expect(getRequestId({ 'x-request-id': 'custom-id' })).toBe('custom-id');
  });

  it('generates new ID when header is missing', () => {
    const id = getRequestId({});
    expect(id).toMatch(/^req_/);
  });

  it('generates new ID when header is undefined', () => {
    const id = getRequestId({ 'x-request-id': undefined });
    expect(id).toMatch(/^req_/);
  });
});
