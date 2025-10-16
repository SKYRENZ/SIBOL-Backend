import { Router } from "express";
import * as scheduleController from "../controllers/scheduleController";

const router = Router();

router.post("/", scheduleController.create);
router.get("/:id", scheduleController.getById);
router.put("/:id", scheduleController.update);
router.delete("/:id", scheduleController.remove);
router.get("/", scheduleController.list);

export default router;