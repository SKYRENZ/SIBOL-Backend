import { 
  createMachine, 
  getAllMachines, 
  getMachineById, 
  updateMachine, 
  deleteMachine,
  getMachineStatuses,
  getAreas 
} from '../services/machineService';

// Mock the database pool
jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
    end: jest.fn(),
  }
}));

import { pool } from '../config/db';
const mockPool = pool as jest.Mocked<typeof pool>;

// Test data constants
const TEST_MACHINE_ID = 1;
const TEST_AREA_ID = 1;
const TEST_STATUS_ID = 1;

describe('Machine Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMachine', () => {
    it('should create a machine successfully', async () => {
      // Mock the database response
      mockPool.execute.mockResolvedValueOnce([{ insertId: 1 }, undefined] as any);

      const result = await createMachine(1, 1);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine created successfully');
      expect(result.machineId).toBe(1);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'INSERT INTO Machine_tbl (Name, Area_id, Status) VALUES (?, ?, ?)',
        expect.arrayContaining([expect.stringMatching(/SIBOL_MACHINE_\d{4}-\d{2}-\d{2}/), 1, 1])
      );
    });

    it('should throw error if areaId is missing', async () => {
      await expect(createMachine(null as any)).rejects.toThrow('Area ID is required');
    });
  });

  describe('getAllMachines', () => {
    it('should get all machines successfully', async () => {
      const mockMachines = [
        { Machine_id: 1, Name: 'Test Machine', Area_id: 1, status_id: 1 }
      ];
      mockPool.execute.mockResolvedValueOnce([mockMachines, undefined] as any);

      const result = await getAllMachines();
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMachines);
    });
  });

  describe('getMachineById', () => {
    it('should get machine by ID successfully', async () => {
      const mockMachine = { Machine_id: TEST_MACHINE_ID, Name: 'Test Machine', Area_id: TEST_AREA_ID };
      mockPool.execute.mockResolvedValueOnce([[mockMachine], undefined] as any);

      const result = await getMachineById(TEST_MACHINE_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine fetched successfully');
      expect(result.data.Machine_id).toBe(TEST_MACHINE_ID);
      expect(result.data.Area_id).toBe(TEST_AREA_ID);
    });

    it('should throw error if machine not found', async () => {
      mockPool.execute.mockResolvedValueOnce([[], undefined] as any);
      
      await expect(getMachineById(99999)).rejects.toThrow('Machine not found');
    });
  });

  describe('updateMachine', () => {
    it('should update machine successfully', async () => {
      const newName = 'Updated Test Machine';
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, undefined] as any);
      
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
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, undefined] as any);
      
      await expect(updateMachine(99999, 'Test', TEST_AREA_ID, TEST_STATUS_ID))
        .rejects.toThrow('Machine not found');
    });
  });

  describe('getMachineStatuses', () => {
    it('should get all machine statuses successfully', async () => {
      const mockStatuses = [
        { Mach_status_id: 1, Status: 'Active' },
        { Mach_status_id: 2, Status: 'Inactive' }
      ];
      mockPool.execute.mockResolvedValueOnce([mockStatuses, undefined] as any);

      const result = await getMachineStatuses();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine statuses fetched successfully');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual(mockStatuses);
    });
  });

  describe('getAreas', () => {
    it('should get all areas successfully', async () => {
      const mockAreas = [
        { Area_id: 1, Area_name: 'Production' },
        { Area_id: 2, Area_name: 'Quality Control' }
      ];
      mockPool.execute.mockResolvedValueOnce([mockAreas, undefined] as any);

      const result = await getAreas();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Areas fetched successfully');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual(mockAreas);
    });
  });

  describe('deleteMachine', () => {
    it('should delete machine successfully', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, undefined] as any);

      const result = await deleteMachine(TEST_MACHINE_ID);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Machine deleted successfully');
      expect(result.machineId).toBe(TEST_MACHINE_ID);
    });

    it('should throw error if machine not found', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, undefined] as any);
      
      await expect(deleteMachine(99999)).rejects.toThrow('Machine not found');
    });
  });
});