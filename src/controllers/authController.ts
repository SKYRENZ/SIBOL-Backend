import type { Request, Response } from 'express';
import * as authService from '../services/authService';

export async function register(req: Request, res: Response) {
    try {
        const { firstName, lastName, areaId, contact, email, roleId } = req.body;
        const result = await authService.registerUser(firstName, lastName, areaId, contact, email, roleId);
        return res.status(201).json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        return res.status(400).json({ message });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'username and password required' });
        }
        const user = await authService.validateUser(username, password);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        return res.status(200).json({ user });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        return res.status(500).json({ message });
    }
}