import { Router } from "express";
import * as ctrl from "../controllers/maintenanceController.js";

const router = Router();

/**
 * POST /api/maintenance
 * body: { title, details?, priority?, created_by, due_date?, attachment? }
 * - Only Operator (role 3) should create (service enforces)
 */
router.post("/", ctrl.createTicket);

/**
 * PUT /api/maintenance/:id/accept
 * body: { staff_account_id, assign_to? } 
 * - staff_account_id: account id of Barangay_staff performing acceptance
 * - assign_to: account id of Operator to assign (optional)
 */
router.put("/:id/accept", ctrl.acceptAndAssign);

/**
 * PUT /api/maintenance/:id/ongoing
 * body: { operator_account_id }
 * - assigned operator marks ticket as On-going
 */
router.put("/:id/ongoing", ctrl.markOnGoing);

/**
 * PUT /api/maintenance/:id/for-verification
 * body: { operator_account_id }
 * - assigned operator marks task finished and requests staff verification
 */
router.put("/:id/for-verification", ctrl.operatorMarkForVerification);

/**
 * PUT /api/maintenance/:id/verify
 * body: { staff_account_id }
 * - Barangay_staff verifies completion -> final Completed status
 */
router.put("/:id/verify", ctrl.staffVerifyCompletion);

/**
 * PUT /api/maintenance/:id/cancel
 * body: { actor_account_id }
 * - creator (operator) or staff can cancel
 */
router.put("/:id/cancel", ctrl.cancelTicket);

/**
 * GET /api/maintenance/:id
 */
router.get("/:id", ctrl.getTicket);

/**
 * GET /api/maintenance
 * optional query params: status, assigned_to, created_by
 */
router.get("/", ctrl.listTickets);

export default router;