// Auth integration tests

import type { HandlerEvent, HandlerContext } from '@netlify/functions';
import { handler as loginHandler } from '../../../netlify/functions/auth-login';
import { handler as registerHandler } from '../../../netlify/functions/auth-register';

// Mock MongoDB
jest.mock('../../../netlify/functions/_shared/db', () => ({
  connectToDatabase: jest.fn(),
}));

describe('Auth Functions', () => {
  describe('auth-login', () => {
    it('should return 405 for non-POST requests', async () => {
      const event = {
        httpMethod: 'GET',
        body: null,
        headers: {},
      } as unknown as HandlerEvent;

      const response = await loginHandler(event, {} as HandlerContext);

      expect(response?.statusCode).toBe(405);
    });

    it('should return 401 for invalid credentials', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ username: 'invalid', password: 'wrong' }),
        headers: {},
      } as unknown as HandlerEvent;

      const response = await loginHandler(event, {} as HandlerContext);

      expect(response?.statusCode).toBe(401);
    });
  });

  describe('auth-register', () => {
    it('should return 405 for non-POST requests', async () => {
      const event = {
        httpMethod: 'GET',
        body: null,
        headers: {},
      } as unknown as HandlerEvent;

      const response = await registerHandler(event, {} as HandlerContext);

      expect(response?.statusCode).toBe(405);
    });
  });
});
