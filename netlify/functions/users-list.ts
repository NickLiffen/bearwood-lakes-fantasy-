// GET /.netlify/functions/users-list

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { getAllUsers } from './_shared/services/users.service';
import { successResponse, internalError } from './_shared/utils/response';

export const handler: Handler = withAuth(async () => {
  try {
    const users = await getAllUsers();
    return successResponse(users);
  } catch (error) {
    return internalError(error);
  }
});
