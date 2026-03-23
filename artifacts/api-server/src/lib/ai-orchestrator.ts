import OpenAI from "openai";
import { db, clinicsTable, servicesTable, appointmentsTable, aiLogsTable, professionalsTable, professionalServicesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Check available appointment slots for a given date and optional service. Returns available times AND the list of professionals qualified to perform the service.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          serviceId: {
            type: "number",
            description: "Optional service ID to filter professionals and availability",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book an appointment for a patient",
      parameters: {
        type: "object",
        properties: {
          patientName: {
            type: "string",
            description: "Full name of the patient",
          },
          patientPhone: {
            type: "string",
            description: "Patient phone number (WhatsApp)",
          },
          serviceId: {
            type: "number",
            description: "ID of the service to book",
          },
          professionalId: {
            type: "number",
            description: "ID of the chosen professional (optional, but recommended when multiple are available)",
          },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime for the appointment",
          },
          notes: {
            type: "string",
            description: "Optional additional notes",
          },
        },
        required: ["patientName", "patientPhone", "scheduledAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "faq_lookup",
      description: "Search the clinic knowledge base for answers to common questions",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or topic to search for",
          },
        },
        required: ["query"],
      },
    },
  },
];

interface ClinicConfig {
  id: number;
  aiName: string;
  aiPersonalityPrompt: string;
  knowledgeBase: string;
  clinicType: string;
}

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  clinicId: number,
  patientPhone: string
): Promise<string> {
  try {
    if (toolName === "check_availability") {
      const { date, serviceId } = args as { date: string; serviceId?: number };
      const startOfDay = new Date(`${date}T00:00:00Z`);
      const endOfDay = new Date(`${date}T23:59:59Z`);

      const bookedSlots = await db
        .select({ scheduledAt: appointmentsTable.scheduledAt })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.clinicId, clinicId),
            eq(appointmentsTable.status, "confirmed"),
            gte(appointmentsTable.scheduledAt, startOfDay),
            lte(appointmentsTable.scheduledAt, endOfDay),
            ...(serviceId ? [eq(appointmentsTable.serviceId, serviceId)] : [])
          )
        );

      const bookedTimes = new Set(
        bookedSlots.map(slot => new Date(slot.scheduledAt).getHours())
      );

      const availableSlots: string[] = [];
      for (let hour = 8; hour <= 17; hour++) {
        if (!bookedTimes.has(hour)) {
          availableSlots.push(`${date} ${String(hour).padStart(2, "0")}:00`);
        }
      }

      let professionalsText = "";
      if (serviceId) {
        const links = await db
          .select({ professionalId: professionalServicesTable.professionalId })
          .from(professionalServicesTable)
          .where(eq(professionalServicesTable.serviceId, serviceId));

        const professionalIds = links.map(l => l.professionalId);
        if (professionalIds.length > 0) {
          const professionals = await db
            .select()
            .from(professionalsTable)
            .where(
              and(
                eq(professionalsTable.clinicId, clinicId),
                eq(professionalsTable.active, true),
                inArray(professionalsTable.id, professionalIds)
              )
            );

          if (professionals.length > 0) {
            professionalsText = `\n\nProfissionais disponíveis para este serviço:\n${professionals
              .map(p => `- ${p.name} (${p.specialty}) [ID: ${p.id}]`)
              .join("\n")}`;
          }
        }
      }

      if (availableSlots.length === 0) {
        return `Nenhum horário disponível em ${date}. Por favor, escolha outra data.${professionalsText}`;
      }

      return `Horários disponíveis em ${date}:\n${availableSlots.join("\n")}${professionalsText}`;
    }

    if (toolName === "book_appointment") {
      const { patientName, serviceId, professionalId, scheduledAt, notes } = args as {
        patientName: string;
        serviceId?: number;
        professionalId?: number;
        scheduledAt: string;
        notes?: string;
      };

      const [appointment] = await db
        .insert(appointmentsTable)
        .values({
          clinicId,
          patientName,
          patientPhone,
          serviceId: serviceId ?? null,
          professionalId: professionalId ?? null,
          scheduledAt: new Date(scheduledAt),
          status: "pending",
          notes: notes ?? null,
        })
        .returning();

      let professionalName = "";
      if (professionalId) {
        const [prof] = await db
          .select({ name: professionalsTable.name })
          .from(professionalsTable)
          .where(eq(professionalsTable.id, professionalId));
        if (prof) professionalName = ` com ${prof.name}`;
      }

      return `Agendamento confirmado! ID: #${appointment.id}. Data: ${new Date(scheduledAt).toLocaleString("pt-BR")}${professionalName}. Status: Pendente. Você receberá uma confirmação em breve.`;
    }

    if (toolName === "faq_lookup") {
      const { query } = args as { query: string };
      const [clinic] = await db.select({ knowledgeBase: clinicsTable.knowledgeBase }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));

      if (!clinic?.knowledgeBase) {
        return "Não encontrei informações específicas sobre esse assunto. Por favor, entre em contato direto com a clínica.";
      }

      const kb = clinic.knowledgeBase.toLowerCase();
      const q = query.toLowerCase();

      if (kb.includes(q) || q.split(" ").some(word => word.length > 3 && kb.includes(word))) {
        return `Encontrei no nosso guia: ${clinic.knowledgeBase.slice(0, 500)}${clinic.knowledgeBase.length > 500 ? "..." : ""}`;
      }

      return "Não encontrei informações específicas sobre isso. Por favor, entre em contato direto com a clínica para mais detalhes.";
    }

    return `Função '${toolName}' não reconhecida.`;
  } catch (err) {
    logger.error({ err, toolName }, "Tool execution failed");
    return `Erro ao processar a solicitação. Por favor, tente novamente.`;
  }
}

export async function processWhatsAppMessage(params: {
  clinicId: number;
  patientPhone: string;
  userMessage: string;
  messageType: "text" | "audio";
  clinic: ClinicConfig;
}): Promise<{ reply: string; tokensUsed: number; appointmentId?: number }> {
  const { clinicId, patientPhone, userMessage, messageType, clinic } = params;

  const services = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.clinicId, clinicId));

  const servicesText = services.length > 0
    ? `\n\nServiços disponíveis:\n${services.map(s => `- ${s.name}: R$ ${Number(s.price).toFixed(2)} (${s.durationMinutes} min) [ID: ${s.id}]`).join("\n")}`
    : "";

  const systemPrompt = `Você é ${clinic.aiName}, assistente virtual da clínica.

${clinic.aiPersonalityPrompt}

Tipo de clínica: ${clinic.clinicType === "medical" ? "Médica" : clinic.clinicType === "vet" ? "Veterinária" : "Odontológica"}

Base de conhecimento da clínica:
${clinic.knowledgeBase || "Nenhuma informação adicional cadastrada."}
${servicesText}

Instruções importantes:
- Responda sempre em português brasileiro
- Seja prestativo, empático e profissional
- Quando o paciente quiser agendar, primeiro use check_availability com o serviceId para ver os horários disponíveis E os profissionais qualificados para aquele serviço
- Apresente os profissionais disponíveis ao paciente e pergunte qual prefere (quando houver mais de um)
- Ao confirmar o agendamento, use book_appointment incluindo o professionalId quando o paciente escolher um profissional
- Para dúvidas sobre serviços/políticas, use faq_lookup
- Não invente informações que não estejam na base de conhecimento
- Hoje é: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  let totalTokens = 0;
  let finalReply = "";
  let appointmentId: number | undefined;

  const runLoop = async (): Promise<void> => {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages,
      tools: AI_TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          toolArgs = {};
        }

        logger.info({ toolName: toolCall.function.name, args: toolArgs }, "Executing AI tool call");
        const toolResult = await executeToolCall(toolCall.function.name, toolArgs, clinicId, patientPhone);

        if (toolCall.function.name === "book_appointment" && toolResult.includes("ID: #")) {
          const match = /ID: #(\d+)/.exec(toolResult);
          if (match) {
            appointmentId = parseInt(match[1], 10);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      await runLoop();
    } else {
      finalReply = choice.message.content ?? "Desculpe, não consegui processar sua mensagem.";
    }
  };

  await runLoop();

  await db.insert(aiLogsTable).values({
    clinicId,
    patientPhone,
    userMessage,
    aiResponse: finalReply,
    tokensUsed: totalTokens,
    messageType,
  });

  return { reply: finalReply, tokensUsed: totalTokens, appointmentId };
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${audioUrl}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const file = new File([buffer], "audio.ogg", { type: "audio/ogg" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "json",
    language: "pt",
  });

  return transcription.text;
}
