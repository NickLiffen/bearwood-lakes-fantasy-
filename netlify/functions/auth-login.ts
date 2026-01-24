// POST /.netlify/functions/auth-login

import { loginUser } from './_shared/services/auth.service';
import { validateBody, loginSchema } from './_shared/validators/auth.validator';
import { withRateLimit } from './_shared/middleware';

export const handler = withRateLimit(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const credentials = validateBody(loginSchema, event.body);
    const result = await loginUser(credentials);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
}, 'auth');
