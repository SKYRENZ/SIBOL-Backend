import { Router } from 'express';
import { createUser, updateUser, toggleActive, listUsers } from '../controllers/adminController';
import { 
  createUser, 
  updateUser, 
  toggleActive,
  getPendingAccounts,
  getPendingAccountById,
  approveAccount,
  rejectAccount
} from '../controllers/adminController';
import { isAdmin } from '../middleware/isAdmin';

const router = Router();

// GET /admin/accounts
router.get('/accounts', isAdmin, listUsers);

// POST /admin/create
router.post('/create', isAdmin, createUser);
// ✅ NEW: Pending accounts management (only email verified users)
router.get('/pending-accounts', isAdmin, getPendingAccounts);
router.get('/pending-accounts/:pendingId', isAdmin, getPendingAccountById);
router.post('/pending-accounts/:pendingId/approve', isAdmin, approveAccount);
router.post('/pending-accounts/:pendingId/reject', isAdmin, rejectAccount);

// ✅ Existing routes
router.post('/create', isAdmin, createUser);
router.put('/:accountId', isAdmin, updateUser);
router.patch('/:accountId/active', isAdmin, toggleActive);

export default router;