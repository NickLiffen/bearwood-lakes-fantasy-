// PUT /.netlify/functions/users-update-role

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION, toUser } from './_shared/models/User';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, role } = body;

    if (!userId || !role) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'userId and role are required' }),
      };
    }

    if (!['admin', 'user'].includes(role)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Role must be "admin" or "user"' }),
      };
    }

    // Prevent admin from changing their own role
    if (event.user.userId === userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'You cannot change your own role' }),
      };
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<UserDocument>(USERS_COLLECTION);

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    const user = toUser(result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: user,
        message: `User role updated to ${role}`,
      }),
    };
  } catch (error) {
    console.error('Error updating user role:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to update user role',
      }),
    };
  }
});

export { handler };
