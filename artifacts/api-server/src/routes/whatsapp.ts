import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicsTable } from "@workspace/db";
import { WhatsappWebhookBody, WhatsappWebhookResponse } from "@workspace/api-zod";
import { processWhatsAppMessage, transcribeAudio } from "../lib/ai-orchestrator";

const router: IRouter = Router();

/**
 * Main WhatsApp webhook endpoint.
 * Receives messages from Evolution API or Baileys-compatible setups.
 * Identifies the clinic by API key, loads its AI config, and responds
 * using OpenAI Function Calling to handle scheduling and FAQ queries.
 */
router.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  const parsed = WhatsappWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid WhatsApp webhook payload");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { apiKey, from, message, audioUrl, messageType } = parsed.data;

  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.apiKey, apiKey));

  if (!clinic) {
    req.log.warn({ apiKey }, "Unknown clinic API key");
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.log.info({ clinicId: clinic.id, from, messageType }, "Processing WhatsApp message");

  let userMessage = message;

  if (messageType === "audio" && audioUrl) {
    try {
      req.log.info({ audioUrl }, "Transcribing audio message via Whisper");
      userMessage = await transcribeAudio(audioUrl);
      req.log.info({ transcript: userMessage }, "Audio transcribed successfully");
    } catch (err) {
      req.log.error({ err }, "Failed to transcribe audio, falling back to original message");
    }
  }

  const result = await processWhatsAppMessage({
    clinicId: clinic.id,
    patientPhone: from,
    userMessage,
    messageType: messageType as "text" | "audio",
    clinic: {
      id: clinic.id,
      aiName: clinic.aiName,
      aiPersonalityPrompt: clinic.aiPersonalityPrompt,
      knowledgeBase: clinic.knowledgeBase,
      clinicType: clinic.clinicType,
    },
  });

  req.log.info({ clinicId: clinic.id, tokensUsed: result.tokensUsed }, "AI response generated");

  res.json(WhatsappWebhookResponse.parse({
    reply: result.reply,
    appointmentId: result.appointmentId ?? null,
  }));
});

export default router;
