import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";

const router: IRouter = Router();

/** Converte row do banco para objeto serializável */
function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    price: p.price != null ? Number(p.price) : null,
    imageUrls: p.imageUrls
      ? p.imageUrls.split("\n").filter(Boolean)
      : [],
  };
}

// GET /clinics/:clinicId/products
router.get("/clinics/:clinicId/products", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.clinicId, clinicId))
    .orderBy(productsTable.name);

  res.json(products.map(serializeProduct));
});

// POST /clinics/:clinicId/products
router.post("/clinics/:clinicId/products", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }

  const { name, description, price, available, link, imageUrls, audioUrl, category } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "O campo 'name' é obrigatório." });
    return;
  }

  // imageUrls pode chegar como array (do frontend) ou string; normaliza para "\n"-joined string
  const imageUrlsStr = Array.isArray(imageUrls)
    ? imageUrls.filter(Boolean).join("\n")
    : typeof imageUrls === "string" ? imageUrls.trim() : null;

  const [product] = await db
    .insert(productsTable)
    .values({
      clinicId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      price: price != null ? String(price) : null,
      available: typeof available === "boolean" ? available : true,
      link: typeof link === "string" ? link.trim() || null : null,
      imageUrls: imageUrlsStr || null,
      audioUrl: typeof audioUrl === "string" ? audioUrl.trim() || null : null,
      category: typeof category === "string" ? category.trim() || null : null,
    })
    .returning();

  res.status(201).json(serializeProduct(product));
});

// PATCH /clinics/:clinicId/products/:id
router.patch("/clinics/:clinicId/products/:id", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  const id = Number(req.params.id);
  if (!clinicId || !id) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { name, description, price, available, link, imageUrls, audioUrl, category } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (typeof name === "string") updates.name = name.trim();
  if (Object.prototype.hasOwnProperty.call(req.body, "description"))
    updates.description = typeof description === "string" ? description.trim() || null : null;
  if (Object.prototype.hasOwnProperty.call(req.body, "price"))
    updates.price = price != null ? String(price) : null;
  if (typeof available === "boolean") updates.available = available;
  if (Object.prototype.hasOwnProperty.call(req.body, "link"))
    updates.link = typeof link === "string" ? link.trim() || null : null;
  if (Object.prototype.hasOwnProperty.call(req.body, "imageUrls")) {
    updates.imageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter(Boolean).join("\n") || null
      : typeof imageUrls === "string" ? imageUrls.trim() || null : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "audioUrl"))
    updates.audioUrl = typeof audioUrl === "string" ? audioUrl.trim() || null : null;
  if (Object.prototype.hasOwnProperty.call(req.body, "category"))
    updates.category = typeof category === "string" ? category.trim() || null : null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(productsTable.id, id), eq(productsTable.clinicId, clinicId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Produto não encontrado." }); return; }
  res.json(serializeProduct(updated));
});

// DELETE /clinics/:clinicId/products/:id
router.delete("/clinics/:clinicId/products/:id", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  const id = Number(req.params.id);
  if (!clinicId || !id) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const [deleted] = await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.clinicId, clinicId)))
    .returning({ id: productsTable.id });

  if (!deleted) { res.status(404).json({ error: "Produto não encontrado." }); return; }
  res.status(204).send();
});

// GET /clinics/:clinicId/products/search?q=...  (usado internamente pelo AI orchestrator)
router.get("/clinics/:clinicId/products/search", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }

  const where = q
    ? and(
        eq(productsTable.clinicId, clinicId),
        or(
          ilike(productsTable.name, `%${q}%`),
          ilike(productsTable.description, `%${q}%`),
          ilike(productsTable.category, `%${q}%`)
        )
      )
    : eq(productsTable.clinicId, clinicId);

  const products = await db
    .select()
    .from(productsTable)
    .where(where)
    .orderBy(productsTable.name);

  res.json(products.map(serializeProduct));
});

export default router;
