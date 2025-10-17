import { updateProfile } from '../services/profileService';
import { pool } from '../config/db';

jest.mock('../config/db');

describe('profileService updateProfile 15-day restriction', () => {
  const mockedPool: any = pool as any;

  beforeEach(() => {
    mockedPool.query = jest.fn();
    mockedPool.getConnection = jest.fn();
  });

  it('throws TOO_EARLY when last update is within 15 days', async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    // getProfileByAccountId -> pool.query returns profile with Profile_last_updated
    mockedPool.query.mockResolvedValueOnce([[{
      Account_id: 2,
      Profile_id: 5,
      FirstName: 'A',
      LastName: 'B',
      Profile_last_updated: tenDaysAgo,
      Username: 'olduser',
      account_password: 'hashed'
    }]]);

    await expect(updateProfile(2, { firstName: 'New' })).rejects.toMatchObject({
      code: 'TOO_EARLY'
    });
  });

  it('allows update when no last update or older than 15 days', async () => {
    // first call returns profile with null last_updated
    const initialProfile = [{
      Account_id: 3,
      Profile_id: 6,
      Profile_last_updated: null,
      Username: 'user'
    }];

    // after update, service calls pool.query again to return fresh profile
    const updatedProfile = [{
      Account_id: 3,
      Profile_id: 6,
      Profile_last_updated: new Date().toISOString(),
      Username: 'newuser',
      FirstName: 'X'
    }];

    // queue both responses in order
    mockedPool.query
      .mockResolvedValueOnce([initialProfile])
      .mockResolvedValueOnce([updatedProfile]);

    // mock a connection with transaction methods
    const conn = {
      beginTransaction: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    mockedPool.getConnection.mockResolvedValue(conn);

    await expect(updateProfile(3, { firstName: 'X', username: 'newuser' })).resolves.toBeTruthy();
  });
});