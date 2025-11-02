import { RowDataPacket, FieldPacket, OkPacket } from "mysql2/promise";
import * as scheduleService from "../services/scheduleService";
import pool from "../config/db";
import { createSqlLogger } from "./sqlLogger";
const SQL_LOGGER = createSqlLogger("scheduleService");
const LOG_SQL = process.env.MOCK_SQL_LOG === "true";

jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const mockedPool = require("../config/db") as { query: jest.Mock };

// Mock profileService
jest.mock("../services/profileService", () => ({
  getProfileByAccountId: jest.fn(),
}));

const mockedProfileService = require("../services/profileService") as { getProfileByAccountId: jest.Mock };

describe("Schedule Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (SQL_LOGGER.filePath && mockedPool.query && Array.isArray(mockedPool.query.mock?.calls)) {
      for (const call of mockedPool.query.mock.calls) {
        SQL_LOGGER.log(String(call[0]).replace(/\s+/g, " ").trim(), call[1]);
      }
    }
  });

  afterAll(() => {
    // unified directory print handled by sqlLogger
  });

  it("createSchedule should insert and return schedule", async () => {
    mockedPool.query
      .mockResolvedValueOnce([
        [{ Username: "john.doe" } as RowDataPacket], [] as FieldPacket[]
      ])
      .mockResolvedValueOnce([
        { insertId: 1 } as OkPacket, [] as FieldPacket[]
      ]);

    const data = {
      Account_id: 1,
      Area: 1,
      sched_stat_id: 2,
      Date_of_collection: "2025-10-16 12:00:00",
    };
    const result = await scheduleService.createSchedule(data as any);
    expect(result).toMatchObject({
      Schedule_id: 1,
      Collector: "john.doe",
      Account_id: 1,
      Area: 1,
    });
  });

  it("getScheduleById should return schedule", async () => {
    mockedPool.query.mockResolvedValueOnce([
      [{ Schedule_id: 1, Collector: "john.doe", Account_id: 1, Area: 1 } as RowDataPacket], [] as FieldPacket[]
    ]);
    const result = await scheduleService.getScheduleById(1);
    expect(result).toEqual({ Schedule_id: 1, Collector: "john.doe", Account_id: 1, Area: 1 });
  });

  it("updateSchedule should update and return schedule", async () => {
    mockedPool.query
      .mockResolvedValueOnce([
        [{ Username: "john.doe" } as RowDataPacket], [] as FieldPacket[]
      ])
      .mockResolvedValueOnce([
        {} as OkPacket, [] as FieldPacket[]
      ])
      .mockResolvedValueOnce([
        [{ Schedule_id: 1, Collector: "john.doe", Account_id: 1, Area: 1 } as RowDataPacket], [] as FieldPacket[]
      ]);
    const data = {
      Account_id: 1,
      Area: 1,
      sched_stat_id: 2,
      Date_of_collection: "2025-10-16 12:00:00",
    };
    const result = await scheduleService.updateSchedule(1, data as any);
    expect(result).toEqual({ Schedule_id: 1, Collector: "john.doe", Account_id: 1, Area: 1 });
  });

  it("deleteSchedule should delete schedule", async () => {
    mockedPool.query.mockResolvedValueOnce([
      {} as OkPacket, [] as FieldPacket[]
    ]);
    const result = await scheduleService.deleteSchedule(1);
    expect(result).toEqual({ deleted: true });
  });

  it("listSchedules should return all schedules with contact from profile", async () => {
    mockedPool.query.mockResolvedValueOnce([
      [
        { Schedule_id: 1, Account_id: 1, Collector: "john.doe", Area: 1 } as RowDataPacket,
        { Schedule_id: 2, Account_id: 2, Collector: "ej.benig", Area: 68 } as RowDataPacket
      ],
      [] as FieldPacket[]
    ]);

    mockedProfileService.getProfileByAccountId
      .mockResolvedValueOnce({ Contact: 9876543210 })
      .mockResolvedValueOnce({ Contact: 9773491992 });

    const result = await scheduleService.listSchedules();
    
    expect(result).toEqual([
      { Schedule_id: 1, Account_id: 1, Collector: "john.doe", Area: 1, Contact: 9876543210 },
      { Schedule_id: 2, Account_id: 2, Collector: "ej.benig", Area: 68, Contact: 9773491992 }
    ]);
    
    expect(mockedProfileService.getProfileByAccountId).toHaveBeenCalledTimes(2);
    expect(mockedProfileService.getProfileByAccountId).toHaveBeenCalledWith(1);
    expect(mockedProfileService.getProfileByAccountId).toHaveBeenCalledWith(2);
  });

  it("listSchedules should handle profile fetch errors gracefully", async () => {
    mockedPool.query.mockResolvedValueOnce([
      [
        { Schedule_id: 1, Account_id: 1, Collector: "john.doe", Area: 1 } as RowDataPacket
      ],
      [] as FieldPacket[]
    ]);

    mockedProfileService.getProfileByAccountId.mockRejectedValueOnce(new Error("Profile not found"));

    const result = await scheduleService.listSchedules();
    
    expect(result).toEqual([
      { Schedule_id: 1, Account_id: 1, Collector: "john.doe", Area: 1, Contact: '' }
    ]);
  });
});