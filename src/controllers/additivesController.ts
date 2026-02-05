import { Request, Response } from 'express';
import * as service from '../services/additivesService';

export const createAdditive = async (req: Request, res: Response) => {
  try {
    const { machine_id, additive_type_id, stage, value, units } = req.body;

    if (!machine_id || !additive_type_id || value === undefined || !units) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload: Parameters<typeof service.createAdditive>[0] = {
      machine_id: Number(machine_id),
      additive_type_id: Number(additive_type_id),
      stage: stage ? String(stage) : 'N/A',
      value: Number(value),
      units: String(units),
      account_id: req.user?.Account_id ?? null,
    };

    if (req.user?.Username) {
      payload.person_in_charge = req.user.Username;
    }

    const insertId = await service.createAdditive(payload);

    return res.status(201).json({ id: insertId });
  } catch (err) {
    console.error('createAdditive error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAdditives = async (req: Request, res: Response) => {
  try {
    const machine_id = req.query.machine_id ? Number(req.query.machine_id) : undefined;
    const rows = machine_id
      ? await service.getAdditives({ machine_id })
      : await service.getAdditives();
    return res.json(rows);
  } catch (err) {
    console.error('listAdditives error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAdditiveTypes = async (_req: Request, res: Response) => {
  try {
    const rows = await service.getAdditiveTypes();
    return res.json(rows);
  } catch (err) {
    console.error('listAdditiveTypes error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};