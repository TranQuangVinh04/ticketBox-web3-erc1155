import { Router } from "express";
import z from "zod";
import crypto from "node:crypto";

import { prisma } from "../db/prisma";
import { jsonSafe } from "../utils/json";
import { requireAuth, requireStaffOrOwner } from "../auth/middleware";
import { logActivity } from "../utils/activityLog";

export const routerGetEvent = Router();

function normalizeSlug(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeAddress(v: string): string {
  const s = v.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) ? s.toLowerCase() : "";
}

const UpsertDisplaySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  bannerImage: z.string().optional().default(""),
  date: z.string().optional().default(""),
  location: z.string().optional().default(""),
  displayPrice: z.string().optional().default(""),
  featured: z.boolean().optional().default(true),
  bannerHighlight: z.boolean().optional().default(false),
  highlightOrder: z.number().int().optional().default(0),
  chainId: z.number().int().positive(),
  contractAddress: z.string().min(1),
  defaultTokenId: z.string().optional(),
  deleted: z.boolean().optional().default(false)
});

const ToggleDeletedSchema = z.object({
  slug: z.string().min(1),
  chainId: z.number().int().positive(),
  contractAddress: z.string().min(1)
});

function isDisplayTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);

  // Chỉ coi là "table missing" khi thực sự là lỗi không tồn tại bảng,
  // tránh bắt nhầm các lỗi khác có chứa tên event_displays (vd: unique constraint).
  const hasTableName =
    msg.includes("event_displays") || msg.includes("EventDisplay");
  const isMissing =
    /does not exist/i.test(msg) ||
    /relation .* does not exist/i.test(msg) ||
    /unknown table/i.test(msg);

  return hasTableName && isMissing;
}

async function fetchEventsWithDisplay(includeDeleted: boolean) {
  const eventsPromise = prisma.event.findMany({
    include: { contract: true },
    orderBy: { createdAt: "desc" }
  });

  const displaysPromise = prisma.event_displays.findMany({
    where: includeDeleted ? undefined : { deleted: false },
    orderBy: [
      { bannerHighlight: "desc" },
      { highlightOrder: "asc" },
      { updatedAt: "desc" }
    ]
  });

  const events = await eventsPromise;

  let displays: (typeof events)[number][] | any[] = [];
  try {
    displays = await displaysPromise;
  } catch (e) {
    if (!isDisplayTableMissingError(e)) throw e;
    displays = [];
  }

  const byKey = new Map(
    displays.map((d) => [
      `${d.chainId}:${d.contractAddress.toLowerCase()}:${d.slug}`,
      d
    ] as const)
  );

  const used = new Set<string>();

  const merged = events.flatMap((ev) => {
    const contractAddress = ev.contract?.address?.toLowerCase?.() || "";
    const slug = normalizeSlug(ev.name || "");
    if (!slug || !contractAddress) return [ev];

    const key = `${ev.chainId}:${contractAddress}:${slug}`;
    const d = byKey.get(key);
    if (!d) return [ev];

    used.add(key);
    if (d.deleted) return [];

    return [
      {
        ...ev,
        name: d.slug,
        slug: d.slug,
        title: d.title || ev.name || d.slug,
        eventTitle: d.title || ev.name || d.slug,
        description: d.description,
        bannerImage: d.bannerImage,
        date: d.date,
        location: d.location,
        price: d.displayPrice || "Liên hệ",
        featured: d.featured,
        bannerHighlight: d.bannerHighlight,
        highlightOrder: d.highlightOrder,
        chainId: d.chainId,
        tokenId: d.defaultTokenId || String(ev.tokenId),
        contract: {
          ...ev.contract,
          address: d.contractAddress,
          chainId: d.chainId
        },
        displayId: d.id,
        displayDeleted: d.deleted
      }
    ];
  });

  // Include display rows without matching Event row yet (admin pre-config by contractAddress).
  const displayOnly = displays
    .filter(
      (d) => !used.has(`${d.chainId}:${d.contractAddress.toLowerCase()}:${d.slug}`)
    )
    .flatMap((d) =>
      d.deleted
        ? []
        : [
            {
              id: `display-${d.id}`,
              name: d.slug,
              slug: d.slug,
              title: d.title,
              eventTitle: d.title,
              description: d.description,
              bannerImage: d.bannerImage,
              date: d.date,
              location: d.location,
              price: d.displayPrice || "Liên hệ",
              featured: d.featured,
              bannerHighlight: d.bannerHighlight,
              highlightOrder: d.highlightOrder,
              chainId: d.chainId,
              tokenId: d.defaultTokenId || "3",
              contract: {
                address: d.contractAddress,
                chainId: d.chainId
              },
              displayId: d.id,
              displayDeleted: d.deleted
            }
          ]
    );

  return [...merged, ...displayOnly];
}

routerGetEvent.get("/getAllEvent", async (_req, res) => {
  const events = await fetchEventsWithDisplay(false);
  return res.json({ events: jsonSafe(events) });
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).optional()
});

routerGetEvent.get("/events/search", async (req, res) => {
  let parsed;
  try {
    parsed = SearchQuerySchema.parse({
      q: req.query.q,
      limit: req.query.limit
    });
  } catch {
    return res.status(400).json({ ok: false, error: "INVALID_QUERY" });
  }

  const keyword = parsed.q.trim().toLowerCase();
  const limit = parsed.limit ?? 8;

  const events = await fetchEventsWithDisplay(false);

  const results = events
    .map((ev) => {
      const name: string = (ev as any).name || (ev as any).slug || "";
      const title: string =
        (ev as any).title || (ev as any).eventTitle || name || "";
      const location: string = (ev as any).location || "";
      const date: string = (ev as any).date || "";
      const bannerImage: string = (ev as any).bannerImage || "";
      const chainId: number | undefined = (ev as any).chainId;
      const tokenId: string | undefined = String(
        (ev as any).tokenId ?? ""
      ) || undefined;
      const contractAddress: string | undefined =
        (ev as any).contract?.address || undefined;

      return {
        raw: ev,
        item: {
          id: (ev as any).id as string,
          name,
          title,
          bannerImage,
          date,
          location,
          chainId,
          tokenId,
          contractAddress
        }
      };
    })
    .filter((row) => {
      const t = `${row.item.title} ${row.item.name} ${row.item.location} ${row.item.date}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const k = keyword
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return t.includes(k);
    })
    .slice(0, limit)
    .map((row) => row.item);

  return res.json(jsonSafe({ ok: true, results }));
});

routerGetEvent.get(
  "/admin/getAllEvent",
  requireAuth,
  requireStaffOrOwner,
  async (_req, res) => {
    const events = await fetchEventsWithDisplay(true);

    let displays: any[] = [];
    try {
      displays = await prisma.event_displays.findMany({
        orderBy: [{ updatedAt: "desc" }]
      });
    } catch (e) {
      if (isDisplayTableMissingError(e)) {
        return res
          .status(500)
          .json({ ok: false, error: "EVENT_DISPLAY_TABLE_MISSING" });
      }
      throw e;
    }

    return res.json({
      events: jsonSafe(events),
      displays: jsonSafe(displays)
    });
  }
);

routerGetEvent.put(
  "/admin/event-display",
  requireAuth,
  requireStaffOrOwner,
  async (req, res) => {
    const parsed = UpsertDisplaySchema.parse(req.body);
    const slug = normalizeSlug(parsed.slug);
    const contractAddress = normalizeAddress(parsed.contractAddress);

    if (!slug)
      return res.status(400).json({ ok: false, error: "INVALID_SLUG" });
    if (!contractAddress)
      return res
        .status(400)
        .json({ ok: false, error: "INVALID_CONTRACT_ADDRESS" });

    const contract = await prisma.contract.findFirst({
      where: {
        chainId: parsed.chainId,
        address: {
          equals: contractAddress,
          mode: "insensitive"
        }
      },
      select: { id: true }
    });

    let saved;
    try {
      saved = await prisma.event_displays.upsert({
        where: {
          chainId_contractAddress_slug: {
            chainId: parsed.chainId,
            contractAddress,
            slug
          }
        },
        create: {
          id: crypto.randomUUID(),
          slug,
          title: parsed.title.trim(),
          description: parsed.description.trim(),
          bannerImage: parsed.bannerImage.trim(),
          date: parsed.date.trim(),
          location: parsed.location.trim(),
          displayPrice: parsed.displayPrice.trim(),
          featured: parsed.featured,
          bannerHighlight: parsed.bannerHighlight,
          highlightOrder: parsed.highlightOrder,
          chainId: parsed.chainId,
          contractAddress,
          defaultTokenId: parsed.defaultTokenId?.trim() || null,
          deleted: parsed.deleted,
          contractId: contract?.id ?? null,
          updatedAt: new Date()
        },
        update: {
          title: parsed.title.trim(),
          description: parsed.description.trim(),
          bannerImage: parsed.bannerImage.trim(),
          date: parsed.date.trim(),
          location: parsed.location.trim(),
          displayPrice: parsed.displayPrice.trim(),
          featured: parsed.featured,
          bannerHighlight: parsed.bannerHighlight,
          highlightOrder: parsed.highlightOrder,
          defaultTokenId: parsed.defaultTokenId?.trim() || null,
          deleted: parsed.deleted,
          contractId: contract?.id ?? null
        }
      });
    } catch (e) {
      if (isDisplayTableMissingError(e)) {
        return res
          .status(500)
          .json({ ok: false, error: "EVENT_DISPLAY_TABLE_MISSING" });
      }
      throw e;
    }

    await logActivity({
      req,
      userId: null,
      walletAddress: null,
      action: "ADMIN_UPSERT_EVENT_DISPLAY",
      meta: {
        id: saved.id,
        slug: saved.slug,
        title: saved.title,
        chainId: saved.chainId,
        contractAddress: saved.contractAddress,
        bannerHighlight: saved.bannerHighlight,
        highlightOrder: saved.highlightOrder,
        deleted: saved.deleted
      }
    });

    return res.json({ ok: true, display: jsonSafe(saved) });
  }
);

routerGetEvent.post(
  "/admin/event-display/delete",
  requireAuth,
  requireStaffOrOwner,
  async (req, res) => {
    const parsed = ToggleDeletedSchema.parse(req.body);
    const slug = normalizeSlug(parsed.slug);
    const contractAddress = normalizeAddress(parsed.contractAddress);

    if (!slug || !contractAddress) {
      return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    }

    let saved;
    try {
      saved = await prisma.event_displays.upsert({
        where: {
          chainId_contractAddress_slug: {
            chainId: parsed.chainId,
            contractAddress,
            slug
          }
        },
        create: {
          id: crypto.randomUUID(),
          slug,
          title: slug,
          chainId: parsed.chainId,
          contractAddress,
          deleted: true,
          updatedAt: new Date()
        },
        update: { deleted: true }
      });
    } catch (e) {
      if (isDisplayTableMissingError(e)) {
        return res
          .status(500)
          .json({ ok: false, error: "EVENT_DISPLAY_TABLE_MISSING" });
      }
      throw e;
    }

    await logActivity({
      req,
      userId: null,
      walletAddress: null,
      action: "ADMIN_DELETE_EVENT_DISPLAY",
      meta: {
        id: saved.id,
        slug: saved.slug,
        title: saved.title,
        chainId: saved.chainId,
        contractAddress: saved.contractAddress
      }
    });

    return res.json({ ok: true, display: jsonSafe(saved) });
  }
);

routerGetEvent.post(
  "/admin/event-display/restore",
  requireAuth,
  requireStaffOrOwner,
  async (req, res) => {
    const parsed = ToggleDeletedSchema.parse(req.body);
    const slug = normalizeSlug(parsed.slug);
    const contractAddress = normalizeAddress(parsed.contractAddress);

    if (!slug || !contractAddress) {
      return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    }

    let saved;
    try {
      saved = await prisma.event_displays.upsert({
        where: {
          chainId_contractAddress_slug: {
            chainId: parsed.chainId,
            contractAddress,
            slug
          }
        },
        create: {
          id: crypto.randomUUID(),
          slug,
          title: slug,
          chainId: parsed.chainId,
          contractAddress,
          deleted: false,
          updatedAt: new Date()
        },
        update: { deleted: false }
      });
    } catch (e) {
      if (isDisplayTableMissingError(e)) {
        return res
          .status(500)
          .json({ ok: false, error: "EVENT_DISPLAY_TABLE_MISSING" });
      }
      throw e;
    }

    await logActivity({
      req,
      userId: null,
      walletAddress: null,
      action: "ADMIN_RESTORE_EVENT_DISPLAY",
      meta: {
        id: saved.id,
        slug: saved.slug,
        title: saved.title,
        chainId: saved.chainId,
        contractAddress: saved.contractAddress
      }
    });

    return res.json({ ok: true, display: jsonSafe(saved) });
  }
);

