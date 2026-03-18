import { Router } from "express";
import * as wcController from "../controllers/wasteContainerController";

const router = Router();

router.get("/", wcController.listContainers);
router.post("/", wcController.createContainer);
router.patch("/:container_id/location", wcController.updateContainerLocation);

export default router;