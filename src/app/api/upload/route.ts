export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  return process.env[name] || process.env[`NEXT_PUBLIC_${name}`];
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return new Response(JSON.stringify({ error: "No file" }), { status: 400 });
    }

    const CLOUD_NAME = env("CLOUDINARY_CLOUD_NAME");
    const UPLOAD_PRESET = env("CLOUDINARY_UPLOAD_PRESET");
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      return new Response(JSON.stringify({ error: "Missing Cloudinary env" }), { status: 500 });
    }

    // forward to Cloudinary unsigned endpoint
    const out = new FormData();
    out.append("file", file);
    out.append("upload_preset", UPLOAD_PRESET);

    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
      method: "POST",
      body: out,
    });

    const j = await r.json();
    if (!r.ok || !j?.secure_url) {
      return new Response(JSON.stringify({ error: j?.error?.message || "Upload failed" }), { status: 400 });
    }

    // Return a simple, consistent shape
    return Response.json({
      url: j.secure_url as string,
      width: j.width,
      height: j.height,
      format: j.format,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Upload failed" }), { status: 500 });
  }
}
