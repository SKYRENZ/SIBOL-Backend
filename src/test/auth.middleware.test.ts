/**
 * Mock DB first so authenticate() loads the mocked pool when required.
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
  default: { query: jest.fn() },
}));

const { pool } = require('../config/db');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/authenticate');

// Ensure JWT secret is set before requiring the middleware so the module-level SECRET picks it up
const OLD_ENV = process.env;
process.env = { ...OLD_ENV, JWT_SECRET: 'testsecret' };

describe('authenticate middleware', () => {
  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('attaches account to req.user when token valid and account exists', async () => {
    const payload = { Account_id: 42 };
    const token = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    // mock DB to return account row
    const fakeAccount = { Account_id: 42, Roles: 1, User_modules: '1,2,3' };
    pool.query.mockResolvedValueOnce([[fakeAccount]]);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.Account_id).toBe(42);
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
      [42]
    );
  });

  test('returns 401 when token is missing', async () => {
    const req: any = { headers: {} };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when token is invalid', async () => {
    const req: any = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});