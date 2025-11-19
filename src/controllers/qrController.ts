import { Request, Response } from 'express';
import { awardPointsForAccount } from '../services/qrService';

// POST /qr/scan
export async function scanQr(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        if (!user?.Account_id) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { qr, weight } = req.body as { qr?: string; weight?: number };
        if (!qr || typeof qr !== 'string') {
            return res.status(400).json({ message: 'Missing or invalid qr' });
        }
        if (weight == null || !Number.isFinite(weight) || weight <= 0) {
            return res.status(400).json({ message: 'Missing or invalid weight (positive number expected)' });
        }

        const accountId = Number(user.Account_id);
        
        // ✅ Pass qrCode to the service function
        const { awarded, totalPoints } = await awardPointsForAccount(accountId, Number(weight), qr);

        return res.status(200).json({
            message: 'Scan processed',
            awarded,
            totalPoints,
            accountId,
        });
    } catch (err: any) {
        console.error('scanQr error', err);
        
        // ✅ Handle duplicate QR error specifically
        if (err.message === 'QR_ALREADY_SCANNED') {
            return res.status(400).json({ 
                message: 'QR code already scanned',
                error: 'This QR code has already been used'
            });
        }
        
        return res.status(500).json({ message: 'Internal server error' });
    }
}