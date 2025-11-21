import db from '../config/db';
import * as conversionService from './conversionService';

export async function getAccountIdByQr(qr: string): Promise<number | null> {
    const [rows]: any = await db.execute(
        'SELECT Account_id FROM profile_tbl WHERE QR_code = ? LIMIT 1',
        [qr]
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].Account_id ?? null;
}

export async function isQRAlreadyScanned(qrCode: string, accountId: number): Promise<boolean> {
    const [rows]: any = await db.execute(
        `SELECT COUNT(*) as count 
         FROM qr_scans_tbl 
         WHERE QR_code = ? AND Account_id = ? AND IsUsed = 1`,
        [qrCode, accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? rows[0].count > 0 : false;
}

export async function recordQRScan(
    qrCode: string, 
    accountId: number, 
    weight: number, 
    pointsAwarded: number
): Promise<void> {
    await db.execute(
        `INSERT INTO qr_scans_tbl (QR_code, Account_id, Weight, Points_awarded, IsUsed, Scanned_at) 
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [qrCode, accountId, weight, pointsAwarded]
    );
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

export async function awardPointsForAccount(accountId: number, weight: number, qrCode: string) {
    const alreadyScanned = await isQRAlreadyScanned(qrCode, accountId);
    if (alreadyScanned) {
        throw new Error('QR_ALREADY_SCANNED');
    }

    const pointsPerKg = await conversionService.getPointsPerKg();
    const awarded = conversionService.calculatePointsFromWeight(weight, pointsPerKg);

    if (awarded <= 0) {
        return { awarded: 0, totalPoints: await getCurrentPoints(accountId) };
    }

    await recordQRScan(qrCode, accountId, weight, awarded);
    const totalPoints = await addPointsToAccount(accountId, awarded);
    
    return { awarded, totalPoints };
}

async function getCurrentPoints(accountId: number): Promise<number> {
    const [rows]: any = await db.execute(
        'SELECT Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
        [accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].Points) : 0;
}