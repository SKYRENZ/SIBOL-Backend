import { validateUser } from '../services/authService';

describe('validateUser', () => {
  it('should return user for valid credentials', async () => {
    const user = await validateUser('sibol_bcrypt', 'SIBOL12345');
    expect(user).toBeDefined();
    expect(user.Username).toBe('sibol_bcrypt');
  });

  it('should return null for invalid credentials', async () => {
    const user = await validateUser('sibol_bcrypt', 'wrongpassword');
    expect(user).toBeNull();
  });
});