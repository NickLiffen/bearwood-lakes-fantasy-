// PUT /.netlify/functions/users-update-profile

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION, toUser } from './_shared/models/User';
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
    const { firstName, lastName, email } = body;

    if (!firstName || !lastName || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'firstName, lastName, and email are required' }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid email format' }),
      };
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<UserDocument>(USERS_COLLECTION);

    // Check if email is already used by another user
    const existingUser = await collection.findOne({
      email,
      _id: { $ne: new ObjectId(event.user.userId) },
    });

    if (existingUser) {
      return {
        statusCode: 409,
        body: JSON.stringify({ success: false, error: 'Email is already in use' }),
      };
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(event.user.userId) },
      {
        $set: {
          firstName,
          lastName,
          email,
          updatedAt: new Date(),
        },
      },
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
        message: 'Profile updated successfully',
      }),
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to update profile' }),
    };
  }
});

export { handler };
