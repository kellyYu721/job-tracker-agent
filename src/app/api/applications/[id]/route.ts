import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus } from "@prisma/client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !Object.values(ApplicationStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status,
        lastActivityAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("Update error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}