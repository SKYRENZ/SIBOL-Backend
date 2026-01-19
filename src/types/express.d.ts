import { Request } from "express";

declare global {
  namespace Express {
    interface User {
      Account_id: number;
      Username: string;
      Roles: number;
      IsFirstLogin?: number;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
