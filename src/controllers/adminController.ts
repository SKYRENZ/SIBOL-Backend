import type { Request, Response } from 'express';
import * as adminService from '../services/adminService';

// ✅ NEW: Get all pending accounts (email verified only)
export async function getPendingAccounts(req: Request, res: Response) {
  try {
    const result = await adminService.getPendingAccounts();
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ NEW: Get pending account by ID
export async function getPendingAccountById(req: Request, res: Response) {
  try {
    const { pendingId } = req.params;
    
    if (!pendingId) {
      return res.status(400).json({ 
        success: false, 
        error: "Pending ID is required" 
      });
    }

    const result = await adminService.getPendingAccountById(parseInt(pendingId));
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ NEW: Approve pending account
export async function approveAccount(req: Request, res: Response) {
  try {
    const { pendingId } = req.params;
    
    if (!pendingId) {
      return res.status(400).json({ 
        success: false, 
        error: "Pending ID is required" 
      });
    }

    const result = await adminService.approveAccount(parseInt(pendingId));
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ NEW: Reject pending account
export async function rejectAccount(req: Request, res: Response) {
  try {
    const { pendingId } = req.params;
    const reason = req.body?.reason || undefined;
    
    if (!pendingId) {
      return res.status(400).json({ 
        success: false, 
        error: "Pending ID is required" 
      });
    }

    const result = await adminService.rejectAccount(parseInt(pendingId), reason);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ UPDATED: Removed contact parameter from createUser
export async function createUser(req: Request, res: Response) {
    try {
        // Removed contact from destructuring
        const { firstName, lastName, areaId, email, roleId } = req.body;
        
        // Removed contact parameter
        const result = await adminService.createUserAsAdmin(firstName, lastName, Number(areaId), email, Number(roleId));
        return res.status(201).json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Create user failed';
        return res.status(400).json({ message });
    }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    const updates = req.body;
    const updated = await adminService.updateAccountAndProfile(accountId, updates);
    return res.status(200).json({ success: true, user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return res.status(400).json({ message });
  }
}

export async function toggleActive(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    const { isActive } = req.body;
    if (isActive === undefined) return res.status(400).json({ message: 'isActive required' });

    const updated = await adminService.setAccountActive(accountId, isActive ? 1 : 0);
    return res.status(200).json({ success: true, account: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Toggle active failed';
    return res.status(400).json({ message });
  }
}