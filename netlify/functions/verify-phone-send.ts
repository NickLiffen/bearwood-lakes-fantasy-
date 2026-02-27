// POST /.netlify/functions/verify-phone-send
// Resends a verification code to the user's stored phone number.

import { withAuth, apiResponse } from './_shared/middleware';
import { sendPhoneVerification } from './_shared/services/verification.service';

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    await sendPhoneVerification(event.user.userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { message: 'Verification code sent' },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send verification code';

    if (message.includes('already verified')) {
      return apiResponse(409, null, message);
    }

    return apiResponse(400, null, message);
  }
}, 'verification');
