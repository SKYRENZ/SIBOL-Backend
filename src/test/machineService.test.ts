import { pool } from '../config/db';
import { 
  createMachine, 
  getAllMachines, 
  getMachineById, 
  updateMachine, 
  // deleteMachine, // Commented out since function is removed
  getMachineStatuses,
  getAreas 
} from '../services/machineService';
import { createSqlLogger } from "./sqlLogger";

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const machineSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalPoolExecute = (pool as any).execute;

let TEST_AREA_ID: number;
let TEST_STATUS_ID: number;
let TEST_MACHINE_ID: number;

const SQL_LOGGER = createSqlLogger("machineService");

beforeAll(async () => {
  // wrap pool.execute to capture SQL calls when logging is enabled
  (pool as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) machineSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalPoolExecute.call(pool, sql, params);
  };

  // Create test area
  const [areaResult]: any = await pool.execute(
    'INSERT INTO area_tbl (Area_Name) VALUES (?)',
    ['Test Area ' + Date.now()]
  );
  TEST_AREA_ID = areaResult.insertId;

  // Create test status
  const [statusResult]: any = await pool.execute(
    'INSERT INTO machine_status_tbl (Status) VALUES (?)',
    ['Test Status ' + Date.now()]
  );
  TEST_STATUS_ID = statusResult.insertId;
});

// clear after each test into the SQL log file
afterEach(() => {
  if (SQL_LOGGER.filePath) {
    for (const c of machineSqlCalls) {
      SQL_LOGGER.log(String(c[0]).replace(/\s+/g, " ").trim(), c[1]);
    }
  }
  machineSqlCalls.length = 0;
});

afterAll(async () => {
  // restore original execute and perform cleanup executed in existing afterAll
  (pool as any).execute = _originalPoolExecute;

  // Clean up test data
  await pool.execute('DELETE FROM machine_tbl WHERE Area_id = ?', [TEST_AREA_ID]);
  await pool.execute('DELETE FROM area_tbl WHERE Area_id = ?', [TEST_AREA_ID]);
  await pool.execute('DELETE FROM machine_status_tbl WHERE Mach_status_id = ?', [TEST_STATUS_ID]);
  await pool.end();

  if (SQL_LOGGER.filePath) {
    // unified directory print handled by sqlLogger
  }
});

describe('Machine Service', () => {
  
  describe('createMachine', () => {
    it('should create a machine successfully', async () => {
      const result = await createMachine(TEST_AREA_ID, TEST_STATUS_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine created successfully');
      expect(result.machineId).toBeDefined();
      expect(result.machine.name).toMatch(/SIBOL_MACHINE_\d+_\d{4}-\d{2}-\d{2}/);
      expect(result.machine.areaId).toBe(TEST_AREA_ID);
      expect(result.machine.status).toBe(TEST_STATUS_ID);
      
      // Store for other tests
      TEST_MACHINE_ID = result.machineId;
    });

    it('should throw error if areaId is missing', async () => {
      await expect(createMachine(null as any)).rejects.toThrow('Area ID is required');
    });
  });

  describe('getAllMachines', () => {
    it('should get all machines successfully', async () => {
      const result = await getAllMachines();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machines fetched successfully');
      expect(Array.isArray(result.data)).toBe(true);
      
      if (Array.isArray(result.data)) {
        expect(result.data.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getMachineById', () => {
    it('should get machine by ID successfully', async () => {
      const result = await getMachineById(TEST_MACHINE_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine fetched successfully');
      expect(result.data.Machine_id).toBe(TEST_MACHINE_ID);
      expect(result.data.Area_id).toBe(TEST_AREA_ID);
    });

    it('should throw error if machine not found', async () => {
      await expect(getMachineById(99999)).rejects.toThrow('Machine not found');
    });
  });

  describe('updateMachine', () => {
    it('should update machine successfully', async () => {
      const newName = 'Updated Test Machine';
      const result = await updateMachine(TEST_MACHINE_ID, newName, TEST_AREA_ID, TEST_STATUS_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine updated successfully');
      expect(result.machineId).toBe(TEST_MACHINE_ID);
      expect(result.machine.name).toBe(newName);
    });

    it('should throw error if name is missing', async () => {
      await expect(updateMachine(TEST_MACHINE_ID, '', TEST_AREA_ID, TEST_STATUS_ID))
        .rejects.toThrow('Name and Area ID are required');
    });

    it('should throw error if machine not found', async () => {
      await expect(updateMachine(99999, 'Test', TEST_AREA_ID, TEST_STATUS_ID))
        .rejects.toThrow('Machine not found');
    });
  });

  describe('getMachineStatuses', () => {
    it('should get all machine statuses successfully', async () => {
      const result = await getMachineStatuses();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine statuses fetched successfully');
      expect(Array.isArray(result.data)).toBe(true);
      
      if (Array.isArray(result.data)) {
        expect(result.data.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getAreas', () => {
    it('should get all areas successfully', async () => {
      const result = await getAreas();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Areas fetched successfully');
      expect(Array.isArray(result.data)).toBe(true);
      
      if (Array.isArray(result.data)) {
        expect(result.data.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

});