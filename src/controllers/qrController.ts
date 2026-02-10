import { Request, Response } from 'express';
import { awardPointsForAccount } from '../services/qrService';

const DEBUG_QR_SCAN = process.env.DEBUG_QR_SCAN === 'true' || process.env.NODE_ENV !== 'production';

function summarizeDataUrlImage(dataUrl?: string) {
    if (!dataUrl || typeof dataUrl !== 'string') return { hasImage: false, length: 0, mime: null };
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i);
    return { hasImage: true, length: dataUrl.length, mime: mimeMatch?.[1] ?? null };
}

// POST /qr/scan
export async function scanQr(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        if (!user?.Account_id) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { qr, weight, qrImage, deviceId } = req.body as { qr?: string; weight?: number; qrImage?: string; deviceId?: string };

        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const accountId = Number(user.Account_id);
        if (DEBUG_QR_SCAN) {
            console.log('[qr scan] request start', {
                requestId,
                accountId,
                qr,
                deviceId,
                hasWeight: weight != null,
                weight,
                qrImage: summarizeDataUrlImage(qrImage),
                origin: req.headers.origin ?? null,
                clientType: (req.headers['x-client-type'] as string) ?? null,
                userAgent: req.headers['user-agent'] ?? null,
            });
        }

        if (!qr || typeof qr !== 'string') {
            if (DEBUG_QR_SCAN) console.warn('[qr scan] invalid qr', { requestId, accountId, qr });
            return res.status(400).json({ message: 'Missing or invalid qr' });
        }
        if (weight != null && (!Number.isFinite(weight) || weight <= 0)) {
            if (DEBUG_QR_SCAN) console.warn('[qr scan] invalid weight', { requestId, accountId, weight });
            return res.status(400).json({ message: 'Invalid weight (positive number expected)' });
        }
        if (!qrImage || typeof qrImage !== 'string') {
            if (DEBUG_QR_SCAN) console.warn('[qr scan] missing qrImage', { requestId, accountId, qrImageType: typeof qrImage });
            return res.status(400).json({ message: 'Missing or invalid qrImage' });
        }
        
        // ✅ Pass qrCode to the service function
        const { awarded, totalPoints, usedWeight, weightSensorInsertId, wasteInputInsertId } = await awardPointsForAccount(
            accountId,
            qr,
            qrImage,
            deviceId,
            weight
        );

        if (DEBUG_QR_SCAN) {
            console.log('[qr scan] request success', {
                requestId,
                accountId,
                awarded,
                totalPoints,
                usedWeight,
            });
        }

        return res.status(200).json({
            message: 'Scan processed',
            awarded,
            totalPoints,
            weight: usedWeight,
            weightSensorInsertId,
            wasteInputInsertId,
            accountId,
        });
    } catch (err: any) {
        console.error('scanQr error', {
            message: err?.message,
            status: err?.status,
            payload: err?.payload,
            stack: err?.stack,
        });
        
        // ✅ Handle duplicate QR error specifically
        if (err.message === 'QR_ALREADY_SCANNED') {
            return res.status(400).json({ 
                message: 'QR code already scanned',
                error: 'This QR code has already been used'
            });
        }
        if (err.message === 'NO_WEIGHT_DATA') {
            return res.status(400).json({
                message: 'No weight data available for this device',
                error: 'No recent weight reading found'
            });
        }

        // DB packet too large / max_allowed_packet
        if (
            err?.code === 'ER_NET_PACKET_TOO_LARGE' ||
            err?.errno === 1153 ||
            String(err?.message || '').toLowerCase().includes('packet too large') ||
            String(err?.message || '').toLowerCase().includes('max_allowed_packet')
        ) {
            return res.status(413).json({
                message: 'QR image too large for database',
                error: 'Image payload exceeds DB packet limit. Reduce capture quality/size.',
            });
        }

        // In development, surface the actual error message to speed up debugging
        if (process.env.NODE_ENV !== 'production') {
            return res.status(500).json({
                message: 'Internal server error',
                error: err?.message ?? String(err),
                code: err?.code ?? null,
            });
        }
        
        return res.status(500).json({ message: 'Internal server error' });
    }
}