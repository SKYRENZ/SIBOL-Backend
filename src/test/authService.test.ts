import { db } from '../config/db';
import bcrypt from 'bcrypt';
import { validateUser } from '../services/authService';

const TEST_USERNAME = 'test_user_' + Date.now();
const TEST_PASSWORD = 'SIBOL12345';
let TEST_HASH = '';

beforeAll(async () => {
  // Generate bcrypt hash for the test password
  TEST_HASH = await bcrypt.hash(TEST_PASSWORD, 10);

  // Insert test user into the database
  await db.execute(
    'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, ?)',
    [TEST_USERNAME, TEST_HASH, 1, 1]
  );
});

afterAll(async () => {
  // Remove test user from the database
  await db.execute(
    'DELETE FROM accounts_tbl WHERE Username = ?',
    [TEST_USERNAME]
  );
  await db.end();
});

describe('validateUser', () => {
  it('should return user for valid credentials', async () => {
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
  });

  it('should return null for invalid credentials', async () => {
    const user = await validateUser(TEST_USERNAME, 'wrongpassword');
    expect(user).toBeNull();
  });
});