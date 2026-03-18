import { Request } from "express";

declare global {
  namespace Express {
    interface User {
      Account_id: number;
      Username: string;
      Roles: number;
      Barangay_id?: number | null;
      FirstName?: string | null;
      LastName?: string | null;
      Profile_Email?: string | null;
      IsFirstLogin?: number;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
