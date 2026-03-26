import { NextResponse } from "next/server";
import { parseJobText } from "@/lib/parser";
import { addApplicationFromParsedJob } from "@/lib/applications";

export async function POST(req: Request) {
  try {
    const { text, url, save } = await req.json();

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Not enough text to parse" },
        { status: 400 }
      );
    }

    const parsed = await parseJobText(text);

    if (save) {
      const app = await addApplicationFromParsedJob(parsed, url || "");
      return NextResponse.json({
        saved: true,
        application: app,
        parsed,
      });
    }

    return NextResponse.json({ parsed });
  } catch (e: any) {
    console.error("Parse job error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}