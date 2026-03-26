import { prisma } from "./prisma";

export type EventType = "note" | "status_change" | "interview" | "email_sent" | "follow_up" | "phone_screen" | "offer" | "rejection";

export async function addTimelineEvent(
  applicationId: string,
  type: EventType,
  title: string,
  description?: string,
  date?: Date
) {
  return prisma.applicationEvent.create({
    data: {
      applicationId,
      type,
      title,
      description,
      date: date || new Date(),
    },
  });
}

export async function getTimeline(applicationId: string) {
  return prisma.applicationEvent.findMany({
    where: { applicationId },
    orderBy: { date: "desc" },
  });
}

export async function getApplicationWithTimeline(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      timeline: {
        orderBy: { date: "desc" },
      },
    },
  });
}