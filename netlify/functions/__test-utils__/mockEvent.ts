import type { HandlerEvent, HandlerContext } from '@netlify/functions';

/**
 * Factory for creating a mock HandlerEvent. Provides sensible defaults
 * so each test only specifies the fields it cares about.
 */
export function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    rawUrl: 'http://localhost/.netlify/functions/test',
    rawQuery: '',
    path: '/.netlify/functions/test',
    httpMethod: 'GET',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  };
}

/**
 * Factory for creating an authenticated HandlerEvent (with Bearer token header).
 */
export function makeAuthEvent(
  overrides: Partial<HandlerEvent> = {}
): HandlerEvent {
  return makeEvent({
    headers: { authorization: 'Bearer valid-token', ...overrides.headers },
    ...overrides,
  });
}

/**
 * Reusable mock HandlerContext (AWS Lambda–shaped).
 */
export const mockContext: HandlerContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: '',
  memoryLimitInMB: '128',
  awsRequestId: '',
  logGroupName: '',
  logStreamName: '',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

/**
 * Helper to parse a handler response body as JSON.
 */
export function parseBody(response: { body?: string | null }) {
  return JSON.parse(response.body || '{}');
}
