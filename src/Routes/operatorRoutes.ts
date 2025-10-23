import { Router } from "express";
import * as operatorController from "../controllers/operatorController";

const router = Router();

router.get("/", operatorController.list);

export default router;