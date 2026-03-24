import type { Request, Response } from 'express';
import * as superAdminService from '../services/superAdminService';
import { fetchAllModules } from '../services/moduleService.js';

/**
 * POST /api/superadmin/create-admin
 * Create a new admin and assign them to a barangay.
 * Body: { FirstName, LastName, Barangay_id, Email, Password? }
 */
export async function createAdmin(req: Request, res: Response) {
    try {
        const { FirstName, LastName, Barangay_id, Email, Password } = req.body;

        if (!FirstName || !LastName || !Barangay_id || !Email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: FirstName, LastName, Barangay_id, Email',
            });
        }

        const result = await superAdminService.createAdmin(
            FirstName,
            LastName,
            Number(Barangay_id),
            Email,
            Password || undefined
        );

        return res.status(201).json(result);
    } catch (error: any) {
        console.error('Create admin error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to create admin',
        });
    }
}

/**
 * GET /api/superadmin/users-by-barangay?barangayId=<id>
 * Get all users that belong to a specific barangay.
 */
export async function getUsersByBarangay(req: Request, res: Response) {
    try {
        const barangayId = req.query.barangayId ? Number(req.query.barangayId) : undefined;

        if (!barangayId || Number.isNaN(barangayId)) {
            return res.status(400).json({
                success: false,
                error: 'barangayId query parameter is required and must be a number',
            });
        }

        const result = await superAdminService.getUsersByBarangay(barangayId);
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Get users by barangay error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch users by barangay',
        });
    }
}

/**
 * GET /api/superadmin/barangays
 * Get all barangays for selection.
 */
export async function getBarangays(req: Request, res: Response) {
    try {
        const result = await superAdminService.getAllBarangays();
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Get barangays error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch barangays',
        });
    }
}

/**
 * GET /api/superadmin/admins
 * List all admin accounts.
 */
export async function listAdmins(req: Request, res: Response) {
    try {
        const raw = await superAdminService.getAdminAccounts();
        const accounts: any[] = raw?.users ?? [];

        const modules: any[] = await fetchAllModules();
        const moduleMap = new Map<number, string>();
        (modules || []).forEach((m: any) => {
            const id = Number(m.Module_id ?? m.id ?? m.module_id ?? 0);
            const name = m.Name ?? m.Module_name ?? m.name ?? `Module ${id}`;
            if (id) moduleMap.set(id, name);
        });

        const normalized = (accounts || []).map((acct: any) => {
            const csv = acct.User_modules ?? '';
            const ids = String(csv || '')
                .split(',')
                .map((s: string) => Number(s.trim()))
                .filter((n: number) => !Number.isNaN(n) && n > 0);
            const Access = ids.map((id: number) => moduleMap.get(id)).filter(Boolean);
            return { ...acct, Access };
        });

        return res.status(200).json({ success: true, users: normalized, count: normalized.length });
    } catch (error: any) {
        console.error('List admins error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to list admins' });
    }
}

/**
 * PUT /api/superadmin/admins/:accountId
 * Update admin account (roles/modules/barangay).
 */
export async function updateAdmin(req: Request, res: Response) {
    try {
        const { accountId } = req.params;
        const updates: any = req.body;

        delete updates.Username;
        delete updates.Password;

        if (updates.Access && Array.isArray(updates.Access)) {
            const modules = await fetchAllModules();
            const moduleIds = updates.Access.map((name: string) => {
                const mod = modules.find((m: any) => m.Name === name || m.Module_name === name);
                return mod ? (mod.Module_id ?? mod.id ?? mod.module_id) : null;
            }).filter(Boolean);
            updates.User_modules = moduleIds.join(',');
            delete updates.Access;
        }

        const result = await superAdminService.updateAdminAccount(Number(accountId), updates);
        return res.status(200).json({ success: true, user: result?.user ?? result });
    } catch (error: any) {
        console.error('Update admin error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to update admin' });
    }
}

/**
 * PATCH /api/superadmin/admins/:accountId/active
 * Toggle admin active status.
 */
export async function toggleAdminActive(req: Request, res: Response) {
    try {
        const accountId = Number(req.params.accountId);
        const { isActive } = req.body;
        if (isActive === undefined) {
            return res.status(400).json({ success: false, error: 'isActive required' });
        }

        const updated = await superAdminService.setAdminActive(accountId, isActive ? 1 : 0);
        return res.status(200).json({ success: true, account: updated });
    } catch (error: any) {
        console.error('Toggle admin error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to toggle admin' });
    }
}

/**
 * GET /api/superadmin/roles
 */
export async function getRoles(req: Request, res: Response) {
    try {
        const result = await superAdminService.getRoles();
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Get roles error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to fetch roles' });
    }
}

/**
 * GET /api/superadmin/modules
 */
export async function getModules(req: Request, res: Response) {
    try {
        const result = await superAdminService.getModules();
        const rows: any[] = (result as any)?.modules ?? (result as any)?.data ?? (result as any) ?? [];
        const normalized = (rows || []).map(m => ({
            Module_id: m.Module_id ?? m.id ?? 0,
            Module_name: m.Name ?? m.Module_name ?? m.name ?? '',
            Path: m.Path ?? m.path ?? null,
        }));
        return res.status(200).json({ success: true, modules: normalized });
    } catch (error: any) {
        console.error('Get modules error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to fetch modules' });
    }
}

/**
 * GET /api/superadmin/barangays/available
 * Get all available barangay IDs (1-1000) that haven't been activated yet.
 */
export async function getAvailableBarangays(req: Request, res: Response) {
    try {
        const result = await superAdminService.getAvailableBarangays();
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Get available barangays error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch available barangays',
        });
    }
}

/**
 * GET /api/superadmin/barangays/inactive
 * Get all inactive barangays.
 */
export async function getInactiveBarangays(req: Request, res: Response) {
    try {
        const result = await superAdminService.getInactiveBarangays();
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Get inactive barangays error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch inactive barangays',
        });
    }
}

/**
 * POST /api/superadmin/barangays/:barangayId/activate
 * Activate a barangay by adding it to the database.
 */
export async function activateBarangay(req: Request, res: Response) {
    try {
        const barangayId = Number(req.params.barangayId);

        if (!Number.isInteger(barangayId) || barangayId < 1 || barangayId > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Barangay ID must be an integer between 1 and 1000',
            });
        }

        const result = await superAdminService.activateBarangay(barangayId);
        return res.status(201).json(result);
    } catch (error: any) {
        console.error('Activate barangay error:', error);

        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to activate barangay',
        });
    }
}

/**
 * PATCH /api/superadmin/barangays/:barangayId/deactivate
 * Deactivate a barangay and cascade deactivate all assigned admins.
 */
export async function deactivateBarangay(req: Request, res: Response) {
    try {
        const barangayId = Number(req.params.barangayId);

        if (!Number.isInteger(barangayId) || barangayId < 1 || barangayId > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Barangay ID must be an integer between 1 and 1000',
            });
        }

        const result = await superAdminService.deactivateBarangay(barangayId);
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Deactivate barangay error:', error);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to deactivate barangay',
        });
    }
}
