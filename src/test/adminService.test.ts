// remove the early static import of the service so the mock applies first
// import * as adminService from '../services/adminService';
// import { pool } from '../config/db';
const { createSqlLogger } = require("./sqlLogger");
const SQL_LOGGER = createSqlLogger("adminService");
const LOG_SQL = process.env.MOCK_SQL_LOG === "true";

// MOCK bcrypt and emailService BEFORE requiring the service so the module uses mocks
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedpass'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../utils/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ provider: 'mock', statusCode: 202, body: '' }),
}));

// mock the DB module first
jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
    query: jest.fn(),
  },
}));

// require the mocked module and obtain the pool mock
const dbMock = require('../config/db');
const mockedPool = dbMock.pool as {
  execute: jest.Mock;
  getConnection: jest.Mock;
  query: jest.Mock;
};

// require the service after mocking
const adminService = require('../services/adminService');

describe('adminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // write execute calls into the SQL log
    if (SQL_LOGGER.filePath && mockedPool.execute && Array.isArray(mockedPool.execute.mock?.calls)) {
      for (const call of mockedPool.execute.mock.calls) {
        SQL_LOGGER.log(String(call[0]).replace(/\s+/g, " ").trim(), call[1]);
      }
    }
  });

  afterAll(() => {
    // unified directory print handled by sqlLogger
  });

  test('createUserAsAdmin creates user directly and returns result', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn()
        // 1. existingActive check -> no rows
        .mockResolvedValueOnce([[]])
        // 2. insert account -> insertId
        .mockResolvedValueOnce([{ insertId: 10 }])
        // 3. insert profile
        .mockResolvedValueOnce([{}]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockedPool.getConnection.mockResolvedValue(mockConn);

    // pool.execute after commit to fetch user
    const userRow = {
      Account_id: 10,
      Username: 'john.doe',
      Roles: 2,
      IsActive: 1,
      Account_created: new Date(),
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john@example.com',
      Contact: null,
      Area_id: 1,
    };
    mockedPool.execute.mockResolvedValueOnce([[userRow]]);

    const res = await adminService.createUserAsAdmin('John', 'Doe', 1, 'john@example.com', 2, 'plainpass');

    // ensure transactional flow occurred
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.execute).toHaveBeenCalledTimes(3);

    // 2nd execute call is the INSERT INTO accounts_tbl with 3 params (username, hashedPassword, roleId)
    const insertAccountCall = mockConn.execute.mock.calls[1];
    expect(String(insertAccountCall[0])).toContain('INSERT INTO accounts_tbl');
    expect(insertAccountCall[1]).toEqual(['john.doe', 'hashedpass', 2]);

    // 3rd execute call is the profile insert with newAccountId then names/barangay/email
    const insertProfileCall = mockConn.execute.mock.calls[2];
    expect(String(insertProfileCall[0])).toContain('INSERT INTO profile_tbl');
    expect(insertProfileCall[1]).toEqual([10, 'John', 'Doe', 1, 'john@example.com']);

    // final pool.execute to fetch user
    expect(mockedPool.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [10]);

    expect(res).toHaveProperty('success', true);
    expect(res).toHaveProperty('user');
    expect(res.user).toHaveProperty('Account_id', 10);
  });

  test('updateUser updates profile and roles inside a transaction and returns updated user', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue([{}]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockedPool.getConnection.mockResolvedValue(mockConn);

    // final SELECT after commit (pool.query)
    const userRow = {
      Account_id: 1,
      Username: 'john.doe',
      Roles: 2,
      IsActive: 1,
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john@example.com',
      Contact: '09171234567',
      Area_id: 1,
    };
    mockedPool.query.mockResolvedValueOnce([[userRow]]);

    const result = await adminService.updateUser(1, { FirstName: 'John', Roles: 2 });

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.execute).toHaveBeenCalled(); // updates inside transaction
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
    expect(mockedPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT a.Account_id'),
      [1]
    );
    expect(result).toHaveProperty('user');
    expect(result.user).toHaveProperty('Account_id', 1);
    expect(result.user).toHaveProperty('Username', 'john.doe');
  });

  test('setAccountActive updates isActive and returns account', async () => {
    // 1) first call is the UPDATE -> return a result object
    mockedPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // 2) second call is the SELECT -> return rows
    mockedPool.execute.mockResolvedValueOnce([[{ Account_id: 1, Username: 'john.doe', Roles: 2, IsActive: 0 }]]);
    const result = await adminService.setAccountActive(1, 0);
    // result is { success: true, account: {...} }
    expect(result.account).toHaveProperty('IsActive', 0);
  });
});