import { jest } from "@jest/globals";
import { createSqlLogger } from "./sqlLogger";

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const SQL_LOGGER = createSqlLogger("maintenanceService");

const mockQuery: any = jest.fn();

jest.mock("../config/db", () => {
  return {
    __esModule: true,
    pool: { query: mockQuery },
    default: { query: mockQuery },
  };
});

let maintenance: any;

beforeAll(() => {
  // require the service after the module mock is registered
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  maintenance = require("../services/maintenanceService");
});

describe("maintenanceService - workflow tests", () => {
  const STATUS_IDS: Record<string, number> = {
    Requested: 10,
    Pending: 11,
    "On-going": 12,
    "For Verification": 13,
    Completed: 14,
    Cancelled: 15,
  };
  const PRIORITY_IDS: Record<string, number> = { Critical: 1, Urgent: 2, Mild: 3 };

  // in-memory fake table for maintenance_tbl rows
  const requestStore: Record<number, any> = {};
  let nextInsertId = 100;

  beforeEach(() => {
    mockQuery.mockReset();

    mockQuery.mockImplementation((sql: any, params?: any[]) => {
      // debug: log every SQL executed in tests when logging is enabled
      SQL_LOGGER.log(String(sql || "").replace(/\s+/g, " ").trim(), params);

      sql = String(sql || "").trim();

      // accounts role lookup
      if (sql.includes("SELECT Roles FROM accounts_tbl WHERE Account_id")) {
        const id = params && params[0];
        if (id === 3) return Promise.resolve([[{ Roles: 3 }], null]); // operator
        if (id === 2) return Promise.resolve([[{ Roles: 2 }], null]); // staff
        return Promise.resolve([[{ Roles: 1 }], null]); // other (admin)
      }

      // priority lookup
      if (sql.includes("SELECT Priority_id FROM maintenance_priority_tbl")) {
        const name = params && params[0];
        const pid = PRIORITY_IDS[name] ?? null;
        return Promise.resolve([[{ Priority_id: pid }], null]);
      }

      // status lookup
      if (sql.includes("SELECT Main_stat_id FROM maintenance_status_tbl WHERE Status")) {
        const name = params && params[0];
        const sid = STATUS_IDS[name] ?? null;
        return Promise.resolve([[{ Main_stat_id: sid }], null]);
      }

      // INSERT maintenance_tbl
      if (sql.toUpperCase().startsWith("INSERT INTO maintenance_tbl".toUpperCase())) {
        const id = nextInsertId++;
        const [title, details, priorityId, createdBy, dueDate, attachment, mainStatId] = params || [];
        requestStore[id] = {
          Request_Id: id,
          Title: title,
          Details: details,
          Priority_Id: priorityId,
          Created_by: createdBy,
          Due_date: dueDate,
          Attachment: attachment,
          Main_stat_id: mainStatId,
          Assigned_to: null,
        };
        return Promise.resolve([{ insertId: id } as any, null]);
      }

      // simple UPDATE that sets Main_stat_id and Assigned_to
      if (sql.includes("UPDATE maintenance_tbl SET Main_stat_id = ?, Assigned_to = ? WHERE Request_Id = ?")) {
        const [mainStatId, assignedTo, requestId] = params || [];
        if (requestStore[requestId]) {
          requestStore[requestId].Main_stat_id = mainStatId;
          requestStore[requestId].Assigned_to = assignedTo;
        }
        return Promise.resolve([{ affectedRows: 1 } as any, null]);
      }

      // UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?
      if (sql.includes("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?")) {
        const [mainStatId, requestId] = params || [];
        if (requestStore[requestId]) {
          requestStore[requestId].Main_stat_id = mainStatId;
        }
        return Promise.resolve([{ affectedRows: 1 } as any, null]);
      }

      // SELECT Assigned_to or Created_by or other single-column selects for maintenance_tbl by id
      if (
        sql.includes("SELECT Assigned_to FROM maintenance_tbl WHERE Request_Id = ?") ||
        sql.includes("SELECT Created_by FROM maintenance_tbl WHERE Request_Id = ?") ||
        sql.includes("SELECT Assigned_to,") || // defensive: other variants
        sql.match(/^SELECT\s+[A-Za-z0-9_,\s]+FROM\s+maintenance_tbl\s+WHERE\s+Request_Id\s*=\s*\?/i)
      ) {
        const id = params && params[0];
        const row = requestStore[id] ? [{ ...requestStore[id] }] : [];
        // return row(s) shaped like DB result: array of rows
        return Promise.resolve([row, null]);
      }

      // SELECT * FROM maintenance_tbl WHERE Request_Id = ?
      if (sql.includes("SELECT * FROM maintenance_tbl WHERE Request_Id = ?")) {
        const id = params && params[0];
        const row = requestStore[id]
          ? [requestStore[id]]
          : [
              {
                Request_Id: id,
                Title: null,
                Details: null,
                Priority_Id: null,
                Created_by: null,
                Due_date: null,
                Attachment: null,
                Main_stat_id: STATUS_IDS.Requested,
                Assigned_to: null,
              },
            ];
        return Promise.resolve([row, null]);
      }

      // listTickets query (joins)
      if (sql.includes("FROM maintenance_tbl m LEFT JOIN maintenance_status_tbl")) {
        const rows = Object.values(requestStore).map((r: any) => ({
          ...r,
          StatusName: Object.entries(STATUS_IDS).find(([, v]) => v === r.Main_stat_id)?.[0] ?? null,
          PriorityName: Object.entries(PRIORITY_IDS).find(([, v]) => v === r.Priority_Id)?.[0] ?? null,
        }));
        return Promise.resolve([rows, null]);
      }

      // default fallback
      return Promise.resolve([[], null]);
    });
  });

  afterEach(() => {
    if (SQL_LOGGER.filePath) {
      // write calls to file (no per-test console output)
      for (const c of mockQuery.mock.calls) {
        SQL_LOGGER.log(String(c[0]).replace(/\s+/g, " ").trim(), c[1]);
      }
    }
  });

  // unified directory print handled by sqlLogger

  test("full ticket workflow: create -> accept+assign -> operator for-verification -> staff verify", async () => {
    const created = await maintenance.createTicket({
      title: "Leaking pipe",
      details: "Pipe leaking at valve",
      priority: "Critical",
      created_by: 3,
    });
    expect(created).toBeDefined();
    expect(created.Request_Id).toBeGreaterThanOrEqual(100);
    expect(created.Main_stat_id).toBe(STATUS_IDS.Requested);
    const reqId = created.Request_Id;

    const accepted = await maintenance.acceptAndAssign(reqId, 2, 3);
    expect(accepted).toBeDefined();
    expect(accepted.Assigned_to).toBe(3);
    expect(accepted.Main_stat_id).toBe(STATUS_IDS["On-going"]);

    const forVer = await maintenance.operatorMarkForVerification(reqId, 3);
    expect(forVer).toBeDefined();
    expect(forVer.Main_stat_id).toBe(STATUS_IDS["For Verification"]);

    const completed = await maintenance.staffVerifyCompletion(reqId, 2);
    expect(completed).toBeDefined();
    expect(completed.Main_stat_id).toBe(STATUS_IDS.Completed);
  });

  test("creator (operator) can cancel their own ticket", async () => {
    const created = await maintenance.createTicket({
      title: "Broken switch",
      details: "Switch not working",
      priority: "Mild",
      created_by: 3,
    });
    const id = created.Request_Id;
    const cancelled = await maintenance.cancelTicket(id, 3);
    expect(cancelled).toBeDefined();
    expect(cancelled.Main_stat_id).toBe(STATUS_IDS.Cancelled);
  });

  test("listTickets returns all stored tickets with status and priority names", async () => {
    const rows = await maintenance.listTickets();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("StatusName");
      expect(rows[0]).toHaveProperty("PriorityName");
    }
  });
});