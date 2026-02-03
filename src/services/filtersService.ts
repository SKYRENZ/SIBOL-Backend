import pool from '../config/db';

export const FiltersService = {
  async getMachineStatuses() {
    const [rows] = await pool.execute(
      `SELECT Mach_status_id AS id, Status AS name FROM machine_status_tbl ORDER BY Mach_status_id`
    );
    return rows as any[];
  },

  async getAreas() {
    const [rows] = await pool.execute(
      `SELECT Area_id AS id, Area_Name AS name FROM area_tbl ORDER BY Area_id`
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

  async getContainerStatuses() {
    const [rows] = await pool.execute(
      `SELECT status_id AS id, status_name AS name FROM waste_container_status_tbl ORDER BY status_id`
    );
    return rows as any[];
  },

  async getWasteTypes() {
    const [rows] = await pool.execute(
      `SELECT type_id AS id, type_name AS name FROM waste_type_tbl ORDER BY type_id`
    );
    return rows as any[];
  },

  async getAdditiveStages() {
    const [rows] = await pool.execute(
      `SELECT stage_id AS id, stage_name AS name FROM additive_stage_tbl ORDER BY stage_id`
    );
    return rows as any[];
  },

  async getMachines() {
    const [rows] = await pool.execute(
      `SELECT machine_id AS id, Name AS name FROM machine_tbl ORDER BY machine_id`
    );
    return rows as any[];
  },

  async getRewardStatuses() {
    return [
      { id: 1, name: "Claimed" },
      { id: 2, name: "Unclaimed" },
    ];
  },

  async getAllFilters() {
    const [
      machineStatuses,
      areas,
      maintenancePriorities,
      maintenanceStatuses,
      scheduleStatuses,
      containerStatuses,
      wasteTypes,
      additiveStages,
      machines,
      rewardStatuses,
    ] = await Promise.all([
      this.getMachineStatuses(),
      this.getAreas(),
      this.getMaintenancePriorities(),
      this.getMaintenanceStatuses(),
      this.getScheduleStatuses(),
      this.getContainerStatuses(),
      this.getWasteTypes(),
      this.getAdditiveStages(),
      this.getMachines(),
      this.getRewardStatuses(),
    ]);
    
    return {
      machineStatuses,
      areas,
      maintenancePriorities,
      maintenanceStatuses,
      scheduleStatuses,
      containerStatuses,
      wasteTypes,
      additiveStages,
      machines,
      rewardStatuses,
    };
  },

  async getByType(type: string) {
    // Normalize type string
    const normalizedType = type.toLowerCase().replace(/[-_]/g, '');

    switch (normalizedType) {
      // Machine Status
      case 'machinestatus':
      case 'machinestatuses':
        return this.getMachineStatuses();

      // Areas
      case 'area':
      case 'areas':
        return this.getAreas();

      // Maintenance Priority
      case 'maintenancepriority':
      case 'maintenancepriorities':
        return this.getMaintenancePriorities();

      // Maintenance Status
      case 'maintenancestatus':
      case 'maintenancestatuses':
        return this.getMaintenanceStatuses();

      // Schedule Status
      case 'schedulestatus':
      case 'schedulestatuses':
        return this.getScheduleStatuses();

      // Container Status
      case 'containerstatus':
      case 'containerstatuses':
        return this.getContainerStatuses();

      // Waste Types
      case 'wastetype':
      case 'wastetypes':
        return this.getWasteTypes();

      // Additive Stages
      case 'additivestage':
      case 'additivesstage':
      case 'additivestages':
        return this.getAdditiveStages();

      // Machines
      case 'machine':
      case 'machines':
        return this.getMachines();

      // Reward Status
      case 'rewardstatus':
      case 'rewardstatuses':
        return this.getRewardStatuses();

      default:
        throw new Error(`Unknown filter type: ${type}`);
    }
  }
};

export default FiltersService;