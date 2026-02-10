import db from '../config/db';
import * as conversionService from './conversionService';
import { createSnapshot } from './leaderboardService'; // <-- new import
import type { ResultSetHeader } from 'mysql2/promise';

const DEBUG_QR_SCAN = process.env.DEBUG_QR_SCAN === 'true' || process.env.NODE_ENV !== 'production';

function summarizeImage(dataUrl?: string | null) {
    if (!dataUrl || typeof dataUrl !== 'string') return { hasImage: false, length: 0, mime: null };
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i);
    return { hasImage: true, length: dataUrl.length, mime: mimeMatch?.[1] ?? null };
}

export async function getAccountIdByQr(qr: string): Promise<number | null> {
    const [rows]: any = await db.execute(
        'SELECT Account_id FROM profile_tbl WHERE QR_code = ? LIMIT 1',
        [qr]
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].Account_id ?? null;
}

export async function isQRAlreadyScanned(qrCode: string): Promise<boolean> {
    const [rows]: any = await db.execute(
        `SELECT COUNT(*) as count 
         FROM household_wasteinput_tbl 
         WHERE QR_code = ? AND IsUsed = 1`,
        [qrCode]
    );
    return (Array.isArray(rows) && rows[0]) ? rows[0].count > 0 : false;
}

export async function recordQRScan(
    qrCode: string, 
    accountId: number, 
    weight: number, 
    pointsAwarded: number,
    qrImage?: string | null
): Promise<number> {
    const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO household_wasteinput_tbl (QR_code, Account_id, Weight, Points_awarded, QR_image, IsUsed, Scanned_at) 
         VALUES (?, ?, ?, ?, ?, 1, NOW())`,
        [qrCode, accountId, weight, pointsAwarded, qrImage ?? null]
    );

    // increment aggregate total for leaderboard
    await db.execute(
      `INSERT INTO account_waste_totals_tbl (Account_id, Total_kg, Updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE Total_kg = Total_kg + VALUES(Total_kg), Updated_at = NOW()`,
      [accountId, weight]
    );

        return result.insertId;
}

export async function recordWeightReading(
    deviceId: string,
    weight: number,
    qrImage?: string | null
): Promise<number> {
    const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO weight_sensor_tbl (device_id, weight, qr_image, created_at)
         VALUES (?, ?, ?, NOW())`,
        [deviceId, weight, qrImage ?? null]
    );

    return result.insertId;
}

export async function getLatestWeightByDeviceId(deviceId: string): Promise<number | null> {
    const [rows]: any = await db.execute(
        `SELECT weight
         FROM weight_sensor_tbl
         WHERE device_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [deviceId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].weight) : null;
}

export async function addPointsToAccount(accountId: number, points: number): Promise<number> {
    await db.execute(
        'UPDATE accounts_tbl SET Points = COALESCE(Points,0) + ? WHERE Account_id = ?',
        [points, accountId]
    );
    const [rows]: any = await db.execute(
        'SELECT Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
        [accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].Points) : 0;
}

export async function awardPointsForAccount(
        accountId: number,
        qrCode: string,
        qrImage?: string | null,
        deviceId?: string | null,
        weight?: number | null
) {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (DEBUG_QR_SCAN) {
        console.log('[qr scan svc] start', {
            requestId,
            accountId,
            qrCode,
            deviceId,
            hasWeight: weight != null,
            weight,
            qrImage: summarizeImage(qrImage),
        });
    }

    const alreadyScanned = await isQRAlreadyScanned(qrCode);
    if (alreadyScanned) {
        if (DEBUG_QR_SCAN) console.warn('[qr scan svc] already scanned', { requestId, accountId, qrCode });
        throw new Error('QR_ALREADY_SCANNED');
    }

    const resolvedDeviceId = (deviceId && String(deviceId).trim()) ? String(deviceId).trim() : qrCode;
    let resolvedWeight = weight ?? null;
    let weightSource: 'request' | 'latest_by_device' | 'none' = resolvedWeight != null ? 'request' : 'none';
    if (resolvedWeight == null) {
        resolvedWeight = await getLatestWeightByDeviceId(resolvedDeviceId);
        weightSource = resolvedWeight != null ? 'latest_by_device' : 'none';
    }
    if (resolvedWeight == null || !Number.isFinite(resolvedWeight) || resolvedWeight <= 0) {
        if (DEBUG_QR_SCAN) {
            console.warn('[qr scan svc] no weight data', {
                requestId,
                accountId,
                qrCode,
                resolvedDeviceId,
                weightSource,
                resolvedWeight,
            });
        }
        throw new Error('NO_WEIGHT_DATA');
    }

    if (DEBUG_QR_SCAN) {
        console.log('[qr scan svc] resolved weight', {
            requestId,
            accountId,
            qrCode,
            resolvedDeviceId,
            weightSource,
            resolvedWeight,
        });
    }

        const pointsPerKg = await conversionService.getPointsPerKg();
        const awarded = conversionService.calculatePointsFromWeight(resolvedWeight, pointsPerKg);

        if (DEBUG_QR_SCAN) {
            console.log('[qr scan svc] points', {
                requestId,
                accountId,
                pointsPerKg,
                awarded,
            });
        }

        if (awarded <= 0) {
                if (DEBUG_QR_SCAN) console.log('[qr scan svc] awarded <= 0; skipping', { requestId, accountId, awarded });
                return { awarded: 0, totalPoints: await getCurrentPoints(accountId) };
        }

        // create a snapshot BEFORE applying the new scan so it becomes the "previous" snapshot
        try {
            await createSnapshot();
        } catch (err) {
            console.error('createSnapshot failed', err);
            // do not fail the scan flow if snapshot fails
        }

    let weightSensorInsertId: number | null = null;
    try {
        weightSensorInsertId = await recordWeightReading(resolvedDeviceId, resolvedWeight, qrImage);
        if (DEBUG_QR_SCAN) {
            console.log('[qr scan svc] weight row inserted', { requestId, accountId, weightSensorInsertId });
        }
    } catch (err: any) {
        console.error('[qr scan svc] weight insert failed', {
            requestId,
            accountId,
            message: err?.message,
            code: err?.code,
        });
        // continue scan flow even if weight insert fails
    }

    const wasteInputInsertId = await recordQRScan(qrCode, accountId, resolvedWeight, awarded, qrImage);
    const totalPoints = await addPointsToAccount(accountId, awarded);

    if (DEBUG_QR_SCAN) {
        console.log('[qr scan svc] done', {
            requestId,
            accountId,
            qrCode,
            resolvedDeviceId,
            resolvedWeight,
            awarded,
            totalPoints,
            weightSensorInsertId,
            wasteInputInsertId,
        });
    }

    return { awarded, totalPoints, usedWeight: resolvedWeight, weightSensorInsertId, wasteInputInsertId };
}

async function getCurrentPoints(accountId: number): Promise<number> {
    const [rows]: any = await db.execute(
        'SELECT Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
        [accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].Points) : 0;
}