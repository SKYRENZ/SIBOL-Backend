import * as service from "../services/maintenanceService.js";
import type { Request, Response } from "express";
import { normalizeAttachmentFolder } from "../middleware/maintenanceUpload.js";

export async function createTicket(req: Request, res: Response) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const title = req.body.title?.trim();
    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const createdBy = Number(req.body.created_by);
    if (!Number.isFinite(createdBy)) {
      return res.status(400).json({ message: "Creator account not found" });
    }

    // --- File Handling Logic ---
    const castReq = req as Request & { file?: Express.Multer.File };
    const uploadedFile = castReq.file ?? null;
    const storedAttachment = uploadedFile
      ? `/uploads/${uploadedFile.filename}`
      : null; // Changed undefined to null
    // --- End File Handling Logic ---

    const ticket = await service.createTicket({
      title,
      details: req.body.details || null,
      priority: req.body.priority || null,
      created_by: createdBy,
      due_date: req.body.due_date || null,
      attachment: storedAttachment, // Pass the file path to the service
    });

    return res.status(201).json(ticket);
  } catch (err: any) {
    console.error("[maintenanceController.createTicket] Error:", err);
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function acceptAndAssign(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const staffAccountId = Number(req.body.staff_account_id);
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });
    if (!Number.isFinite(staffAccountId)) return res.status(400).json({ message: "staff_account_id is required" });

    const assignRaw = req.body.assign_to ?? req.body.assignTo ?? req.body.assigned_to;
    const assignTo =
      assignRaw === undefined || assignRaw === null || `${assignRaw}`.trim() === ""
        ? NaN
        : Number(assignRaw);
    if (!Number.isFinite(assignTo)) return res.status(400).json({ message: "assign_to is required" });

    const dueDate = typeof req.body.due_date === "string" ? req.body.due_date.trim() : "";
    if (!dueDate) return res.status(400).json({ message: "Due date is required" });

    const priority =
      typeof req.body.priority === "string" && req.body.priority.trim()
        ? req.body.priority.trim()
        : undefined;

    const castReq = req as Request & {
      file?: Express.Multer.File;
      sanitizedAttachmentFolder?: string;
    };

    const uploadedFile = castReq.file ?? null;
    const normalizedFolder = uploadedFile
      ? normalizeAttachmentFolder(castReq.sanitizedAttachmentFolder)
      : undefined;

    const storedAttachment = uploadedFile
      ? `/uploads/${normalizedFolder ? `${normalizedFolder}/` : ""}${uploadedFile.filename}`
      : undefined;

    const updateOptions: { priority?: string; due_date: string; attachment?: string } = {
      due_date: dueDate,
    };
    if (priority) {
      updateOptions.priority = priority;
    }
    if (storedAttachment !== undefined) {
      updateOptions.attachment = storedAttachment;
    }

    const updated = await service.acceptAndAssign(
      requestId,
      staffAccountId,
      assignTo,
      updateOptions
    );

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

export async function addRemarks(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const remarks =
      typeof req.body.remarks === "string" ? req.body.remarks.trim() : undefined;

    const castReq = req as Request & {
      file?: Express.Multer.File;
      sanitizedAttachmentFolder?: string;
    };

    const uploadedFile = castReq.file ?? null;
    const normalizedFolder = uploadedFile
      ? normalizeAttachmentFolder(castReq.sanitizedAttachmentFolder)
      : undefined;

    const storedAttachment = uploadedFile
      ? `/uploads/${normalizedFolder ? `${normalizedFolder}/` : ""}${uploadedFile.filename}`
      : undefined;

    const updated = await service.addRemarks(requestId, remarks, storedAttachment);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}