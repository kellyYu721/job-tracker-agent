// src/app/api/applications/route.ts
import { NextResponse } from "next/server";
import {
  addApplication,
  listApplications,
  updateApplicationStatus,
} from "@/lib/applications";
import { ApplicationStatus } from "@prisma/client";

// GET /api/applications?status=APPLIED
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as ApplicationStatus | null;

  const apps = await listApplications(
    status ? { status } : undefined
  );

  return NextResponse.json(apps);
}

// POST /api/applications
export async function POST(req: Request) {
  const body = await req.json();

  const app = await addApplication({
    company: body.company,
    role: body.role,
    location: body.location,
    link: body.link,
    notes: body.notes,
  });

  return NextResponse.json(app);
}

// PATCH /api/applications
export async function PATCH(req: Request) {
  const body = await req.json();

  const updated = await updateApplicationStatus({
    id: body.id,
    status: body.status,
  });

  return NextResponse.json(updated);
}