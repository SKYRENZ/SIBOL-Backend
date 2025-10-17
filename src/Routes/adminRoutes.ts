import { Router } from 'express';
import { createUser, updateUser, toggleActive, listUsers } from '../controllers/adminController';
import { isAdmin } from '../middleware/isAdmin';

const router = Router();

// GET /admin/accounts
router.get('/accounts', isAdmin, listUsers);

// POST /admin/create
router.post('/create', isAdmin, createUser);

// PUT /admin/:accountId
router.put('/:accountId', isAdmin, updateUser);

// PATCH /admin/:accountId/active
router.patch('/:accountId/active', isAdmin, toggleActive);

export default router;