// PUT /.netlify/functions/users-update-password

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { hashPassword, comparePassword } from './_shared/auth';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';

const handler = withAuth(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'currentPassword and newPassword are required' }),
      };
    }

    if (newPassword.length < 8) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters' }),
      };
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<UserDocument>(USERS_COLLECTION);

    // Get user with password hash
    const user = await collection.findOne({ _id: new ObjectId(event.user.userId) });

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Current password is incorrect' }),
      };
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    await collection.updateOne(
      { _id: new ObjectId(event.user.userId) },
      {
        $set: {
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        },
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Password updated successfully',
      }),
    };
  } catch (error) {
    console.error('Error updating password:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to update password' }),
    };
  }
});

export { handler };
