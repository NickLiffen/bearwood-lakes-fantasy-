// POST /.netlify/functions/verify-phone-check
// Checks a verification code and marks the user's phone as verified.

import { withAuth, apiResponse } from './_shared/middleware';
import { validateBody, verifyPhoneSchema } from './_shared/validators/auth.validator';
import { checkPhoneVerification } from './_shared/services/verification.service';
import { setRefreshTokenCookie, getClientInfo } from './_shared/utils/cookies';

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const { code } = validateBody(verifyPhoneSchema, event.body);
    const { userAgent, ipAddress } = getClientInfo(event.headers);

    const result = await checkPhoneVerification(
      event.user.userId,
      code,
      userAgent,
      ipAddress
    );

    // Set new refresh token cookie
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': cookieHeader,
      },
      body: JSON.stringify({
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';

    if (message.includes('Invalid or expired')) {
      return apiResponse(400, null, message);
    }
    if (message.includes('already verified')) {
      return apiResponse(409, null, message);
    }

    return apiResponse(400, null, message);
  }
}, 'verification');
