// GET /.netlify/functions/users-list

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { getAllUsers } from './_shared/services/users.service';

export const handler: Handler = withAuth(async () => {
  try {
    const users = await getAllUsers();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: users }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
