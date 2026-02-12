import db from '../config/db';
import * as conversionService from './conversionService';
import { createSnapshot } from './leaderboardService'; // <-- new import

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
    pointsAwarded: number
): Promise<void> {
    await db.execute(
        `INSERT INTO household_wasteinput_tbl (QR_code, Account_id, Weight, Points_Awarded, QR_image, IsUsed, Scanned_at) 
         VALUES (?, ?, ?, ?, NULL, 1, NOW())`,
        [qrCode, accountId, weight, pointsAwarded]
    );

    // increment aggregate total for leaderboard
        await db.execute(
            `INSERT INTO account_waste_totals_tbl (Account_id, Total_kg, Updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE Total_kg = Total_kg + VALUES(Total_kg), Updated_at = NOW()`,
            [accountId, weight]
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
    const alreadyScanned = await isQRAlreadyScanned(qrCode);
    if (alreadyScanned) {
        throw new Error('QR_ALREADY_SCANNED');
    }

    const pointsPerKg = await conversionService.getPointsPerKg();
    const awarded = conversionService.calculatePointsFromWeight(weight, pointsPerKg);

    if (awarded <= 0) {
        return { awarded: 0, totalPoints: await getCurrentPoints(accountId) };
    }

    // create a snapshot BEFORE applying the new scan so it becomes the "previous" snapshot
    try {
      await createSnapshot();
    } catch (err) {
      console.error('createSnapshot failed', err);
      // do not fail the scan flow if snapshot fails
    }

    await recordQRScan(qrCode, accountId, weight, awarded);
    const totalPoints = await addPointsToAccount(accountId, awarded);

        // Log system notification for points awarded
        try {
            // fetch user info
            const [userRows]: any = await db.execute(
                'SELECT a.Username, p.FirstName, p.LastName, p.Email FROM accounts_tbl a LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id WHERE a.Account_id = ? LIMIT 1',
                [accountId]
            );
            const user = Array.isArray(userRows) && userRows[0] ? userRows[0] : null;
            const username = user?.Username ?? null;
            const firstName = user?.FirstName ?? null;
            const lastName = user?.LastName ?? null;

            await db.execute(
                `INSERT INTO system_notifications_tbl (Event_type, Username, FirstName, LastName, Container_name, Created_at)
                 VALUES ('POINTS_AWARDED', ?, ?, ?, ?, NOW())`,
                [username, firstName, lastName, String(awarded)]
            );
        } catch (err) {
            console.warn('⚠️ Failed to log points awarded notification', err);
        }

        return { awarded, totalPoints };
}

async function getCurrentPoints(accountId: number): Promise<number> {
    const [rows]: any = await db.execute(
        'SELECT Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
        [accountId]
    );
    return (Array.isArray(rows) && rows[0]) ? Number(rows[0].Points) : 0;
}