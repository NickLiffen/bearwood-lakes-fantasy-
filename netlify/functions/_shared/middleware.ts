// Middleware wrappers for Netlify Functions

import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { verifyToken, JwtPayload } from './auth';

export interface AuthenticatedEvent extends HandlerEvent {
  user: JwtPayload;
}

type AuthenticatedHandler = (
  event: AuthenticatedEvent,
  context: HandlerContext
) => Promise<HandlerResponse>;

/**
 * Wrapper that requires authentication
 */
export function withAuth(handler: AuthenticatedHandler): Handler {
  return async (event, context) => {
    const authHeader = event.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    try {
      const token = authHeader.slice(7);
      const user = verifyToken(token);

      const authenticatedEvent = { ...event, user } as AuthenticatedEvent;
      return handler(authenticatedEvent, context);
    } catch {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid token' }),
      };
    }
  };
}

/**
 * Wrapper that requires admin role
 */
export function withAdmin(handler: AuthenticatedHandler): Handler {
  return withAuth(async (event, context) => {
    if (event.user.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Admin access required' }),
      };
    }
    return handler(event, context);
  });
}
