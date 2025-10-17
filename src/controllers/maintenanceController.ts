import * as service from "../services/maintenanceService.js";
import type { Request, Response } from "express";

export async function createTicket(req: Request, res: Response) {
  try {
    // expected body: { title, details?, priority?, created_by, due_date?, attachment? }
    const ticket = await service.createTicket(req.body);
    return res.status(201).json(ticket);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function acceptAndAssign(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const staffAccountId = Number(req.body.staff_account_id); // staff performing action
    const assignTo = req.body.assign_to ?? null; // operator account id to assign or null
    const updated = await service.acceptAndAssign(requestId, staffAccountId, assignTo);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function markOnGoing(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const operatorAccountId = Number(req.body.operator_account_id);
    const updated = await service.markOnGoingByOperator(requestId, operatorAccountId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function operatorMarkForVerification(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const operatorAccountId = Number(req.body.operator_account_id);
    const updated = await service.operatorMarkForVerification(requestId, operatorAccountId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function staffVerifyCompletion(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const staffAccountId = Number(req.body.staff_account_id);
    const updated = await service.staffVerifyCompletion(requestId, staffAccountId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function cancelTicket(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const actorAccountId = Number(req.body.actor_account_id);
    const updated = await service.cancelTicket(requestId, actorAccountId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getTicket(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const ticket = await service.getTicketById(requestId);
    return res.json(ticket);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listTickets(req: Request, res: Response) {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      assigned_to: req.query.assigned_to ? Number(req.query.assigned_to) : undefined,
      created_by: req.query.created_by ? Number(req.query.created_by) : undefined,
    };
    const rows = await service.listTickets(filters);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: "Server error" });
  }
}