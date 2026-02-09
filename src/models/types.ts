export interface Account {
  Account_id?: number;
  Username: string;
  Roles?: number;
  IsActive?: 0 | 1;
  Points?: number;
}

export interface Profile {
  Profile_id?: number;
  Account_id?: number;
  FirstName?: string;
  LastName?: string;
  Area_id?: number;
  Contact?: string | number;
  Email?: string;
}

export interface Schedule {
  Schedule_id?: number;
  Account_id: number;
  Collector?: string;
  Contact: number;
  Area: number;
  sched_stat_id: number;
  Date_of_collection: string;
}

export interface Machine {
  Machine_id?: number;
  Name: string;
  Device_id: string;
  Area_id?: number;
  Status?: number;
  Mac_address: string;
  Cert_fingerprint?: string;
  Certificate_PEM?: string; 
}

export interface MachineStatus {
  Mach_status_id: number;
  Status: string;
}

export interface Area {
  Area_id: number;
  Area_Name: string;
}

export type Reward = {
  Reward_id?: number;
  Item: string;
  Description?: string | null;
  Points_cost: number;
  Quantity: number;
  IsArchived?: number | boolean;

  // ✅ add these
  Image_url?: string | null;
  Image_public_id?: string | null;
};

export interface RewardTransaction {
  Reward_transaction_id?: number;
  Reward_id: number;
  Account_id: number;
  Quantity: number;
  Total_points: number;
  Redemption_code?: string;
  Status?: string;
}

export interface MaintenanceTicket {
  Request_Id?: number;
  Title?: string;
  Details?: string;
  Priority_Id?: number | null;
  Created_by?: number | null;
  Due_date?: string | null;
  Attachment?: string | null;
  Main_stat_id?: number | null;
  Assigned_to?: number | null;
  StatusName?: string | null;
  PriorityName?: string | null;
}

export type ProfileUpdate = {
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  area?: number;
  contact?: string | number;
  email?: string;
};