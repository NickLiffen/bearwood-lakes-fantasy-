// DELETE /.netlify/functions/users-delete-account

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { USERS_COLLECTION } from './_shared/models/User';
import { withVerifiedAuth, AuthenticatedEvent } from './_shared/middleware';

const handler = withVerifiedAuth(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const { db } = await connectToDatabase();

    // Delete user's picks first
    await db.collection('picks').deleteMany({ userId: event.user.userId });

    // Delete user's pick history
    await db.collection('pickHistory').deleteMany({ userId: event.user.userId });

    // Delete the user
    const result = await db.collection(USERS_COLLECTION).deleteOne({
      _id: new ObjectId(event.user.userId),
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
        message: 'Account deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting account:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to delete account' }),
    };
  }
});

export { handler };
