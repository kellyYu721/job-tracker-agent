import { prisma } from "./prisma";
import { ApplicationStatus } from "@prisma/client";
import type { ParsedJob } from "./parser";


export async function addApplicationFromParsedJob(
  parsed: ParsedJob,
  link: string
) {
  return prisma.application.create({
    data: {
      company: parsed.company,
      role: parsed.role,
      location: parsed.location,
      link: link,
      salaryRange: parsed.salaryRange,
      requirements: parsed.requirements,
      niceToHaves: parsed.niceToHaves,
      rawDescription: parsed.rawDescription,
      sponsorsH1B: String(parsed.sponsorship.sponsorsH1B),
      sponsorshipNotes: parsed.sponsorship.sponsorshipNotes,
      status: "APPLIED",
      appliedAt: new Date(),
    },
  });
}
export async function addApplication(input: {
  company: string;
  role: string;
  location?: string;
  link?: string;
  notes?: string;
}) {
  return prisma.application.create({
    data: {
      company: input.company,
      role: input.role,
      location: input.location,
      link: input.link,
      notes: input.notes,
    },
  });
}

export async function listApplications(params?: {
  status?: ApplicationStatus;
}) {
  return prisma.application.findMany({
    where: {
      status: params?.status,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function updateApplicationStatus(input: {
  id: string;
  status: ApplicationStatus;
}) {
  return prisma.application.update({
    where: { id: input.id },
    data: { status: input.status },
  });
}

// NEW: find most recent application by company name (case-insensitive)
export async function findMostRecentByCompany(company: string) {
  return prisma.application.findFirst({
    where: {
      company: { equals: company, mode: "insensitive" },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function updateApplicationMatch(
  id: string,
  match: {
    fitScore: number;
    skillMatches: string[];
    skillGaps: string[];
  }
) {
  return prisma.application.update({
    where: { id },
    data: {
      fitScore: match.fitScore,
      skillMatches: match.skillMatches,
      skillGaps: match.skillGaps,
    },
  });
}

export async function getApplicationById(id: string) {
  return prisma.application.findUnique({
    where: { id },
  });
}

// Get applications that need attention
export async function getStaleApplications(daysThreshold: number = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysThreshold);

  return prisma.application.findMany({
    where: {
      status: { in: ["APPLIED", "INTERVIEW"] },
      lastActivityAt: { lt: cutoff },
    },
    orderBy: { lastActivityAt: "asc" },
  });
}

// Get applications that might be ghosted (14+ days, no response)
export async function getGhostedCandidates(daysThreshold: number = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysThreshold);

  return prisma.application.findMany({
    where: {
      status: "APPLIED",
      lastActivityAt: { lt: cutoff },
    },
    orderBy: { lastActivityAt: "asc" },
  });
}

// Get applications needing follow-up (applied 3-7 days ago)
export async function getNeedingFollowUp() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return prisma.application.findMany({
    where: {
      status: "APPLIED",
      lastActivityAt: {
        gte: sevenDaysAgo,
        lte: threeDaysAgo,
      },
    },
    orderBy: { lastActivityAt: "asc" },
  });
}

// Get summary stats
// Get summary stats
export async function getApplicationStats() {
  const all = await prisma.application.findMany();
  
  const total = all.length;
  const saved = all.filter(a => a.status === "SAVED").length;
  const applied = all.filter(a => a.status === "APPLIED").length;
  const interviewing = all.filter(a => a.status === "INTERVIEW").length;
  const offers = all.filter(a => a.status === "OFFER").length;
  const rejected = all.filter(a => a.status === "REJECTED").length;
  const ghosted = all.filter(a => a.status === "GHOSTED").length;

  // Calculate response rate
  const withResponse = interviewing + offers + rejected;
  const totalApplied = applied + withResponse + ghosted;
  const responseRate = totalApplied > 0 ? Math.round((withResponse / totalApplied) * 100) : 0;

  return {
    total,
    saved,
    applied,
    interviewing,
    offers,
    rejected,
    ghosted,
    responseRate,
  };
}

// Get top matches (by fit score)
export async function getTopMatches(limit: number = 5) {
  return prisma.application.findMany({
    where: {
      fitScore: { not: null },
      status: { in: ["SAVED", "APPLIED"] },
    },
    orderBy: { fitScore: "desc" },
    take: limit,
  });
}

// Update lastActivityAt
export async function touchApplication(id: string) {
  return prisma.application.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
}