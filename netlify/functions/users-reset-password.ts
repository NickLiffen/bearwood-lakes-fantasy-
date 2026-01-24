// Admin: Reset user password

import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { hashPassword } from './_shared/auth';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

// Generate a random temporary password
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
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

    // Prevent admin from resetting their own password via this method
    if (userId === event.user.userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'You cannot reset your own password. Use the profile settings instead.' }),
      };
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<UserDocument>(USERS_COLLECTION);

    // Get target user
    const targetUser = await collection.findOne({ _id: new ObjectId(userId) });
    if (!targetUser) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);

    // Update user's password
    await collection.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          passwordHash: hashedPassword,
          updatedAt: new Date(),
        } 
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          tempPassword,
          message: `Password reset for ${targetUser.firstName} ${targetUser.lastName}. Send them this temporary password.`,
        },
      }),
    };
  } catch (error) {
    console.error('Password reset error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
});

export { handler };
