import { Router } from 'express';
import { 
  createUser, 
  updateUser, 
  toggleActive,
  listUsers,
  getPendingAccounts,
  getPendingAccountById,
  approveAccount,
  rejectAccount,
  getRoles
} from '../controllers/adminController';

const router = Router();

// GET /admin/accounts  (no per-route isAdmin here; global middleware on mount covers it)
router.get('/accounts', listUsers);
router.put('/:accountId', updateUser);
router.patch('/:accountId/active', toggleActive);

// POST /admin/create
router.post('/create', createUser);
// Pending accounts management
router.get('/pending-accounts', getPendingAccounts);
router.get('/pending-accounts/:pendingId', getPendingAccountById);
router.post('/pending-accounts/:pendingId/approve', approveAccount);
router.post('/pending-accounts/:pendingId/reject', rejectAccount);
// GET /admin/roles
router.get('/roles', getRoles);

export default router;