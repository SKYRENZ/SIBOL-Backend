import { Router } from "express";
import * as wasteInputController from "../controllers/wasteInputController";

const router = Router();

// Base mounting path expected to be: /api/waste-inputs

// POST - Create new waste input
router.post("/", wasteInputController.createWasteInput);

// GET - Get all waste inputs
router.get("/", wasteInputController.getAllWasteInputs);

// GET - Get waste inputs by date range
router.get("/date-range", wasteInputController.getWasteInputsByDateRange);

// GET - Get waste inputs by machine ID
router.get("/machine/:machineId", wasteInputController.getWasteInputsByMachineId);

// GET - Get waste inputs by account/operator ID
router.get("/account/:accountId", wasteInputController.getWasteInputsByAccountId);

// GET - Get specific waste input by ID
router.get("/:id", wasteInputController.getWasteInputById);

export default router;