import { Router } from "express";
import * as machineController from "../controllers/machineController";

const router = Router();

// Base mounting path expected to be: /api/machines
router.get("/", machineController.getAllMachines);
router.post("/", machineController.createMachine);

router.get("/statuses", machineController.getMachineStatuses);
router.get("/areas", machineController.getAreas);

router.get("/:id", machineController.getMachineById);
router.put("/:id", machineController.updateMachine);
//router.delete("/:id", machineController.deleteMachine);

export default router;