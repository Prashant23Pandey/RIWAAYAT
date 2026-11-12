import { NextResponse } from "next/server";
import { insertOrder } from "@/lib/db";
import { TOTAL_PAGES } from "@/lib/pages-meta";

const hits = new Map<string, { n: number; t: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  rec.n += 1;
  return rec.n > 5;
}

const REQUIRED = [
  "name surname",
  "address",
  "postal code",
  "phone number",
  "Email",
  "delivery",
];

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    page?: unknown;
    product?: unknown;
    fields?: unknown;
  };

  const page = Number(payload.page);
  const product =
    typeof payload.product === "string" ? payload.product.trim().slice(0, 120) : "";
  const rawFields = payload.fields;

  if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (!product) {
    return NextResponse.json({ error: "Missing product" }, { status: 400 });
  }
  if (!rawFields || typeof rawFields !== "object") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFields as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const key = k.trim().slice(0, 60);
    const val = v.trim().slice(0, 500);
    if (!key) continue;
    if (val) fields[key] = val;
  }

  for (const r of REQUIRED) {
    if (!fields[r]) {
      return NextResponse.json(
        { error: `Missing field: ${r}` },
        { status: 400 }
      );
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields["Email"])) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const id = insertOrder({ page, product, fields });
    return NextResponse.json({ ok: true, id: String(id) });
  } catch (err) {
    console.error("Failed to save order", err);
    return NextResponse.json(
      { error: "Could not save order" },
      { status: 500 }
    );
  }
}
