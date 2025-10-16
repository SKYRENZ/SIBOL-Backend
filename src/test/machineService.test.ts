import { pool } from '../config/db';
import { 
  createMachine, 
  getAllMachines, 
  getMachineById, 
  updateMachine, 
  deleteMachine,
  getMachineStatuses,
  getAreas 
} from '../services/machineService';

let TEST_AREA_ID: number;
let TEST_STATUS_ID: number;
let TEST_MACHINE_ID: number;

beforeAll(async () => {
  // Create test area
  const [areaResult]: any = await pool.execute(
    'INSERT INTO Area_tbl (Area_name) VALUES (?)',
    ['Test Area ' + Date.now()]
  );
  TEST_AREA_ID = areaResult.insertId;

  // Create test status
  const [statusResult]: any = await pool.execute(
    'INSERT INTO Machine_status_tbl (Status) VALUES (?)',
    ['Test Status ' + Date.now()]
  );
  TEST_STATUS_ID = statusResult.insertId;
});

afterAll(async () => {
  // Clean up test data
  await pool.execute('DELETE FROM Machine_tbl WHERE Area_id = ?', [TEST_AREA_ID]);
  await pool.execute('DELETE FROM Area_tbl WHERE Area_id = ?', [TEST_AREA_ID]);
  await pool.execute('DELETE FROM Machine_status_tbl WHERE Mach_status_id = ?', [TEST_STATUS_ID]);
  await pool.end();
});

describe('Machine Service', () => {
  
  describe('createMachine', () => {
    it('should create a machine successfully', async () => {
      const result = await createMachine(TEST_AREA_ID, TEST_STATUS_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine created successfully');
      expect(result.machineId).toBeDefined();
      expect(result.machine.name).toMatch(/SIBOL_MACHINE_\d{4}-\d{2}-\d{2}/);
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
      
      // Type-safe check for array length
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
      
      // Type-safe check
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
      
      // Type-safe check
      if (Array.isArray(result.data)) {
        expect(result.data.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('deleteMachine', () => {
    it('should delete machine successfully', async () => {
      const result = await deleteMachine(TEST_MACHINE_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine deleted successfully');
      expect(result.machineId).toBe(TEST_MACHINE_ID);
    });

    it('should throw error if machine not found', async () => {
      await expect(deleteMachine(99999)).rejects.toThrow('Machine not found');
    });
  });
});