import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import clinicsRouter from "./clinics";
import servicesRouter from "./services";
import professionalsRouter from "./professionals";
import patientsRouter from "./patients";
import appointmentsRouter from "./appointments";
import aiLogsRouter from "./ai-logs";
import handoffsRouter from "./handoffs";
import whatsappRouter from "./whatsapp";
import metaWebhookRouter from "./meta-webhook";
import mercadoPagoWebhookRouter from "./mercadopago-webhook";
import usersRouter from "./users";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Rotas públicas (sem autenticação)
router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);  // bootstrap é público; /admin/clinics tem requireAuth dentro
router.use(whatsappRouter);
router.use(metaWebhookRouter);        // Webhook WhatsApp Meta Cloud API
router.use(mercadoPagoWebhookRouter); // Webhook Mercado Pago

// Configuração pública — App ID Meta (usado pelo Facebook JS SDK no frontend)
router.get("/meta-config", (_req, res) => {
  res.json({ appId: process.env.META_APP_ID ?? null });
});

// Todas as rotas abaixo exigem token JWT válido
router.use(requireAuth);

// Garante que o clinicId na URL corresponde ao clinicId do token JWT
router.use((req, res, next) => {
  const match = req.path.match(/^\/clinics\/(\d+)/);
  if (match) {
    const pathClinicId = Number(match[1]);
    if (pathClinicId !== req.auth?.clinicId) {
      res.status(403).json({ error: "Acesso negado a esta clínica" });
      return;
    }
  }
  next();
});

router.use(clinicsRouter);
router.use(servicesRouter);
router.use(professionalsRouter);
router.use(patientsRouter);
router.use(appointmentsRouter);
router.use(aiLogsRouter);
router.use(handoffsRouter);
router.use(usersRouter);

export default router;

