import { NextResponse } from "next/server";
import {
  listApplications,
  getApplicationStats,
  getStaleApplications,
  getGhostedCandidates,
  getNeedingFollowUp,
  getTopMatches,
} from "@/lib/applications";

export async function GET() {
  const [applications, stats, stale, ghosted, needFollowUp, topMatches] = await Promise.all([
    listApplications(),
    getApplicationStats(),
    getStaleApplications(7),
    getGhostedCandidates(14),
    getNeedingFollowUp(),
    getTopMatches(5),
  ]);

  return NextResponse.json({
    applications: applications.map(a => ({
      id: a.id,
      company: a.company,
      role: a.role,
      location: a.location,
      status: a.status,
      fitScore: a.fitScore,
      appliedAt: a.appliedAt,
      createdAt: a.createdAt,
      lastActivityAt: a.lastActivityAt,
      sponsorsH1B: a.sponsorsH1B,
    })),
    stats,
    attention: {
      stale: stale.map(a => ({
        id: a.id,
        company: a.company,
        role: a.role,
        status: a.status,
        daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      probablyGhosted: ghosted.map(a => ({
        id: a.id,
        company: a.company,
        role: a.role,
        daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      needFollowUp: needFollowUp.map(a => ({
        id: a.id,
        company: a.company,
        role: a.role,
        daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
    },
    topMatches: topMatches.map(a => ({
      id: a.id,
      company: a.company,
      role: a.role,
      fitScore: a.fitScore,
      location: a.location,
    })),
  });
}