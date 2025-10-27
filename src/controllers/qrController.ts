import { Request, Response } from 'express';
import { processQrScan } from '../services/qrService';

// POST /qr/scan
export async function scanQr(req: Request, res: Response) {
    try {
        const { qr, weight } = req.body as { qr?: string; weight?: number };

        if (!qr || typeof qr !== 'string') {
            return res.status(400).json({ message: 'Missing or invalid qr' });
        }
        if (weight == null || !Number.isInteger(weight) || weight < 0) {
            return res.status(400).json({ message: 'Missing or invalid weight (integer kg expected)' });
        }

        const result = await processQrScan(qr, weight);
        if (!result.found) return res.status(404).json({ message: 'QR not linked to any account' });

        return res.status(200).json({
            message: 'Scan processed',
            awarded: result.awarded,
            totalPoints: result.totalPoints,
            accountId: result.accountId ?? null
        });
    } catch (err) {
        console.error('scanQr error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}