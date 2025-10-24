import pool from '../config/db';

export const FiltersService = {
  async getMachineStatuses() {
    const [rows] = await pool.execute(
      `SELECT Mach_status_id AS id, Status AS name FROM machine_status_tbl ORDER BY Mach_status_id`
    );
    return rows as any[];
  },

  async getMaintenancePriorities() {
    const [rows] = await pool.execute(
      `SELECT Priority_id AS id, Priority AS name FROM maintenance_priority_tbl ORDER BY Priority_id`
    );
    return rows as any[];
  },

  async getMaintenanceStatuses() {
    const [rows] = await pool.execute(
      `SELECT Main_stat_id AS id, Status AS name FROM maintenance_status_tbl ORDER BY Main_stat_id`
    );
    return rows as any[];
  },

  async getScheduleStatuses() {
    const [rows] = await pool.execute(
      `SELECT sched_stat_id AS id, Status AS name FROM schedule_status_tbl ORDER BY sched_stat_id`
    );
    return rows as any[];
  },

  async getAllFilters() {
    const [machineStatuses, maintenancePriorities, maintenanceStatuses, scheduleStatuses] = await Promise.all([
      this.getMachineStatuses(),
      this.getMaintenancePriorities(),
      this.getMaintenanceStatuses(),
      this.getScheduleStatuses(),
    ]);
    return { machineStatuses, maintenancePriorities, maintenanceStatuses, scheduleStatuses };
  },

  async getByType(type: string) {
    switch (type) {
      case 'machine-status':
      case 'machineStatuses':
      case 'machine-statuses':
        return this.getMachineStatuses();
      case 'maintenance-priority':
      case 'maintenancePriorities':
      case 'maintenance-priorities':
        return this.getMaintenancePriorities();
      case 'maintenance-status':
      case 'maintenanceStatuses':
      case 'maintenance-statuses':
        return this.getMaintenanceStatuses();
      case 'schedule-status':
      case 'scheduleStatuses':
      case 'schedule-statuses':
        return this.getScheduleStatuses();
      default:
        throw new Error('Unknown filter type');
    }
  }
};

export default FiltersService;