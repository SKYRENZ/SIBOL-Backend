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

// User listing / management
router.get('/accounts', isAdmin, listUsers);
router.put('/:accountId', isAdmin, updateUser);
router.patch('/:accountId/active', isAdmin, toggleActive);

// Create user (admin only)
router.post('/create', isAdmin, createUser);

// Pending accounts management (admin only)
router.get('/pending-accounts', isAdmin, getPendingAccounts);
router.get('/pending-accounts/:pendingId', isAdmin, getPendingAccountById);
router.post('/pending-accounts/:pendingId/approve', isAdmin, approveAccount);
router.post('/pending-accounts/:pendingId/reject', isAdmin, rejectAccount);

// Roles
router.get('/roles', isAdmin, getRoles);

export default router;