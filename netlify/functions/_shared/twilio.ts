// Twilio client for phone verification via Verify API v2

import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'Please ensure it is set in your Netlify environment variables or .env file.'
    );
  }
  return value;
}

function getTwilioClient() {
  if (!twilioClient) {
    twilioClient = twilio(
      getRequiredEnv('TWILIO_ACCOUNT_SID'),
      getRequiredEnv('TWILIO_AUTH_TOKEN')
    );
  }
  return twilioClient;
}

function getVerifyServiceSid(): string {
  return getRequiredEnv('TWILIO_VERIFY_SERVICE_SID');
}

/**
 * Send a verification code via SMS to the given phone number.
 * Returns the verification status (should be 'pending').
 */
export async function sendVerificationCode(phoneNumber: string): Promise<string> {
  const client = getTwilioClient();
  const verification = await client.verify.v2.services(getVerifyServiceSid()).verifications.create({
    channel: 'sms',
    to: phoneNumber,
  });
  return verification.status;
}

/**
 * Check a user-provided verification code against the Twilio Verify API.
 * Returns true if the code is correct ('approved'), false otherwise.
 */
export async function checkVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
  const client = getTwilioClient();
  try {
    const check = await client.verify.v2.services(getVerifyServiceSid()).verificationChecks.create({
      code,
      to: phoneNumber,
    });
    return check.status === 'approved';
  } catch (error) {
    // Twilio returns 404 if the verification expired or was already approved
    if (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 404
    ) {
      return false;
    }
    throw error;
  }
}
