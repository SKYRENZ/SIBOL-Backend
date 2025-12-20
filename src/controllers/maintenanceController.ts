import * as service from "../services/maintenanceService.js";
import type { Request, Response } from "express";
import { checkUserRole } from "./userController.js"; // ✅ Import the reusable function

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
    // ✅ Only Admin and Barangay can accept
    if (!checkUserRole(req, res, ['Admin', 'Barangay'])) {
      return; // Response already sent by checkUserRole
    }

    const requestId = Number(req.params.id);
    const staffAccountId = Number(req.body.staff_account_id);
    const assignTo = req.body.assign_to ?? null;
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
    const filters: { status?: string; assigned_to?: number; created_by?: number } = {};
    
    if (req.query.status) {
      filters.status = req.query.status as string;
    }
    
    if (req.query.assigned_to) {
      filters.assigned_to = Number(req.query.assigned_to);
    }
    
    if (req.query.created_by) {
      filters.created_by = Number(req.query.created_by);
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

    if (!filepath || !filename) {
      return res.status(400).json({ message: "Filepath and filename are required" });
    }

    const attachment = await service.addAttachment(
      requestId, 
      uploadedBy, 
      filepath, 
      filename,
      filetype,
      filesize
    );
    return res.status(201).json(attachment);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getAttachments(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const attachments = await service.getTicketAttachments(requestId);
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