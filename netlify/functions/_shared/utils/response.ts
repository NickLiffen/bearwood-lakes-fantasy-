// Shared response utilities for consistent API responses

interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

const defaultHeaders = {
  'Content-Type': 'application/json',
};

/**
 * Creates a standardized error response
 */
export function errorResponse(
  statusCode: number,
  message: string,
  headers?: Record<string, string>
): ApiResponse {
  return {
    statusCode,
    headers: { ...defaultHeaders, ...headers },
    body: JSON.stringify({ success: false, error: message }),
  };
}

/**
 * Creates a standardized success response
 */
export function successResponse<T>(
  data: T,
  headers?: Record<string, string>
): ApiResponse {
  return {
    statusCode: 200,
    headers: { ...defaultHeaders, ...headers },
    body: JSON.stringify({ success: true, data }),
  };
}

/**
 * Creates a success response with additional fields at the root level
 */
export function successResponseWithMeta<T>(
  data: T,
  meta: Record<string, unknown>,
  headers?: Record<string, string>
): ApiResponse {
  return {
    statusCode: 200,
    headers: { ...defaultHeaders, ...headers },
    body: JSON.stringify({ success: true, data, ...meta }),
  };
}

// Common error responses
export const methodNotAllowed = () => errorResponse(405, 'Method not allowed');
export const unauthorized = () => errorResponse(401, 'Unauthorized');
export const forbidden = () => errorResponse(403, 'Forbidden');
export const notFound = (resource = 'Resource') => errorResponse(404, `${resource} not found`);
export const badRequest = (message: string) => errorResponse(400, message);
export const internalError = (error?: unknown) => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return errorResponse(500, message);
};
