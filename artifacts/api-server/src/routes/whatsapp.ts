import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, clinicsTable, aiLogsTable, handoffsTable, handoffMessagesTable, patientsTable } from "@workspace/db";
import { WhatsappWebhookBody, WhatsappWebhookResponse } from "@workspace/api-zod";
import { processWhatsAppMessage, transcribeAudio, buildAvailabilityList } from "../lib/ai-orchestrator";
import { sendTextMessage, sendTypingPresence, sendListMessage, sendButtonMessage, isEvolutionConfigured, resolveLidPhone } from "../lib/evolution-api";
import { clinicToChannel, waList, waTyping } from "../lib/whatsapp-provider";
import { detectsHumanRequest } from "../lib/auto-handoff";
import {
  isSchedulingIntent,
  isManagementIntent,
  hasActiveSchedulingSession,
  handleSchedulingSelection,
  handleSchedulingFreeText,
  startSchedulingFlow,
  startManagementFlow,
  clearSchedulingSession,
} from "../lib/scheduling-flow";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Webhook genérico (formato legado customizado)
// Utilizado por integrações que enviam { apiKey, from, message, ... }
// ─────────────────────────────────────────────────────────────────────────────
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
      schedulingEnabled: clinic.schedulingEnabled ?? true,
    },
  });

  req.log.info({ clinicId: clinic.id, tokensUsed: result.tokensUsed }, "AI response generated");

  res.json(WhatsappWebhookResponse.parse({
    reply: result.reply,
    appointmentId: result.appointmentId ?? null,
    interactiveList: result.interactiveList ?? null,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Evolution API
//
// Suporta dois modos:
//   1. webhookByEvents=false → POST /api/whatsapp/evolution  (campo "event" no body)
//   2. webhookByEvents=true  → POST /api/whatsapp/evolution/MESSAGES_UPSERT  (sufixo)
//                              POST /api/whatsapp/evolution/MESSAGES_UPDATE
// ─────────────────────────────────────────────────────────────────────────────

// Rotas com sufixo (webhookByEvents=true) — normaliza para o handler principal
router.post("/whatsapp/evolution/MESSAGES_UPSERT", (req, res, next) => {
  req.body = { ...req.body, event: "messages.upsert" };
  next();
}, handleEvolutionWebhook);

router.post("/whatsapp/evolution/MESSAGES_UPDATE", (req, res, next) => {
  req.body = { ...req.body, event: "messages.update" };
  next();
}, handleEvolutionWebhook);

// Rota base (webhookByEvents=false)
router.post("/whatsapp/evolution", handleEvolutionWebhook);

async function handleEvolutionWebhook(req: Request, res: Response): Promise<void> {
  // Responde imediatamente com 200 para não bloquear a Evolution API
  res.status(200).json({ ok: true });

  // Wrapper de segurança: exceções não tratadas após res.json() seriam capturadas pelo
  // Express 5, abortando silenciosamente o handler antes de enviar a resposta ao paciente.
  try {
  const payload = req.body as EvolutionWebhookPayload;
  const { event, instance, data } = payload ?? {};
  if (!event || !instance) return;

  // ── Atualização de status (DELIVERY_ACK, READ, etc.) ─────────────────────
  if (event === "messages.update") {
    const updates: EvolutionStatusUpdate[] = Array.isArray(data) ? data : [data];
    for (const update of updates) {
      const msgId = update?.key?.id;
      const status = update?.update?.status;
      if (!msgId || !status) continue;
      try {
        await db.update(aiLogsTable).set({ deliveryStatus: status }).where(eq(aiLogsTable.whatsappMessageId, msgId));
        req.log.info({ msgId, status, instance }, "[Evolution] Status de entrega atualizado");
      } catch (err) {
        req.log.error({ err, msgId }, "[Evolution] Erro ao atualizar status de entrega");
      }
    }
    return;
  }

  // ── Mensagem recebida ─────────────────────────────────────────────────────
  if (event !== "messages.upsert") return;

  const msgData = data as EvolutionMessageData;
  if (msgData?.key?.fromMe) return;
  const remoteJid = msgData?.key?.remoteJid ?? "";
  if (remoteJid.endsWith("@g.us")) return;

  // Log do remoteJid bruto para diagnóstico de formato (WA multi-device usa {phone}:{deviceId}@s.whatsapp.net)
  req.log.debug({ remoteJid, instance }, "[Evolution] remoteJid bruto recebido");

  // replyJid: JID normalizado usado para ENVIAR a resposta via Evolution API.
  // - Remove device ID (ex: "5511999:5@s.whatsapp.net" → "5511999@s.whatsapp.net")
  // - Preserva @lid (WhatsApp Privacy Mode — ex: "117871283851460@lid" → inalterado)
  // - Preserva qualquer outro sufixo (@c.us, etc.)
  // Usar replyJid nas chamadas de envio garante que a resposta chegue ao remetente correto,
  // incluindo usuários com WhatsApp em modo de privacidade (JID @lid).
  const replyJid = (() => {
    if (!remoteJid.includes("@")) return remoteJid;
    const atIdx = remoteJid.indexOf("@");
    const user = remoteJid.slice(0, atIdx).split(":")[0]; // remove :deviceId
    const suffix = remoteJid.slice(atIdx); // preserva @s.whatsapp.net / @lid / @c.us
    return `${user}${suffix}`;
  })();

  // rawPhone: identificador estável do remetente para operações no banco de dados.
  // Para JIDs @lid (WhatsApp Privacy Mode): usa o JID completo "XXXXXXXX@lid" como chave.
  //   O número real de telefone NÃO é acessível via Evolution API — o @lid é o único
  //   identificador disponível. toJid() em evolution-api.ts preserva @lid ao enviar.
  // Para demais JIDs (@s.whatsapp.net, @c.us): somente dígitos do número de telefone.
  const rawPhone = replyJid.endsWith("@lid")
    ? replyJid
    : replyJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
  if (!rawPhone) return;

  // pushName: nome de exibição WhatsApp (ex: "Maria Silva"). Disponível no webhook mesmo
  // para JIDs @lid — usado para pré-cadastrar paciente sem precisar a IA perguntar o nome.
  const pushName = msgData.pushName?.trim() || null;

  const msgType = msgData.messageType ?? "";
  const isAudio = msgType === "audioMessage" || msgType === "pttMessage";
  const isListResponse = msgType === "listResponseMessage";
  const isButtonResponse = msgType === "buttonsResponseMessage";

  // ── Extrai texto dependendo do tipo de mensagem ───────────────────────────
  let textMessage = "";
  let paginationAction: { date: string; serviceId?: number; professionalId?: number; offset: number } | null = null;
  let rawSelectedId = ""; // ID original para roteamento do fluxo de agendamento

  if (isListResponse) {
    const listMsg = msgData.message as EvolutionListResponseMessage | undefined;
    const listResp = listMsg?.listResponseMessage;
    const selectedId = listResp?.singleSelectReply?.selectedRowId ?? "";
    const selectedTitle = listResp?.title ?? "";
    rawSelectedId = selectedId;

    if (selectedId.startsWith("M|")) {
      // Paginação direta — será tratada sem envolver a IA
      const [, date, svcStr, profStr, offsetStr] = selectedId.split("|");
      paginationAction = {
        date,
        serviceId: svcStr ? Number(svcStr) : undefined,
        professionalId: profStr ? Number(profStr) : undefined,
        offset: Number(offsetStr) || 0,
      };
    } else if (selectedId.startsWith("DATE|") || /^date_\d{4}-\d{2}-\d{2}$/.test(selectedId)) {
      // Seleção de data de find_available_dates ou list_options normalizado
      const date = selectedId.startsWith("DATE|") ? selectedId.slice(5) : selectedId.slice(5);
      paginationAction = { date, offset: 0 };
    } else if (selectedId === "OD") {
      textMessage = "Quero ver horários em outro dia. Para qual data?";
    } else if (selectedId.startsWith("S|")) {
      // Slot selecionado: S|profId|svcId|isoSlot
      const [, profId, svcId, isoSlot] = selectedId.split("|");
      const time = new Date(isoSlot).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
      const dateStr = new Date(isoSlot).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
      textMessage = `[SELEÇÃO] Paciente selecionou ${time} em ${dateStr}. Use book_appointment com professionalId:${profId}${svcId ? ` serviceId:${svcId}` : ""} scheduledAt:${isoSlot}`;
    } else {
      // Opção genérica de list_options (serviço, profissional, confirmação, etc.)
      textMessage = selectedTitle || selectedId;
    }
  } else if (isButtonResponse) {
    const btnMsg = msgData.message as EvolutionButtonResponseMessage | undefined;
    const btnResp = btnMsg?.buttonsResponseMessage;
    const btnId = btnResp?.selectedButtonId ?? "";
    rawSelectedId = btnId;
    if (btnId.startsWith("DATE|") || /^date_\d{4}-\d{2}-\d{2}$/.test(btnId)) {
      const date = btnId.startsWith("DATE|") ? btnId.slice(5) : btnId.slice(5);
      paginationAction = { date, offset: 0 };
    } else {
      textMessage = btnResp?.selectedDisplayText ?? btnId;
    }
  } else {
    textMessage =
      msgData.message?.conversation ??
      msgData.message?.extendedTextMessage?.text ??
      "";
  }

  if (!isAudio && !isListResponse && !isButtonResponse && !textMessage.trim()) return;
  if ((isListResponse || isButtonResponse) && !textMessage && !paginationAction) return;

  // ── Busca clínica pela instância ──────────────────────────────────────────
  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.evolutionInstanceName, instance));
  if (!clinic) {
    req.log.warn({ instance }, "[Evolution] Instância não mapeada. Configure em Integrações > WhatsApp.");
    return;
  }

  // ── Mutex: ignora se clínica usa Meta API como provedor ───────────────────
  if (clinic.whatsappProvider === "meta") {
    req.log.debug({ instance, clinicId: clinic.id }, "[Evolution] Clínica configurada para Meta API — webhook Evolution ignorado");
    return;
  }

  const channel = clinicToChannel(clinic);
  // ── Pré-registro de paciente @lid via pushName + resolução automática ───────
  // Para usuários com WhatsApp Privacy Mode (@lid), tentamos resolver o número real
  // em duas etapas: (1) consulta onWhatsApp() nos servidores do WhatsApp via Evolution API,
  // (2) cache de contatos da instância. Se não resolver, o @lid fica como identificador
  // e a IA solicitará o número ao paciente durante a conversa.
  if (rawPhone.endsWith("@lid")) {
    try {
      // Busca paciente existente incluindo real_phone
      const [existingLidPatient] = await db
        .select({ id: patientsTable.id, name: patientsTable.name, realPhone: patientsTable.realPhone })
        .from(patientsTable)
        .where(and(eq(patientsTable.clinicId, clinic.id), eq(patientsTable.phone, rawPhone)))
        .limit(1);

      // Tentativa de resolução automática — apenas se real_phone ainda não está preenchido
      let resolvedRealPhone: string | null = null;
      if (!existingLidPatient?.realPhone) {
        // Fonte 1: remoteJidAlt do payload Baileys (disponível quando WhatsApp envia JID alternativo)
        // Contém o @s.whatsapp.net real quando remoteJid é @lid
        const altJid = msgData.key.remoteJidAlt;
        if (altJid && altJid.includes("@s.whatsapp.net")) {
          resolvedRealPhone = altJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
          req.log.info({ clinicId: clinic.id, rawPhone, altJid, resolvedRealPhone }, "[Evolution] Número real extraído de remoteJidAlt");
        }

        // Fonte 2: fallback via onWhatsApp() da Evolution API
        if (!resolvedRealPhone) {
          resolvedRealPhone = await resolveLidPhone(instance, rawPhone);
          if (resolvedRealPhone) {
            req.log.info({ clinicId: clinic.id, rawPhone, resolvedRealPhone }, "[Evolution] Número real resolvido via onWhatsApp() para @lid");
          }
        }
      }

      if (!existingLidPatient) {
        // Novo paciente: cadastra com pushName e real_phone (se resolvido)
        const patientName = pushName || "Desconhecido";
        await db.insert(patientsTable).values({
          clinicId: clinic.id,
          name: patientName,
          phone: rawPhone,
          realPhone: resolvedRealPhone,
        }).onConflictDoNothing();
        req.log.info({ clinicId: clinic.id, rawPhone, pushName: patientName, resolvedRealPhone }, "[Evolution] Paciente @lid cadastrado no primeiro contato");
      } else {
        // Paciente existente: atualiza nome se desconhecido e real_phone se recém-resolvido
        const updates: Record<string, string> = {};
        if (pushName && (!existingLidPatient.name || existingLidPatient.name === "Desconhecido")) {
          updates.name = pushName;
        }
        if (resolvedRealPhone && !existingLidPatient.realPhone) {
          updates.realPhone = resolvedRealPhone;
        }
        if (Object.keys(updates).length > 0) {
          await db.update(patientsTable).set(updates).where(eq(patientsTable.id, existingLidPatient.id));
          req.log.info({ clinicId: clinic.id, rawPhone, updates }, "[Evolution] Paciente @lid atualizado");
        }
      }
    } catch (err) {
      req.log.warn({ err }, "[Evolution] Falha no pré-registro/resolução de paciente @lid");
    }
  }

  // ── Paginação sem IA: "Ver mais horários" ─────────────────────────────────
  if (paginationAction) {
    const { date, serviceId, professionalId, offset } = paginationAction;
    // DATE| com sessão de agendamento ativa → delegar ao fluxo guiado (usa serviceId/profId da sessão)
    if (rawSelectedId.startsWith("DATE|") && hasActiveSchedulingSession(clinic.id, rawPhone)) {
      await handleSchedulingSelection({
        clinicId: clinic.id,
        phone: rawPhone,
        channel,
        selectedId: rawSelectedId,
        clinicName: clinic.name,
      });
      return;
    }
    const { interactiveList } = await buildAvailabilityList(clinic.id, date, serviceId, professionalId, offset);
    if (interactiveList) {
      await waTyping(channel, replyJid);
      await waList(channel, replyJid, {
        title: interactiveList.header,
        description: interactiveList.body,
        buttonText: interactiveList.buttonText,
        sections: interactiveList.sections.map(s => ({
          title: s.title,
          rows: s.rows.map(r => ({ rowId: r.id, title: r.title, description: r.description })),
        })),
      });
    }
    return;
  }

  // ── Comando especial: reiniciar conversa ──────────────────────────────────
  if (textMessage.trim().toLowerCase() === "reiniciarx") {
    await db.delete(aiLogsTable).where(and(eq(aiLogsTable.clinicId, clinic.id), eq(aiLogsTable.patientPhone, rawPhone)));
    clearSchedulingSession(clinic.id, rawPhone);
    await sendTextMessage(instance, replyJid, "Conversa reiniciada! Como posso ajudar? 😊");
    req.log.info({ clinicId: clinic.id, from: rawPhone }, "[Evolution] Conversa reiniciada pelo usuário");
    return;
  }

  req.log.info({ clinicId: clinic.id, from: rawPhone, msgType, instance }, "[Evolution] Mensagem recebida — processando com IA");

  // ── Guard: Handoff ativo ou IA desativada → salva msg e não chama IA ──────
  const [activeHandoff] = await db
    .select({ id: handoffsTable.id })
    .from(handoffsTable)
    .where(and(eq(handoffsTable.clinicId, clinic.id), eq(handoffsTable.patientPhone, rawPhone), isNull(handoffsTable.endedAt)));

  if (activeHandoff || !clinic.aiEnabled) {
    await db.insert(handoffMessagesTable).values({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      direction: "in",
      content: textMessage || "(mensagem sem texto)",
    });
    req.log.info({ clinicId: clinic.id, from: rawPhone, reason: activeHandoff ? "handoff_ativo" : "ai_desativada" }, "[Evolution] Mensagem ignorada pela IA");
    return;
  }

  // ── Auto-Handoff: paciente pediu atendente humano ────────────────────────
  if (clinic.autoHandoffEnabled && textMessage && detectsHumanRequest(textMessage)) {
    req.log.info({ clinicId: clinic.id, from: rawPhone }, "[Evolution] Auto-handoff ativado — paciente solicitou atendente humano");
    await db.insert(handoffsTable).values({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      attendantId: null,
    });
    await db.insert(handoffMessagesTable).values({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      direction: "in",
      content: textMessage,
    });
    if (isEvolutionConfigured()) {
      await sendTextMessage(instance, replyJid,
        "Entendido! 👋 Vou transferir você para um de nossos atendentes. Nossa equipe continuará esta conversa em breve. Aguarde!"
      ).catch(() => {});
    }
    return;
  }

  // ── Transcrição de áudio ──────────────────────────────────────────────────
  if (isAudio && msgData.message?.audioMessage?.url) {
    try {
      textMessage = await transcribeAudio(msgData.message.audioMessage.url);
      req.log.info({ transcript: textMessage }, "[Evolution] Áudio transcrito com sucesso");
    } catch (err) {
      req.log.error({ err }, "[Evolution] Falha na transcrição de áudio");
      textMessage = "(mensagem de áudio — não foi possível transcrever)";
    }
  }

  if (!textMessage.trim() && !rawSelectedId) return;

  // ── Fluxo de agendamento determinístico ───────────────────────────────────
  // Intercept ANTES de chamar a IA — responde com state machine sem consumir tokens
  {
    const sfHasSession = hasActiveSchedulingSession(clinic.id, rawPhone);

    // Prefixos de seleção do fluxo guiado
    const isSchedulingSelection =
      rawSelectedId.startsWith("SVC|") ||
      rawSelectedId.startsWith("PRF|") ||
      rawSelectedId.startsWith("CNF|") ||
      rawSelectedId.startsWith("APPT|") ||
      rawSelectedId.startsWith("CNC|") ||
      rawSelectedId.startsWith("RMK|") ||
      rawSelectedId.startsWith("S|"); // Sempre intercepta S| para garantir confirmação antes do booking

    if (isSchedulingSelection) {
      try {
        const handled = await handleSchedulingSelection({
          clinicId: clinic.id,
          phone: rawPhone,
          channel,
          selectedId: rawSelectedId,
          clinicName: clinic.name,
        });
        if (handled) return;
      } catch (err) {
        req.log.error({ err, selectedId: rawSelectedId }, "[SchedulingFlow] Erro ao processar seleção — encerrando sessão");
        clearSchedulingSession(clinic.id, rawPhone);
        await sendTextMessage(instance, replyJid,
          "❌ Ocorreu um erro ao processar sua seleção. Por favor, tente novamente ou entre em contato com a clínica.",
        ).catch(() => {});
        return;
      }
    } else if (textMessage.trim()) {
      if (sfHasSession) {
        // Texto durante sessão ativa — scheduling flow decide se trata ou passa à IA
        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinic.id), eq(patientsTable.phone, rawPhone)))
          .limit(1);

        try {
          const handled = await handleSchedulingFreeText({
            clinicId: clinic.id,
            phone: rawPhone,
            channel,
            message: textMessage,
            clinicName: clinic.name,
            patientName: patient?.name,
          });
          if (handled) return;
        } catch (err) {
          req.log.error({ err }, "[SchedulingFlow] Erro ao processar texto livre — passando à IA");
          // Não encerra sessão — deixa a IA tentar responder
        }
      } else if ((clinic.schedulingEnabled ?? true) && isManagementIntent(textMessage)) {
        // Intenção de gerenciar agendamentos (consultar, cancelar, remarcar)
        req.log.info({ clinicId: clinic.id, from: rawPhone }, "[SchedulingFlow] Intenção de gestão detectada — listando agendamentos");
        if (isEvolutionConfigured()) {
          try {
            await startManagementFlow({ clinicId: clinic.id, phone: rawPhone, channel });
            return; // fluxo tratou a mensagem com sucesso
          } catch (err) {
            req.log.error({ err }, "[SchedulingFlow] Erro ao listar agendamentos — passando à IA");
            clearSchedulingSession(clinic.id, rawPhone);
            // cai para a IA responder normalmente
          }
        } else {
          return; // Evolution não configurado — sem fluxo guiado
        }
      } else if ((clinic.schedulingEnabled ?? true) && isSchedulingIntent(textMessage)) {
        // Nova intenção de agendamento detectada → inicia fluxo guiado
        req.log.info({ clinicId: clinic.id, from: rawPhone }, "[SchedulingFlow] Intenção detectada — iniciando fluxo guiado");

        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinic.id), eq(patientsTable.phone, rawPhone)))
          .limit(1);

        if (isEvolutionConfigured()) {
          try {
            await startSchedulingFlow({
              clinicId: clinic.id,
              phone: rawPhone,
              channel,
              clinicName: clinic.name,
              patientName: patient?.name,
            });
            return; // fluxo tratou a mensagem com sucesso
          } catch (err) {
            req.log.error({ err }, "[SchedulingFlow] Erro ao iniciar fluxo — passando à IA");
            clearSchedulingSession(clinic.id, rawPhone);
            // cai para a IA responder normalmente
          }
        } else {
          return; // Evolution não configurado — sem fluxo guiado
        }
        // sem return: cai para processWhatsAppMessage quando o fluxo falhar
      }
    }
  }

  if (!textMessage.trim()) return;

  // ── Processa com IA ───────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof processWhatsAppMessage>>;
  try {
    result = await processWhatsAppMessage({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      userMessage: textMessage,
      messageType: isAudio ? "audio" : "text",
      clinic: {
        id: clinic.id,
        aiName: clinic.aiName,
        aiPersonalityPrompt: clinic.aiPersonalityPrompt,
        knowledgeBase: clinic.knowledgeBase,
        clinicType: clinic.clinicType,
        schedulingEnabled: clinic.schedulingEnabled ?? true,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[Evolution] Todos os provedores de IA indisponíveis — enviando mensagem de fallback");
    // Degradação graceful: avisa o paciente sem travar o fluxo
    if (isEvolutionConfigured()) {
      await sendTextMessage(instance, replyJid,
        "Desculpe, estou com uma dificuldade técnica momentânea. Pode tentar novamente em alguns minutos? 🙏"
      ).catch(() => {});
    }
    return; // NUNCA relançar — res.status(200) já foi enviado no início do handler
  }

  req.log.info({ clinicId: clinic.id, tokensUsed: result.tokensUsed }, "[Evolution] Resposta da IA gerada");

  if (!isEvolutionConfigured()) {
    req.log.warn("[Evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausentes — resposta não enviada");
    return;
  }

  await sendTypingPresence(instance, replyJid);

  // ── Envia resposta: lista, botões ou texto ────────────────────────────────
  let whatsappMessageId: string | null = null;

  if (result.interactiveList) {
    // Lista de horários disponíveis
    const il = result.interactiveList;
    whatsappMessageId = await sendListMessage(instance, replyJid, {
      title: il.header,
      description: il.body,
      buttonText: il.buttonText,
      sections: il.sections.map(s => ({
        title: s.title,
        rows: s.rows.map(r => ({ rowId: r.id, title: r.title, description: r.description })),
      })),
    });
    // Se o envio da lista falhar, envia como texto de fallback
    if (!whatsappMessageId) {
      whatsappMessageId = await sendTextMessage(instance, replyJid, result.reply);
    }
  } else if (result.interactiveChoice) {
    // Botões (≤3) ou lista de opções (>3)
    const ic = result.interactiveChoice;
    if (ic.options.length <= 3) {
      whatsappMessageId = await sendButtonMessage(instance, replyJid, {
        title: ic.header,
        description: ic.body,
        footerText: ic.footerText,
        buttons: ic.options.map(o => ({ buttonId: o.id, displayText: o.label })),
      });
    } else {
      whatsappMessageId = await sendListMessage(instance, replyJid, {
        title: ic.header,
        description: ic.body,
        footerText: ic.footerText,
        buttonText: "Ver opções",
        sections: [{
          title: "Opções disponíveis",
          rows: ic.options.map(o => ({ rowId: o.id, title: o.label, description: o.description })),
        }],
      });
    }
    // Fallback para texto
    if (!whatsappMessageId) {
      whatsappMessageId = await sendTextMessage(instance, replyJid, result.reply);
    }
  } else {
    // Texto simples
    whatsappMessageId = await sendTextMessage(instance, replyJid, result.reply);
  }

  // Vincula o ID da mensagem ao log para rastreio de entrega/leitura
  if (whatsappMessageId && result.logId) {
    try {
      await db.update(aiLogsTable).set({ whatsappMessageId, deliveryStatus: "PENDING" }).where(eq(aiLogsTable.id, result.logId));
    } catch (err) {
      req.log.error({ err }, "[Evolution] Erro ao vincular messageId ao log");
    }
  }

  if (!whatsappMessageId) {
    req.log.error({
      clinicId: clinic.id,
      rawPhone,
      instance,
      hasInteractiveList: !!result.interactiveList,
      hasInteractiveChoice: !!result.interactiveChoice,
      replyPreview: result.reply?.slice(0, 80),
    }, "[Evolution] FALHA AO ENVIAR RESPOSTA — verifique EVOLUTION_API_URL, EVOLUTION_API_KEY e se a instância está conectada ao WhatsApp");
  }
  } catch (err) {
    req.log.error({ err }, "[Evolution] Erro não tratado no processamento do webhook — mensagem perdida");
  }
}

// ─── Tipos internos dos payloads da Evolution API ────────────────────────────

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: unknown;
}

interface EvolutionStatusUpdate {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  update?: { status?: string };
}

interface EvolutionMessageData {
  key: { remoteJid: string; fromMe: boolean; id: string; remoteJidAlt?: string };
  messageType?: string;
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { url?: string };
    pttMessage?: { url?: string };
  };
}

interface EvolutionListResponseMessage {
  listResponseMessage?: {
    title?: string;
    description?: string;
    singleSelectReply?: { selectedRowId?: string };
  };
}

interface EvolutionButtonResponseMessage {
  buttonsResponseMessage?: {
    selectedButtonId?: string;
    selectedDisplayText?: string;
  };
}

export default router;

