import { Router } from "express";
import * as wcController from "../controllers/wasteContainerController";

const router = Router();

router.get("/", wcController.listContainers);
router.post("/", wcController.createContainer);

export default router;