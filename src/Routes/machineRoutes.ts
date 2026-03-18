import { Router } from "express";
import * as machineController from "../controllers/machineController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

// Base mounting path expected to be: /api/machines
router.get("/", machineController.getAllMachines);
router.post("/", authenticate, machineController.createMachine);

router.get("/statuses", machineController.getMachineStatuses);
router.get("/areas", authenticate, machineController.getAreas);

router.get("/:id", machineController.getMachineById);
router.put("/:id", machineController.updateMachine);
//router.delete("/:id", machineController.deleteMachine);

export default router;
