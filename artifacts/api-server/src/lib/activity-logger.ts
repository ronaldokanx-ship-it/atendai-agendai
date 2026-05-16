import { db, userActivityLogsTable } from "@workspace/db";

/**
 * Registra uma ação de usuário no log de atividade.
 * Chamada não-bloqueante: erros são silenciados para não impactar o fluxo principal.
 */
export async function logActivity(
  clinicId: number,
  userId: number,
  action: string,
  details?: Record<string, unknown> | string,
): Promise<void> {
  try {
    const detailsStr = details
      ? typeof details === "string"
        ? details
        : JSON.stringify(details)
      : undefined;

    await db.insert(userActivityLogsTable).values({
      clinicId,
      userId,
      action,
      details: detailsStr,
    });
  } catch {
    // Log silencioso — nunca bloqueia o fluxo principal
  }
}
