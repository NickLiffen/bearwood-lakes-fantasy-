// DELETE /.netlify/functions/users-delete (admin only)

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { USERS_COLLECTION } from './_shared/models/User';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId } = body;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'userId is required' }),
      };
    }

    // Prevent admin from deleting themselves
    if (event.user.userId === userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'You cannot delete your own account from here' }),
      };
    }

    const { db } = await connectToDatabase();

    // Delete user's picks first
    await db.collection('picks').deleteMany({ userId });

    // Delete user's pick history
    await db.collection('pickHistory').deleteMany({ userId });

    // Delete the user
    const result = await db.collection(USERS_COLLECTION).deleteOne({
      _id: new ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'User deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to delete user' }),
    };
  }
});

export { handler };
