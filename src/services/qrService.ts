import db from '../config/db';
import * as conversionService from './conversionService';

export function calculatePointsFromWeight(weight: number): number {
    // conversion: 2 kg -> 10 points => 5 points per kg
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    return Math.floor(weight * 5);
}

export async function getAccountIdByQr(qr: string): Promise<number | null> {
    const [rows]: any = await db.execute(
        'SELECT Account_id FROM profile_tbl WHERE QR_code = ? LIMIT 1',
        [qr]
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].Account_id ?? null;
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

/**
 * High-level operation for scanning QR and awarding points.
 * Returns { awarded, totalPoints, accountId } or throws on error / not found.
 */
export async function processQrScan(qr: string, weight: number) {
    const accountId = await getAccountIdByQr(qr);
    if (!accountId) return { found: false };

    const pointsPerKg = await conversionService.getPointsPerKg();
    const awarded = conversionService.calculatePointsFromWeight(weight, pointsPerKg);

    if (awarded <= 0) {
        const total = await getCurrentPoints(accountId);
        return { found: true, awarded: 0, totalPoints: total, accountId };
    }

    const totalPoints = await addPointsToAccount(accountId, awarded);
    return { found: true, awarded, totalPoints, accountId };
}

async function getCurrentPoints(accountId: number): Promise<number> {
    const [rows]: any = await db.execute(
        'SELECT Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
        [accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].Points) : 0;
}