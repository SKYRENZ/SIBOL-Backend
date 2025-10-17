import * as rewardService from "../services/rewardService";
import { createSqlLogger } from "./sqlLogger";

const SQL_LOGGER = createSqlLogger("rewardService");
const LOG_SQL = process.env.MOCK_SQL_LOG === "true";

// mock the DB module first
jest.mock("../config/db", () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

// require the mocked module and obtain the pool mock
const dbMock = require("../config/db");
const mockedPool = dbMock.pool as {
  query: jest.Mock;
  getConnection: jest.Mock;
};

describe("rewardService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // optional SQL logging for debugging
    if (SQL_LOGGER.filePath && mockedPool.query && Array.isArray(mockedPool.query.mock?.calls)) {
      for (const call of mockedPool.query.mock.calls) {
        SQL_LOGGER.log(String(call[0]).replace(/\s+/g, " ").trim(), call[1]);
      }
    }
  });

  test("createReward inserts and returns insertId", async () => {
    mockedPool.query.mockResolvedValueOnce([{ insertId: 42 }]);
    const id = await rewardService.createReward({
      Item: "Test Item",
      Description: "desc",
      Points_cost: 50,
      Quantity: 10,
    } as any);
    expect(id).toBe(42);
    expect(mockedPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO rewards_tbl"),
      expect.any(Array)
    );
  });

  test("updateReward builds update query when fields provided", async () => {
    mockedPool.query.mockResolvedValueOnce([{}]);
    await rewardService.updateReward(5, { Item: "New", Quantity: 3 });
    expect(mockedPool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE rewards_tbl SET"),
      expect.any(Array)
    );
  });

  test("archiveReward / restoreReward update IsArchived flag", async () => {
    mockedPool.query.mockResolvedValue([{}]);
    await rewardService.archiveReward(7);
    await rewardService.restoreReward(7);
    expect(mockedPool.query).toHaveBeenNthCalledWith(1, expect.stringContaining("UPDATE rewards_tbl SET IsArchived = 1"), [7]);
    expect(mockedPool.query).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE rewards_tbl SET IsArchived = 0"), [7]);
  });

  test("getRewardById returns row or null", async () => {
    mockedPool.query.mockResolvedValueOnce([[{ Reward_id: 3, Item: "A" }]]);
    const r = await rewardService.getRewardById(3);
    expect(r).toEqual({ Reward_id: 3, Item: "A" });
  });

  test("listRewards respects archived filter", async () => {
    mockedPool.query.mockResolvedValueOnce([[{ Reward_id: 1 }]]);
    const rows = await rewardService.listRewards({ archived: false });
    expect(rows).toEqual([{ Reward_id: 1 }]);
    expect(mockedPool.query).toHaveBeenCalledWith(expect.stringContaining("IsArchived = 0 ORDER BY"));
  });

  test("redeemReward success flow: creates transaction, deducts points and stock", async () => {
    // prepare a fake connection that will be returned by getConnection
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // account select -> Points = 100
        .mockResolvedValueOnce([[{ Points: 100 }]])
        // reward select -> Points_cost = 20, Quantity = 3, IsArchived = 0
        .mockResolvedValueOnce([[{ Points_cost: 20, Quantity: 3, IsArchived: 0 }]])
        // insert transaction -> insertId = 10
        .mockResolvedValueOnce([{ insertId: 10 }])
        // update accounts_tbl
        .mockResolvedValueOnce([{}])
        // update rewards_tbl
        .mockResolvedValueOnce([{}]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockedPool.getConnection.mockResolvedValue(conn);

    const res = await rewardService.redeemReward(1, 2, 2); // needs 40 points
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledTimes(5); // select acc, select reward, insert, update acc, update reward
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res).toHaveProperty("transactionId", 10);
    expect(res).toHaveProperty("redemption_code");
    expect(res.total_points).toBe(40);
  });

  test("redeemReward throws on insufficient points and rolls back", async () => {
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // account select -> Points = 10
        .mockResolvedValueOnce([[{ Points: 10 }]])
        // reward select -> Points_cost = 20, Quantity = 3, IsArchived = 0
        .mockResolvedValueOnce([[{ Points_cost: 20, Quantity: 3, IsArchived: 0 }]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    mockedPool.getConnection.mockResolvedValue(conn);

    await expect(rewardService.redeemReward(1, 2, 1)).rejects.toThrow("Insufficient points");
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test("redeemReward throws on insufficient stock and rolls back", async () => {
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // account select -> Points = 100
        .mockResolvedValueOnce([[{ Points: 100 }]])
        // reward select -> Points_cost = 20, Quantity = 0, IsArchived = 0
        .mockResolvedValueOnce([[{ Points_cost: 20, Quantity: 0, IsArchived: 0 }]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    mockedPool.getConnection.mockResolvedValue(conn);

    await expect(rewardService.redeemReward(1, 2, 1)).rejects.toThrow("Insufficient reward stock");
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test("getTransactionByCode returns transaction row or null", async () => {
    mockedPool.query.mockResolvedValueOnce([[{ Reward_transaction_id: 1, Redemption_code: "ABC123" }]]);
    const tx = await rewardService.getTransactionByCode("ABC123");
    expect(tx).toEqual({ Reward_transaction_id: 1, Redemption_code: "ABC123" });
    expect(mockedPool.query).toHaveBeenCalledWith(expect.stringContaining("FROM reward_transactions_tbl"), ["ABC123"]);
  });

  test("markTransactionRedeemed updates status", async () => {
    mockedPool.query.mockResolvedValueOnce([ { affectedRows: 1 } ]);
    const res = await rewardService.markTransactionRedeemed(5);
    expect(mockedPool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE reward_transactions_tbl SET Status = 'Redeemed'"), [5]);
    expect(res).toBeDefined();
  });
});