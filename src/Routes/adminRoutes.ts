import { Router } from 'express';
import { createUser, updateUser, toggleActive } from '../controllers/adminController';
import { isAdmin } from '../middleware/isAdmin';

const router = Router();

// POST /admin/create
router.post('/create', isAdmin, createUser);

// PUT /admin/:accountId
router.put('/:accountId', isAdmin, updateUser);

// PATCH /admin/:accountId/active
router.patch('/:accountId/active', isAdmin, toggleActive);

export default router;