import type { Request, Response } from 'express';
import * as adminService from '../services/adminService';
import { fetchAllModules } from '../services/moduleService';
import pool from '../config/db';  // Add this import
import bcrypt from 'bcrypt';  // Add this import for password hashing

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
    // Destructure with frontend keys (use renaming for consistency)
    const { FirstName: firstName, LastName: lastName, Area_id: areaId, Email: email, Roles: roleId, Username, Password, Access } = req.body;

    if (!firstName || !lastName || !areaId || !email || !roleId || !Password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Hash the password before passing to service
    const hashedPassword = await bcrypt.hash(Password, 10);

    const result = await adminService.createUserAsAdmin(firstName, lastName, Number(areaId), email, Number(roleId), hashedPassword);
    if (!result.success) {
      throw new Error(result.message || 'Failed to create user');
    }

    const user = result.user;

    // Handle Access (convert to User_modules)
    if (Access) {
      const rawModules: any = await fetchAllModules();
      const modules: any[] = rawModules?.rows ?? rawModules ?? [];

      const lookup = new Map<string, number>();
      modules.forEach((m: any) => {
        const id = Number(m.Module_id ?? m.id ?? m.module_id ?? 0);
        if (!id) return;
        const name = String(m.Name ?? m.Module_name ?? m.name ?? '').trim();
        const path = String(m.Path ?? m.path ?? '').trim();
        if (name) lookup.set(name.toLowerCase(), id);
        if (path) lookup.set(path.toLowerCase(), id);
        lookup.set(String(id), id);
      });

      const items = Array.isArray(Access) ? Access : [Access];
      const ids = new Set<number>();
      items.forEach((it: any) => {
        if (it == null) return;
        if (typeof it === 'number') ids.add(it);
        else {
          const s = String(it).trim();
          const n = Number(s);
          if (!Number.isNaN(n) && n > 0) {
            ids.add(n);
          } else {
            const found = lookup.get(s.toLowerCase());
            if (found) ids.add(found);
          }
        }
      });

      const userModules = Array.from(ids).join(',');
      await pool.execute("UPDATE accounts_tbl SET User_modules = ? WHERE Account_id = ?", [userModules, user.Account_id]);
    }

    return res.status(201).json({ message: 'User created successfully', user });
  } catch (err) {
    console.error('Create user error:', err);  // Log full error for debugging
    return res.status(500).json({ error: 'Failed to create user', details: err instanceof Error ? err.message : 'Unknown error' });  // Include details in dev mode
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const { accountId } = req.params;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });

    const updates: any = { ...(req.body ?? {}) };
    console.log('updateUser - Incoming req.body:', req.body);  // Log raw request body
    console.log('updateUser - Initial updates:', updates);     // Log initial updates object

    // Hash the password if provided (for edit mode)
    if (updates.Password) {
      updates.Password = await bcrypt.hash(updates.Password, 10);
    }

    // If frontend sent Access (array of module names or ids), convert to CSV of module IDs
    if (updates.Access) {
      console.log('updateUser - Access array received:', updates.Access);  // Log Access array
      const rawModules: any = await fetchAllModules();
      const modules: any[] = rawModules?.rows ?? rawModules ?? [];
      console.log('updateUser - Fetched modules:', modules);  // Log fetched modules

      // build name/path/id -> id map (case-insensitive for names/paths)
      const lookup = new Map<string, number>();
      modules.forEach((m: any) => {
        const id = Number(m.Module_id ?? m.id ?? m.module_id ?? 0);
        if (!id) return;
        const name = String(m.Name ?? m.Module_name ?? m.name ?? '').trim();
        const path = String(m.Path ?? m.path ?? '').trim();
        if (name) lookup.set(name.toLowerCase(), id);
        if (path) lookup.set(path.toLowerCase(), id);
        lookup.set(String(id), id);
      });
      console.log('updateUser - Lookup map:', Array.from(lookup.entries()));  // Log lookup map

      const items = Array.isArray(updates.Access) ? updates.Access : [updates.Access];
      const ids = new Set<number>();
      items.forEach((it: any) => {
        if (it == null) return;
        if (typeof it === 'number') ids.add(it);
        else {
          const s = String(it).trim();
          const n = Number(s);
          if (!Number.isNaN(n) && n > 0) {
            ids.add(n);
          } else {
            const found = lookup.get(s.toLowerCase());
            if (found) ids.add(found);
          }
        }
      });
      updates.User_modules = Array.from(ids).join(',');
      console.log('updateUser - Converted User_modules:', updates.User_modules);  // Log converted CSV
      delete updates.Access;
    }

    console.log('updateUser - Final updates to DB:', updates);  // Log what will be updated
    const result = await adminService.updateUser(Number(accountId), updates);
    console.log('updateUser - DB update result:', result);  // Log DB result
    res.json({ message: 'User updated successfully', result });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
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

export async function listUsers(req: Request, res: Response) {
  try {
    // use the correct service function which returns { success, users, count }
    const rawAccounts: any = await adminService.getAllUsers();
    const accounts: any[] = rawAccounts?.users ?? rawAccounts?.rows ?? rawAccounts ?? [];

    const rawModules: any = await fetchAllModules();
    const modules: any[] = rawModules?.rows ?? rawModules ?? [];

    // build id -> displayName map (normalize possible keys)
    const moduleMap = new Map<number, string>();
    (modules || []).forEach((m: any) => {
      const id = Number(m.Module_id ?? m.id ?? m.module_id ?? 0);
      const name = m.Name ?? m.Module_name ?? m.name ?? `Module ${id}`;
      if (id) moduleMap.set(id, name);
    });

    const normalized = (accounts || []).map((acct: any) => {
      const csv = acct.User_modules ?? acct.User_modules ?? '';
      const ids = String(csv || '')
        .split(',')
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => !Number.isNaN(n) && n > 0);
      const Access = ids.map((id: number) => moduleMap.get(id)).filter(Boolean);
      return { ...acct, Access };
    });

    return res.status(200).json({ rows: normalized });
  } catch (err: any) {
    console.error('listUsers error:', err);
    return res.status(500).json({ success: false, error: err?.message ?? 'Failed to list users' });
  }
}

// new: Get roles for admin UI
export async function getRoles(req: Request, res: Response) {
  try {
    const result = await adminService.getRoles();
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
}