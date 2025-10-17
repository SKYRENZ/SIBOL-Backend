import type { Request, Response } from 'express';
import * as authService from '../services/authService';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'changeme';

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

        // sign JWT and return token + user
        const payload = { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles };
        const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });

        return res.status(200).json({ user: { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles }, token });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        return res.status(500).json({ message });
    }
}