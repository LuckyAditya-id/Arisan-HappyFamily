import { getStore } from "@netlify/blobs";
import { handle } from "./core.mjs";

export default async (req) => {
  const store = getStore({ name: "arisan", consistency: "strong" });
  let body = null;
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return Response.json({ error: "Body tidak valid" }, { status: 400 }); }
  } else if (req.method !== "GET") {
    return Response.json({ error: "Method tidak didukung" }, { status: 405 });
  }
  const me = (new URL(req.url).searchParams.get("me") || "").split(",").filter(Boolean).slice(0, 9);
  const r = await handle(store, req.method, body, me);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/arisan" };
