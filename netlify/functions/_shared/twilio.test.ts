import { sendVerificationCode, checkVerificationCode } from './twilio';

const { mockCreate, mockCheckCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCheckCreate: vi.fn(),
}));

vi.mock('twilio', () => {
  return {
    default: vi.fn().mockReturnValue({
      verify: {
        v2: {
          services: vi.fn().mockReturnValue({
            verifications: { create: mockCreate },
            verificationChecks: { create: mockCheckCreate },
          }),
        },
      },
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test_sid');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'test_auth_token');
  vi.stubEnv('TWILIO_VERIFY_SERVICE_SID', 'VA_test_service');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('twilio', () => {
  describe('sendVerificationCode', () => {
    it('calls Twilio Verify API with SMS channel and phone number', async () => {
      mockCreate.mockResolvedValue({ status: 'pending' });

      const result = await sendVerificationCode('+447123456789');

      expect(result).toBe('pending');
      expect(mockCreate).toHaveBeenCalledWith({
        channel: 'sms',
        to: '+447123456789',
      });
    });
  });

  describe('checkVerificationCode', () => {
    it('returns true when status is approved', async () => {
      mockCheckCreate.mockResolvedValue({ status: 'approved' });

      const result = await checkVerificationCode('+447123456789', '123456');

      expect(result).toBe(true);
      expect(mockCheckCreate).toHaveBeenCalledWith({
        code: '123456',
        to: '+447123456789',
      });
    });

    it('returns false when status is not approved', async () => {
      mockCheckCreate.mockResolvedValue({ status: 'pending' });

      const result = await checkVerificationCode('+447123456789', '000000');

      expect(result).toBe(false);
    });

    it('returns false when Twilio returns 404 (expired/already used)', async () => {
      const error = new Error('Not found');
      (error as any).status = 404;
      mockCheckCreate.mockRejectedValue(error);

      const result = await checkVerificationCode('+447123456789', '123456');

      expect(result).toBe(false);
    });

    it('re-throws non-404 errors', async () => {
      const error = new Error('Internal server error');
      (error as any).status = 500;
      mockCheckCreate.mockRejectedValue(error);

      await expect(checkVerificationCode('+447123456789', '123456')).rejects.toThrow(
        'Internal server error'
      );
    });
  });
});
