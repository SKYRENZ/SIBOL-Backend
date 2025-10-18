import * as adminService from '../services/adminService';
import { pool } from '../config/db';
import * as authService from '../services/authService';
import { createSqlLogger } from "./sqlLogger";
const SQL_LOGGER = createSqlLogger("adminService");
const LOG_SQL = process.env.MOCK_SQL_LOG === "true";

// mock the module first
jest.mock("../config/db", () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

// require the mocked module and obtain the pool mock
const dbMock = require("../config/db");
const mockedPool = dbMock.pool as {
  execute: jest.Mock;
  getConnection: jest.Mock;
};

jest.mock("../services/authService", () => ({
  registerUser: jest.fn(),
}));

const mockedAuth = require("../services/authService") as {
  registerUser: jest.Mock;
};

describe('adminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // DO NOT reassign mockedPool.execute/getConnection here — keep them as jest mocks
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

  test('createUserAsAdmin calls authService.registerUser and returns result', async () => {
    mockedAuth.registerUser.mockResolvedValue({ success: true, user: { Username: 'john.doe' } });

    const res = await adminService.createUserAsAdmin('John', 'Doe', 1, 'john@example.com', 2);

    expect(mockedAuth.registerUser).toHaveBeenCalledWith('John', 'Doe', 1, 'john@example.com', 2);
    expect(res).toEqual({ success: true, user: { Username: 'john.doe' } });
  });

  test('updateAccountAndProfile updates profile and roles inside a transaction and returns updated user', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue([{}]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockedPool.getConnection.mockResolvedValue(mockConn);

    // final SELECT after commit (pool.execute)
    mockedPool.execute.mockResolvedValueOnce([
      [
        {
          Account_id: 1,
          Username: 'john.doe',
          Roles: 2,
          IsActive: 1,
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'john@example.com',
          Contact: '09171234567',
          Area_id: 1,
        },
      ],
    ]);

    const result = await adminService.updateAccountAndProfile(1, { firstName: 'John', roleId: 2 });

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.execute).toHaveBeenCalled(); // updates inside transaction
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
    expect(mockedPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT a.Account_id'),
      [1]
    );
    expect(result).toHaveProperty('Account_id', 1);
    expect(result).toHaveProperty('Username', 'john.doe');
  });

  test('setAccountActive updates isActive and returns account', async () => {
    // First call: UPDATE -> can return an empty result
    mockedPool.execute.mockResolvedValueOnce([{}]);
    // Second call: SELECT -> return the account row
    mockedPool.execute.mockResolvedValueOnce([[{ Account_id: 1, Username: 'john.doe', Roles: 2, IsActive: 0 }]]);

    const account = await adminService.setAccountActive(1, 0);

    expect(mockedPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE accounts_tbl SET IsActive = ? WHERE Account_id = ?'),
      [0, 1]
    );
    expect(account).toHaveProperty('IsActive', 0);
  });
});