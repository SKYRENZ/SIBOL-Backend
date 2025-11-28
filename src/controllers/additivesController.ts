import { Request, Response } from 'express';
import * as service from '../services/additivesService';

export const createAdditive = async (req: Request, res: Response) => {
  try {
    const {
      machine_id,
      additive_input,
      stage,
      value,
      units,
      date,
      time,
      person_in_charge,
    } = req.body;

    // basic validation
    if (!machine_id || !additive_input || !stage || value === undefined || !units || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const insertId = await service.createAdditive({
      machine_id: Number(machine_id),
      additive_input: String(additive_input),
      stage: String(stage),
      value: Number(value),
      units: String(units),
      date: String(date),
      time: String(time),
      person_in_charge: person_in_charge ? String(person_in_charge) : undefined,
    });

    return res.status(201).json({ id: insertId });
  } catch (err) {
    console.error('createAdditive error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAdditives = async (req: Request, res: Response) => {
  try {
    const machine_id = req.query.machine_id ? Number(req.query.machine_id) : undefined;
    const rows = await service.getAdditives({ machine_id });
    return res.json(rows);
  } catch (err) {
    console.error('listAdditives error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};