/**
 * Mock the service before requiring the controller so the controller loads the mocked service.
 */
jest.mock('../services/moduleService', () => ({
  fetchAllModules: jest.fn(),
  fetchAllowedModulesForAccount: jest.fn(),
}));

const moduleService = require('../services/moduleService');
const { getAllowedModules, getAllModules } = require('../controllers/moduleController');

describe('moduleController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('getAllowedModules - returns modules when service provides them', async () => {
    const req: any = { user: { Account_id: 1, User_modules: '1,3' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const expectedRows = [
      { Module_id: 1, Name: 'Dashboard', Path: '/dashboard' },
      { Module_id: 3, Name: 'Maintenance', Path: '/maintenance' },
    ];

    moduleService.fetchAllowedModulesForAccount.mockResolvedValueOnce(expectedRows);

    await getAllowedModules(req, res);

    expect(moduleService.fetchAllowedModulesForAccount).toHaveBeenCalledWith(req.user);
    expect(res.json).toHaveBeenCalledWith(expectedRows);
  });

  test('getAllowedModules - returns 401 when not authenticated', async () => {
    const req: any = { user: null };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await getAllowedModules(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authenticated' }));
  });

  test('getAllModules - returns all modules via service', async () => {
    const req: any = {};
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const all = [
      { Module_id: 1, Name: 'Dashboard', Path: '/dashboard' },
      { Module_id: 2, Name: 'SIBOL Machines', Path: '/sibol-machines' },
    ];

    moduleService.fetchAllModules.mockResolvedValueOnce(all);

    await getAllModules(req, res);

    expect(moduleService.fetchAllModules).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(all);
  });
});