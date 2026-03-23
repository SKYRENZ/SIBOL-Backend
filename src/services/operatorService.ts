import pool from "../config/db";

export async function listOperators() {
  const [rows] = await pool.query<any[]>(
    `SELECT 
      a.Account_id, 
      a.Username,
      p.FirstName,
      p.LastName,
      p.Profile_image_path,
      CONCAT(
        IFNULL(p.FirstName, ''), 
        IF(p.FirstName != '' AND p.LastName != '', ' ', ''), 
        IFNULL(p.LastName, ''),
        IF(p.FirstName IS NULL AND p.LastName IS NULL, a.Username, '')
      ) as Full_name
    FROM accounts_tbl a
    LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
    WHERE a.Roles = 3 AND a.IsActive = 1`
  );
  return rows;
}