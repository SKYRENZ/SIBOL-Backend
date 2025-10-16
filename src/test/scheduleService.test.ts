import { RowDataPacket, FieldPacket, OkPacket } from "mysql2/promise";
import * as scheduleService from "../services/scheduleService";
import pool from "../config/db";

jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const mockedPool = pool as jest.Mocked<typeof pool>;

describe("Schedule Service", () => {
  beforeEach(() => jest.clearAllMocks());

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