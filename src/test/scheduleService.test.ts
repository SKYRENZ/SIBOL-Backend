import { RowDataPacket, FieldPacket, OkPacket } from "mysql2/promise";
import * as scheduleService from "../services/scheduleService";
import pool from "../config/db";
import { createSqlLogger } from "./sqlLogger";
const SQL_LOGGER = createSqlLogger("scheduleService");
const LOG_SQL = process.env.MOCK_SQL_LOG === "true";

// keep the jest.mock call first, then require the mocked module
jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

// Use require to get the mocked module (not the original imported binding)
const mockedPool = require("../config/db") as { query: jest.Mock };

describe("Schedule Service", () => {
  beforeEach(() => {
    // keep original behavior: clear mocks but do NOT replace mockedPool.query
    jest.clearAllMocks();
  });

  afterEach(() => {
    // write all recorded calls to the SQL log file (one line per call)
    if (SQL_LOGGER.filePath && mockedPool.query && Array.isArray(mockedPool.query.mock?.calls)) {
      for (const call of mockedPool.query.mock.calls) {
        // call[0] = sql, call[1] = params
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
      Contact: 123456789,
      Area: 1,
      sched_stat_id: 2,
      Date_of_collection: "2025-10-16 12:00:00",
    };
    const result = await scheduleService.createSchedule(data as any);
    expect(result).toMatchObject({
      Schedule_id: 1,
      Collector: "john.doe",
      ...data,
    });
  });

  it("getScheduleById should return schedule", async () => {
    mockedPool.query.mockResolvedValueOnce([
      [{ Schedule_id: 1, Collector: "john.doe" } as RowDataPacket], [] as FieldPacket[]
    ]);
    const result = await scheduleService.getScheduleById(1);
    expect(result).toEqual({ Schedule_id: 1, Collector: "john.doe" });
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
        [{ Schedule_id: 1, Collector: "john.doe" } as RowDataPacket], [] as FieldPacket[]
      ]);
    const data = {
      Account_id: 1,
      Contact: 123456789,
      Area: 1,
      sched_stat_id: 2,
      Date_of_collection: "2025-10-16 12:00:00",
    };
    const result = await scheduleService.updateSchedule(1, data as any);
    expect(result).toEqual({ Schedule_id: 1, Collector: "john.doe" });
  });

  it("deleteSchedule should delete schedule", async () => {
    mockedPool.query.mockResolvedValueOnce([
      {} as OkPacket, [] as FieldPacket[]
    ]);
    const result = await scheduleService.deleteSchedule(1);
    expect(result).toEqual({ deleted: true });
  });

  it("listSchedules should return all schedules", async () => {
    mockedPool.query.mockResolvedValueOnce([
      [{ Schedule_id: 1 } as RowDataPacket, { Schedule_id: 2 } as RowDataPacket], [] as FieldPacket[]
    ]);
    const result = await scheduleService.listSchedules();
    expect(result).toEqual([{ Schedule_id: 1 }, { Schedule_id: 2 }]);
  });
});