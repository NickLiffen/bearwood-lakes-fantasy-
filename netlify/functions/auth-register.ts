// POST /.netlify/functions/auth-register

import type { Handler } from '@netlify/functions';
import { registerUser } from './_shared/services/auth.service';
import { validateBody, registerSchema } from './_shared/validators/auth.validator';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = validateBody(registerSchema, event.body);
    const result = await registerUser(data);

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, data: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    const statusCode = message.includes('already exists') ? 409 : 400;
    return {
      statusCode,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
