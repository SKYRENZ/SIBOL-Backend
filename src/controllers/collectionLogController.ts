import { Request, Response } from 'express';
import { pool } from '../config/db';

export interface CollectionLog {
  collection_id?: number;
  area_id: number;
  operator_id: number;
  container_id?: number;
  weight: number;
  collection_method?: 'manual' | 'sensor' | 'qr_scan';
  notes?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  collected_at?: Date;
}

export class CollectionLogController {
  // Log a new waste collection
  static async logCollection(req: Request, res: Response) {
    try {
      const {
        area_id,
        operator_id,
        container_id,
        weight,
        collection_method = 'manual',
        notes,
        gps_latitude,
        gps_longitude
      }: CollectionLog = req.body;

      // Validate required fields
      if (!area_id || !operator_id || !weight) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: area_id, operator_id, weight'
        });
      }

      // Validate weight is positive
      if (weight <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Weight must be a positive number'
        });
      }

      // Verify operator exists and has operator role
      const operatorQuery = `
        SELECT a.Account_id, a.Username, ur.Roles 
        FROM accounts_tbl a
        JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
        WHERE a.Account_id = ? AND ur.Roles = 'Operator'
      `;
      
      const [operatorRows]: any = await pool.execute(operatorQuery, [operator_id]);
      
      if (operatorRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Operator not found or invalid role'
        });
      }

      // Verify area exists
      const areaQuery = 'SELECT Area_id, Area_Name FROM area_tbl WHERE Area_id = ?';
      const [areaRows]: any = await pool.execute(areaQuery, [area_id]);
      
      if (areaRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Area not found'
        });
      }

      // If container_id is provided, verify it exists and belongs to the area
      if (container_id) {
        const containerQuery = `
          SELECT container_id, area_id 
          FROM waste_containers_tbl 
          WHERE container_id = ? AND area_id = ?
        `;
        const [containerRows]: any = await pool.execute(containerQuery, [container_id, area_id]);
        
        if (containerRows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Container not found or does not belong to specified area'
          });
        }
      }

      // Insert collection log
      const insertQuery = `
        INSERT INTO waste_collection_tbl 
        (area_id, operator_id, container_id, weight, collection_method, notes, gps_latitude, gps_longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const [result]: any = await pool.execute(insertQuery, [
        area_id,
        operator_id,
        container_id || null,
        weight,
        collection_method,
        notes || null,
        gps_latitude || null,
        gps_longitude || null
      ]);

      // Get the created collection log with additional details
      const selectQuery = `
        SELECT 
          wc.*,
          a.Area_Name,
          op.Username as operator_name,
          wc.container_name
        FROM waste_collection_tbl wc
        JOIN area_tbl a ON wc.area_id = a.Area_id
        JOIN accounts_tbl op ON wc.operator_id = op.Account_id
        LEFT JOIN waste_containers_tbl c ON wc.container_id = c.container_id
        WHERE wc.collection_id = ?
      `;
      
      const [newLog]: any = await pool.execute(selectQuery, [result.insertId]);

      res.status(201).json({
        success: true,
        message: 'Waste collection logged successfully',
        data: newLog[0]
      });

    } catch (error) {
      console.error('Error logging collection:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get collection logs for an operator
  static async getOperatorCollections(req: Request, res: Response) {
    try {
      const { operator_id } = req.params;
      const { 
        start_date, 
        end_date, 
        limit = 50, 
        offset = 0 
      } = req.query;

      let query = `
        SELECT 
          wc.*,
          a.Area_Name,
          c.container_name,
          c.status as container_status
        FROM waste_collection_tbl wc
        JOIN area_tbl a ON wc.area_id = a.Area_id
        LEFT JOIN waste_containers_tbl c ON wc.container_id = c.container_id
        WHERE wc.operator_id = ?
      `;
      
      const params: any[] = [operator_id];

      if (start_date) {
        query += ' AND DATE(wc.collected_at) >= ?';
        params.push(start_date);
      }

      if (end_date) {
        query += ' AND DATE(wc.collected_at) <= ?';
        params.push(end_date);
      }

      query += ' ORDER BY wc.collected_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));

      const [logs]: any = await pool.execute(query, params);

      // Get summary statistics
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_collections,
          SUM(weight) as total_weight,
          COUNT(DISTINCT area_id) as unique_areas,
          DATE(collected_at) as collection_date
        FROM waste_collection_tbl 
        WHERE operator_id = ?
        ${start_date ? 'AND DATE(collected_at) >= ?' : ''}
        ${end_date ? 'AND DATE(collected_at) <= ?' : ''}
        GROUP BY DATE(collected_at)
        ORDER BY collection_date DESC
      `;

      const summaryParams: any[] = [operator_id];
      if (start_date) summaryParams.push(start_date);
      if (end_date) summaryParams.push(end_date);

      const [summary]: any = await pool.execute(summaryQuery, summaryParams);

      res.json({
        success: true,
        data: {
          logs,
          summary: summary,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: logs.length
          }
        }
      });

    } catch (error) {
      console.error('Error getting operator collections:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get collection logs for an area
  static async getAreaCollections(req: Request, res: Response) {
    try {
      const { area_id } = req.params;
      const { 
        start_date, 
        end_date, 
        limit = 50, 
        offset = 0 
      } = req.query;

      let query = `
        SELECT 
          wc.*,
          op.Username as operator_name,
          c.container_name
        FROM waste_collection_tbl wc
        JOIN accounts_tbl op ON wc.operator_id = op.Account_id
        LEFT JOIN waste_containers_tbl c ON wc.container_id = c.container_id
        WHERE wc.area_id = ?
      `;
      
      const params: any[] = [area_id];

      if (start_date) {
        query += ' AND DATE(wc.collected_at) >= ?';
        params.push(start_date);
      }

      if (end_date) {
        query += ' AND DATE(wc.collected_at) <= ?';
        params.push(end_date);
      }

      query += ' ORDER BY wc.collected_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));

      const [logs]: any = await pool.execute(query, params);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: logs.length
          }
        }
      });

    } catch (error) {
      console.error('Error getting area collections:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get collection statistics
  static async getCollectionStats(req: Request, res: Response) {
    try {
      const { period = 'week' } = req.query; // day, week, month, year

      let dateFormat: string;
      switch (period) {
        case 'day':
          dateFormat = '%Y-%m-%d';
          break;
        case 'month':
          dateFormat = '%Y-%m';
          break;
        case 'year':
          dateFormat = '%Y';
          break;
        default: // week
          dateFormat = '%Y-%u';
      }

      const query = `
        SELECT 
          DATE_FORMAT(collected_at, ?) as period,
          COUNT(*) as total_collections,
          SUM(weight) as total_weight,
          COUNT(DISTINCT operator_id) as unique_operators,
          COUNT(DISTINCT area_id) as unique_areas
        FROM waste_collection_tbl 
        WHERE collected_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
        GROUP BY DATE_FORMAT(collected_at, ?)
        ORDER BY period DESC
        LIMIT 52
      `;

      const [stats]: any = await pool.execute(query, [dateFormat, dateFormat]);

      // Get top operators
      const topOperatorsQuery = `
        SELECT 
          op.Username as operator_name,
          COUNT(*) as total_collections,
          SUM(wc.weight) as total_weight
        FROM waste_collection_tbl wc
        JOIN accounts_tbl op ON wc.operator_id = op.Account_id
        WHERE wc.collected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY wc.operator_id, op.Username
        ORDER BY total_weight DESC
        LIMIT 10
      `;

      const [topOperators]: any = await pool.execute(topOperatorsQuery);

      // Get top areas
      const topAreasQuery = `
        SELECT 
          a.Area_Name as area_name,
          COUNT(*) as total_collections,
          SUM(wc.weight) as total_weight
        FROM waste_collection_tbl wc
        JOIN area_tbl a ON wc.area_id = a.Area_id
        WHERE wc.collected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY wc.area_id, a.Area_Name
        ORDER BY total_weight DESC
        LIMIT 10
      `;

      const [topAreas]: any = await pool.execute(topAreasQuery);

      res.json({
        success: true,
        data: {
          timeline: stats,
          topOperators,
          topAreas
        }
      });

    } catch (error) {
      console.error('Error getting collection stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
