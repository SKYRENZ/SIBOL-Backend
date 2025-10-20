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
import { isAdmin } from '../middleware/isAdmin';

const router = Router();

// GET /admin/accounts  (no per-route isAdmin here; global middleware on mount covers it)
router.get('/accounts', listUsers);
router.put('/:accountId', updateUser);
router.patch('/:accountId/active', toggleActive);

// POST /admin/create
router.post('/create', isAdmin, createUser);
// ✅ NEW: Pending accounts management (only email verified users)
router.get('/pending-accounts', isAdmin, getPendingAccounts);
router.get('/pending-accounts/:pendingId', isAdmin, getPendingAccountById);
router.post('/pending-accounts/:pendingId/approve',  approveAccount);
router.post('/pending-accounts/:pendingId/reject', isAdmin, rejectAccount);
router.get('/roles', isAdmin, getRoles);
// ✅ Existing routes
router.post('/create', isAdmin, createUser);
router.put('/:accountId', isAdmin, updateUser);
router.patch('/:accountId/active', isAdmin, toggleActive);

export default router;