import type { Request, Response } from 'express';
import * as adminService from '../services/adminService';
import { fetchAllModules } from '../services/moduleService.js'; // add this import if not present
import { pool } from '../config/db.js';
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
    const { FirstName: firstName, LastName: lastName, Barangay_id: barangayId, Email: email, Roles: roleId, Username, Password, Access } = req.body;  // Changed Area_id to Barangay_id

    if (!firstName || !lastName || !barangayId || !email || !roleId || !Password) {  // Changed areaId to barangayId
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Hash the password before passing to service
    const hashedPassword = await bcrypt.hash(Password, 10);

    const result = await adminService.createUserAsAdmin(firstName, lastName, Number(barangayId), email, Number(roleId), hashedPassword);  // Changed areaId to barangayId
    if (!result.success) {
      throw new Error(result.message || 'Failed to create user');
    }

    const user = result.user;

    // Handle Access (convert to User_modules)
    if (Access) {
      const modules: any[] = await fetchAllModules();

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

// NEW: Controller for fetching modules
export async function getModules(req: Request, res: Response) {
  try {
    // moduleService returns Module_id, Name, Path from modules_tbl
    const rows: any[] = await fetchAllModules();
    const normalized = (rows || []).map(m => ({
      Module_id: m.Module_id ?? m.id ?? 0,
      Module_name: m.Name ?? m.Module_name ?? m.name ?? '',
      Path: m.Path ?? m.path ?? null,
    }));
    return res.json(normalized);
  } catch (err: any) {
    console.error('Get modules error:', err);
    return res.status(500).json({ message: 'Failed to load modules', error: err?.message ?? err });
  }
}

// UPDATED: updateUser - Only process role and access (no username/password)
export async function updateUser(req: Request, res: Response) {
  try {
    const { accountId } = req.params;
    const updates: any = req.body;
    // Remove any username/password from updates (defensive)
    delete updates.Username;
    delete updates.Password;

    // Handle Access array -> User_modules CSV (unchanged)
    if (updates.Access && Array.isArray(updates.Access)) {
      const modules = await adminService.getModules();  // FIXED: Use getModules instead of getRoles
      console.log('modules', modules);
      const moduleIds = updates.Access.map((name: string) => {
        const mod = modules.find((m: any) => m.Module_name === name);  // FIXED: Match against Module_name, return Module_id
        return mod ? mod.Module_id : null;
      }).filter(Boolean);
      updates.User_modules = moduleIds.join(',');
      delete updates.Access;
    }

    console.log('final updates', updates);
    const result = await adminService.updateUser(Number(accountId), updates);
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
    // optional filters from querystring
    const roleFilter = req.query.role ? Number(req.query.role) : undefined;
    const isActiveFilter = typeof req.query.isActive !== 'undefined' ? (String(req.query.isActive) === '1' || String(req.query.isActive) === 'true') : undefined;

    // service returns { success, users, count } — forward filters to keep results up-to-date
    const rawAccounts: any = await adminService.getAllUsers(roleFilter, isActiveFilter);
    const accounts: any[] = rawAccounts?.users ?? rawAccounts?.rows ?? rawAccounts ?? [];

    // always fetch latest modules for name resolution
    const modules: any[] = await fetchAllModules();

    // build id -> displayName map (normalize possible keys)
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

// NEW: Controller for fetching barangays
export async function getBarangays(req: Request, res: Response) {
  try {
    console.log('Fetching barangays from database...');  // NEW: Debug log
    const result = await adminService.getBarangays();
    console.log('Barangays fetched:', result);  // NEW: Debug log for result
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getBarangays controller:', error);  // Enhanced error log
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}