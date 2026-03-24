import { getUsersByRoleName } from './userService';

export async function listOperators(barangayId?: number) {
  const rows = await getUsersByRoleName('Operator', barangayId);
  return rows.map(row => ({
    Account_id: row.Account_id,
    Username: row.Username,
    First_name: row.FirstName,
    Last_name: row.LastName,
    Profile_image_path: null, // Can be added later if needed
    Full_name: row.FirstName && row.LastName 
      ? `${row.FirstName} ${row.LastName}`
      : row.Username
  }));
}