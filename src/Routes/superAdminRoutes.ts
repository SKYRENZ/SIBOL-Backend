import { Router } from 'express';
import { isSuperAdmin } from '../middleware/isSuperAdmin';
import {
    createAdmin,
    getUsersByBarangay,
    getBarangays,
    listAdmins,
    updateAdmin,
    toggleAdminActive,
    getRoles,
    getModules,
} from '../controllers/superAdminController';

const router = Router();

// All routes are protected by authenticate (applied at mount) + isSuperAdmin

// Create a new admin assigned to a barangay
router.post('/create-admin', isSuperAdmin, createAdmin);

// Admin user management (SuperAdmin only)
router.get('/admins', isSuperAdmin, listAdmins);
router.put('/admins/:accountId', isSuperAdmin, updateAdmin);
router.patch('/admins/:accountId/active', isSuperAdmin, toggleAdminActive);

// Roles / Modules for superadmin management
router.get('/roles', isSuperAdmin, getRoles);
router.get('/modules', isSuperAdmin, getModules);

// Get all users in a specific barangay
router.get('/users-by-barangay', isSuperAdmin, getUsersByBarangay);

// Get all barangays (for dropdown)
router.get('/barangays', isSuperAdmin, getBarangays);

export default router;
