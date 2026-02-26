import type { Request, Response } from 'express';
import * as superAdminService from '../services/superAdminService';

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
