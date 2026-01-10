import * as service from "../services/maintenanceService.js";
import type { Request, Response } from "express";
import { checkUserRole } from "./userController.js";

export async function createTicket(req: Request, res: Response) {
  try {
    const ticket = await service.createTicket(req.body);
    return res.status(201).json(ticket);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function acceptAndAssign(req: Request, res: Response) {
  try {
    if (!checkUserRole(req, res, ['Admin', 'Barangay'])) return;

    const requestId = Number(req.params.id);
    const staffAccountId = Number(req.body.staff_account_id);
    const assignTo = req.body.assign_to ?? null;

    // ✅ NEW
    const priority = typeof req.body.priority === "string" ? req.body.priority : (req.body.priority ?? null);
    const dueDate = typeof req.body.due_date === "string" ? req.body.due_date : (req.body.due_date ?? null);

    const updated = await service.acceptAndAssign(requestId, staffAccountId, assignTo, priority, dueDate);
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

export async function addRemarks(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const remarks = req.body.remarks;
    
    if (!remarks || typeof remarks !== 'string') {
      return res.status(400).json({ message: "Remarks is required" });
    }
    
    const updated = await service.addRemarksToTicket(requestId, remarks);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function cancelTicket(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const actorAccountId = Number(req.body.actor_account_id);

    // ✅ optional for staff/admin, REQUIRED for operator (enforced in service)
    const reason = req.body.reason;

    const updated = await service.cancelTicket(requestId, actorAccountId, reason);
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
    const filters: { status?: string; assigned_to?: number; created_by?: number } = {};

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.assigned_to !== undefined) {
      const n = Number(req.query.assigned_to);
      if (Number.isNaN(n)) return res.status(400).json({ message: "assigned_to must be a number" });
      filters.assigned_to = n;
    }

    if (req.query.created_by !== undefined) {
      const n = Number(req.query.created_by);
      if (Number.isNaN(n)) return res.status(400).json({ message: "created_by must be a number" });
      filters.created_by = n;
    }

    const rows = await service.listTickets(filters);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: "Server error" });
  }
}

export async function uploadAttachment(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const uploadedBy = Number(req.body.uploaded_by);
    const filepath = req.body.filepath;
    const filename = req.body.filename;
    const filetype = req.body.filetype;
    const filesize = req.body.filesize ? Number(req.body.filesize) : undefined;

    // ✅ NEW
    const publicId = req.body.public_id ?? null;

    if (!filepath || !filename) {
      return res.status(400).json({ message: "Filepath and filename are required" });
    }

    const attachment = await service.addAttachment(
      requestId,
      uploadedBy,
      filepath,
      filename,
      filetype,
      filesize,
      publicId // ✅ pass through
    );

    return res.status(201).json(attachment);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getAttachments(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);

    // ✅ optional cutoff
    const beforeRaw =
      typeof req.query.before === 'string' ? req.query.before : undefined;

    let before: Date | undefined;
    if (beforeRaw) {
      before = new Date(beforeRaw);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: "Invalid before datetime" });
      }
    }

    const attachments = await service.getTicketAttachments(requestId, before);
    return res.json(attachments);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getPriorities(req: Request, res: Response) {
  try {
    const priorities = await service.getAllPriorities();
    return res.json(priorities);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch priorities" });
  }
}

// Add these new functions to your existing maintenanceController.ts

export async function addRemark(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const { remark_text, created_by, user_role } = req.body;
    
    if (!remark_text || typeof remark_text !== 'string') {
      return res.status(400).json({ message: "Remark text is required" });
    }
    
    if (!created_by) {
      return res.status(400).json({ message: "Created_by is required" });
    }
    
    const remark = await service.addRemark(
      requestId, 
      remark_text, 
      created_by,
      user_role || null
    );
    return res.status(201).json(remark);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getRemarks(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);

    // ✅ optional cutoff
    const beforeRaw =
      typeof req.query.before === 'string' ? req.query.before : undefined;

    let before: Date | undefined;
    if (beforeRaw) {
      before = new Date(beforeRaw);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: "Invalid before datetime" });
      }
    }

    const remarks = await service.getTicketRemarks(requestId, before);
    return res.json(remarks);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function deleteTicket(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);

    const actorRaw =
      (req.body?.actor_account_id as unknown) ??
      (req.query?.actor_account_id as unknown);

    const actorAccountId = Number(actorRaw);

    const reasonRaw =
      (req.body?.reason as unknown) ??
      (req.query?.reason as unknown);

    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";

    if (!actorAccountId || Number.isNaN(actorAccountId)) {
      return res.status(400).json({ message: "actor_account_id is required" });
    }

    // ✅ require a reason for delete
    if (!reason) {
      return res.status(400).json({ message: "reason is required" });
    }

    const result = await service.deleteTicket(requestId, actorAccountId, reason);
    return res.json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listOperatorCancelledHistory(req: Request, res: Response) {
  try {
    const operatorId = Number(req.query.operator_account_id);
    if (!operatorId || Number.isNaN(operatorId)) {
      return res.status(400).json({ message: "operator_account_id must be a number" });
    }

    const rows = await service.listOperatorCancelledHistory(operatorId);
    return res.json(rows);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listDeletedTickets(req: Request, res: Response) {
  try {
    // ✅ Only Admin and Barangay can view deleted compilation
    if (!checkUserRole(req, res, ["Admin", "Barangay"])) return;

    const rows = await service.listDeletedTickets();
    return res.json(rows);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getTicketEvents(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const events = await service.getTicketEvents(requestId);
    return res.json(events);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getEventDetails(req: Request, res: Response) {
  try {
    const eventId = Number(req.params.eventId);
    const eventDetails = await service.getEventDetails(eventId);
    
    if (!eventDetails) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    return res.json(eventDetails);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}