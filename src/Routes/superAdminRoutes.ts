import { Router } from 'express';
import { isSuperAdmin } from '../middleware/isSuperAdmin';
import {
    createAdmin,
    getUsersByBarangay,
    getBarangays,
} from '../controllers/superAdminController';

const router = Router();

// All routes are protected by authenticate (applied at mount) + isSuperAdmin

// Create a new admin assigned to a barangay
router.post('/create-admin', isSuperAdmin, createAdmin);

// Get all users in a specific barangay
router.get('/users-by-barangay', isSuperAdmin, getUsersByBarangay);

// Get all barangays (for dropdown)
router.get('/barangays', isSuperAdmin, getBarangays);

export default router;
