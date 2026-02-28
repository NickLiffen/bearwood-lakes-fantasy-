import {
  errorResponse,
  successResponse,
  successResponseWithMeta,
  methodNotAllowed,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  internalError,
} from './response';

describe('errorResponse', () => {
  it('returns correct statusCode', () => {
    const res = errorResponse(422, 'Validation failed');
    expect(res.statusCode).toBe(422);
  });

  it('returns JSON body with success false', () => {
    const res = errorResponse(400, 'Bad');
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: false, error: 'Bad' });
  });

  it('includes Content-Type header', () => {
    const res = errorResponse(500, 'err');
    expect(res.headers?.['Content-Type']).toBe('application/json');
  });

  it('merges custom headers', () => {
    const res = errorResponse(400, 'err', { 'X-Custom': 'val' });
    expect(res.headers?.['X-Custom']).toBe('val');
    expect(res.headers?.['Content-Type']).toBe('application/json');
  });
});

describe('successResponse', () => {
  it('returns statusCode 200', () => {
    const res = successResponse({ items: [] });
    expect(res.statusCode).toBe(200);
  });

  it('returns JSON body with success true and data', () => {
    const res = successResponse({ id: 1 });
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: true, data: { id: 1 } });
  });

  it('includes Content-Type header', () => {
    const res = successResponse(null);
    expect(res.headers?.['Content-Type']).toBe('application/json');
  });

  it('merges custom headers', () => {
    const res = successResponse('ok', { 'Set-Cookie': 'tok=abc' });
    expect(res.headers?.['Set-Cookie']).toBe('tok=abc');
  });
});

describe('successResponseWithMeta', () => {
  it('includes data and meta fields at root level', () => {
    const res = successResponseWithMeta([1, 2], { total: 2, page: 1 });
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([1, 2]);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
  });

  it('returns statusCode 200', () => {
    const res = successResponseWithMeta([], {});
    expect(res.statusCode).toBe(200);
  });
});

describe('methodNotAllowed', () => {
  it('returns 405', () => {
    expect(methodNotAllowed().statusCode).toBe(405);
  });

  it('returns correct error message', () => {
    const body = JSON.parse(methodNotAllowed().body);
    expect(body.error).toBe('Method not allowed');
  });
});

describe('unauthorized', () => {
  it('returns 401', () => {
    expect(unauthorized().statusCode).toBe(401);
  });

  it('returns Unauthorized message', () => {
    const body = JSON.parse(unauthorized().body);
    expect(body.error).toBe('Unauthorized');
  });
});

describe('forbidden', () => {
  it('returns 403', () => {
    expect(forbidden().statusCode).toBe(403);
  });

  it('returns Forbidden message', () => {
    const body = JSON.parse(forbidden().body);
    expect(body.error).toBe('Forbidden');
  });
});

describe('notFound', () => {
  it('returns 404 with default message', () => {
    const res = notFound();
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Resource not found');
  });

  it('returns 404 with custom resource', () => {
    const body = JSON.parse(notFound('User').body);
    expect(body.error).toBe('User not found');
  });
});

describe('badRequest', () => {
  it('returns 400 with custom message', () => {
    const res = badRequest('Invalid email');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid email');
  });
});

describe('internalError', () => {
  it('returns 500 with default message', () => {
    const res = internalError();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('Internal server error');
  });

  it('returns 500 with Error message', () => {
    const res = internalError(new Error('DB down'));
    expect(JSON.parse(res.body).error).toBe('DB down');
  });

  it('returns 500 with default message for non-Error', () => {
    const res = internalError('string error');
    expect(JSON.parse(res.body).error).toBe('Internal server error');
  });
});
