import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clinicsRouter from "./clinics";
import servicesRouter from "./services";
import appointmentsRouter from "./appointments";
import aiLogsRouter from "./ai-logs";
import whatsappRouter from "./whatsapp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clinicsRouter);
router.use(servicesRouter);
router.use(appointmentsRouter);
router.use(aiLogsRouter);
router.use(whatsappRouter);

export default router;
