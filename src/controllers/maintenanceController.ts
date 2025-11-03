import * as service from "../services/maintenanceService.js";
import type { Request, Response } from "express";
import { normalizeAttachmentFolder } from "../middleware/maintenanceUpload.js";

export async function createTicket(req: Request, res: Response) {
  try {
    const {
      title,
      details,
      priority,
      created_by,
      due_date,
      attachment,
      attachment_folder,
    } = req.body as Record<string, any>;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    const creatorId = Number(created_by);
    if (!Number.isFinite(creatorId)) {
      return res.status(400).json({ message: "created_by is required" });
    }

    const castReq = req as Request & {
      file?: Express.Multer.File;
      sanitizedAttachmentFolder?: string;
    };

    const uploadedFile = castReq.file ?? null;
    const folderFromMiddleware = castReq.sanitizedAttachmentFolder;
    const normalizedFolder = uploadedFile
      ? normalizeAttachmentFolder(folderFromMiddleware ?? (attachment_folder as string | undefined))
      : typeof attachment_folder === "string" && attachment_folder.trim()
      ? normalizeAttachmentFolder(attachment_folder, "")
      : null;

    const storedAttachment = uploadedFile
      ? `/uploads/${normalizedFolder ? `${normalizedFolder}/` : ""}${uploadedFile.filename}`
      : attachment ?? null;

    const payload: Parameters<typeof service.createTicket>[0] = {
      title: String(title).trim(),
      created_by: creatorId,
    };

    const detailText =
      typeof details === "string" && details.trim() ? String(details).trim() : undefined;
    if (detailText) payload.details = detailText;

    if (priority) payload.priority = priority;
    if (typeof due_date === "string" && due_date.trim()) payload.due_date = due_date;
    if (due_date === null) payload.due_date = null;
    if (storedAttachment) payload.attachment = storedAttachment;
    if (normalizedFolder) payload.attachment_folder = normalizedFolder;

    const ticket = await service.createTicket(payload);
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
    const { status, assigned_to, created_by } = req.query;
    const filters: any = {};
    if (status) filters.status = status;
    if (assigned_to) filters.assigned_to = Number(assigned_to);
    if (created_by) filters.created_by = Number(created_by);

    console.log('[listTickets] filters:', filters);
    const tickets = await service.listTickets(filters);
    console.log('[listTickets] result count:', tickets.length);
    return res.json(tickets);
  } catch (err: any) {
    console.error('[listTickets] error:', err);
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listOperators(_req: Request, res: Response) {
  try {
    const operators = await service.listOperatorsForAssignment();
    return res.json(operators);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}