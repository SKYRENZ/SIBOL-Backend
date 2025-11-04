import { Router } from "express";
import * as wasteContainerController from "../controllers/wasteContainerController";

const router = Router();

router.get("/", wasteContainerController.list);
router.post("/", wasteContainerController.create);

export default router;