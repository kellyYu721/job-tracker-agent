import { NextResponse } from "next/server";
import { getResume } from "@/lib/resume";

export async function GET() {
  const resume = await getResume();
  
  if (!resume) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    resume: {
      skills: resume.skills,
      experience: resume.experience,
      education: resume.education,
      updatedAt: resume.updatedAt,
    },
  });
}