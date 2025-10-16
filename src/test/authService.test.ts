import db from '../config/db';
import { validateUser, registerUser } from '../services/authService';

const TEST_FIRSTNAME = 'Test';
const TEST_LASTNAME = 'User' + Date.now();
const TEST_AREAID = 1;
const TEST_CONTACT = '09123456789';
const TEST_EMAIL = `testuser${Date.now()}@example.com`;
const TEST_ROLEID = 1;
const TEST_PASSWORD = 'SIBOL12345'; // Default password in registerUser
const TEST_USERNAME = `${TEST_FIRSTNAME}.${TEST_LASTNAME}`.toLowerCase();

beforeAll(async () => {
  // Register test user
  await registerUser(
    TEST_FIRSTNAME,
    TEST_LASTNAME,
    TEST_AREAID,
    TEST_CONTACT,
    TEST_EMAIL,
    TEST_ROLEID
  );
});

afterAll(async () => {
  // Remove test user from accounts_tbl and profile_tbl
  await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [TEST_EMAIL]);
  await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [TEST_USERNAME]);
  await db.end();
});

describe('User Registration and Login', () => {
  it('should return user for valid credentials after registration', async () => {
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
  });

  it('should return null for invalid credentials', async () => {
    const user = await validateUser(TEST_USERNAME, 'wrongpassword');
    expect(user).toBeNull();
  });
});


