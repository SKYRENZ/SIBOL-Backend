import { Request, Response } from 'express';
import FiltersService from '../services/filtersService';

export const FiltersController = {
  async getAll(req: Request, res: Response) {
    try {
      const data = await FiltersService.getAllFilters();
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },

  async getByType(req: Request, res: Response) {
    try {
      const type = req.params.type;
      if (!type) {
        return res.status(400).json({ success: false, message: 'Filter type is required' });
      }

      const data = await FiltersService.getByType(type);
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Bad request' });
    }
  }
};

export default FiltersController;