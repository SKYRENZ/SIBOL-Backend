import { Router } from "express";
import * as ctrl from "../controllers/maintenanceController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

/**
 * POST /api/maintenance
 * body: { title, details?, priority?, created_by, due_date?, attachment? }
 * - Only Operator (role 3) should create (service enforces)
 */
router.post("/", ctrl.createTicket);

/**
 * GET /api/maintenance/priorities
 * Get all priority levels
 */
router.get("/priorities", ctrl.getPriorities);

/**
 * PUT /api/maintenance/:id/accept
 * body: { staff_account_id, assign_to? } 
 * - staff_account_id: account id of Barangay_staff performing acceptance
 * - assign_to: account id of Operator to assign (optional)
 */
router.put("/:id/accept", authenticate, ctrl.acceptAndAssign);

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
router.put("/:id/mark-for-verification", ctrl.operatorMarkForVerification); // Add this alias

/**
 * PUT /api/maintenance/:id/verify
 * body: { staff_account_id }
 * - Barangay_staff verifies completion -> final Completed status
 */
router.put("/:id/verify", ctrl.staffVerifyCompletion);
router.put("/:id/verify-completion", ctrl.staffVerifyCompletion); // Add this alias

/**
 * PUT /api/maintenance/:id/remarks
 * body: { remarks }
 * - Add remarks to the maintenance ticket
 */
router.put("/:id/remarks", ctrl.addRemarks); // Add this new endpoint

/**
 * POST /api/maintenance/:id/remarks
 * body: { remark_text, created_by, user_role? }
 * - Add a remark to the maintenance ticket
 */
router.post("/:id/remarks", ctrl.addRemark);

/**
 * GET /api/maintenance/:id/remarks
 * - Get all remarks for a maintenance ticket
 */
router.get("/:id/remarks", ctrl.getRemarks);

/**
 * PUT /api/maintenance/:id/cancel
 * body: { actor_account_id, reason? }
 * - Operator: reason REQUIRED (creates cancel request only)
 * - Staff/Admin: reason optional (cancels immediately)
 */
router.put("/:id/cancel", authenticate, ctrl.cancelTicket);

/**
 * GET /api/maintenance/operator-cancelled-history?operator_account_id=123
 * - Approved cancellation history for operator (for Operator Cancelled tab)
 */
router.get("/operator-cancelled-history", authenticate, ctrl.listOperatorCancelledHistory);

/**
 * GET /api/maintenance/deleted
 * - list all soft-deleted tickets
 */
router.get("/deleted", authenticate, ctrl.listDeletedTickets);

/**
 * GET /api/maintenance/:id
 */
router.get("/:id", ctrl.getTicket);

/**
 * GET /api/maintenance
 * optional query params: status, assigned_to, created_by
 */
router.get("/", ctrl.listTickets);

/**
 * POST /api/maintenance/:id/attachments
 * body: { uploaded_by, filepath, filename, filetype?, filesize? }
 */
router.post("/:id/attachments", ctrl.uploadAttachment);

/**
 * GET /api/maintenance/:id/attachments
 */
router.get("/:id/attachments", ctrl.getAttachments);

/**
 * DELETE /api/maintenance/:id
 * body: { actor_account_id }
 * - Staff/Admin can delete only Requested or Cancel Requested tickets
 */
router.delete("/:id", authenticate, ctrl.deleteTicket);

export default router;