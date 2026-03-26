import { prisma } from "./prisma";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getResume() {
  return prisma.resume.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}

export async function upsertResume(input: {
  skills: string[];
  experience?: string;
  education?: string;
  rawText?: string;
}) {
  const existing = await prisma.resume.findFirst();

  if (existing) {
    return prisma.resume.update({
      where: { id: existing.id },
      data: {
        skills: input.skills,
        experience: input.experience,
        education: input.education,
        rawText: input.rawText,
      },
    });
  }

  return prisma.resume.create({
    data: {
      skills: input.skills,
      experience: input.experience,
      education: input.education,
      rawText: input.rawText,
    },
  });
}

export async function parseResumeText(text: string): Promise<{
  skills: string[];
  experience: string;
  education: string;
  keywords: string[];
}> {
  const prompt = `Analyze this resume and extract:
1. Technical skills (programming languages, frameworks, tools)
2. Soft skills
3. Experience summary (1-2 sentences)
4. Education summary (1 sentence)
5. Keywords that would match job postings (technologies, methodologies, domains)

Return JSON only, no markdown:
{
  "skills": ["skill1", "skill2", ...],
  "experience": "brief summary",
  "education": "brief summary",
  "keywords": ["keyword1", "keyword2", ...]
}

Resume:
${text.slice(0, 6000)}`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const content = response.choices[0].message.content ?? "{}";
  const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    skills: parsed.skills ?? [],
    experience: parsed.experience ?? "",
    education: parsed.education ?? "",
    keywords: parsed.keywords ?? [],
  };
}

export async function saveResumeFromText(text: string) {
  const parsed = await parseResumeText(text);

  const existing = await prisma.resume.findFirst();

  const allSkills = [...new Set([...parsed.skills, ...parsed.keywords])];

  if (existing) {
    return prisma.resume.update({
      where: { id: existing.id },
      data: {
        skills: allSkills,
        experience: parsed.experience,
        education: parsed.education,
        rawText: text,
      },
    });
  }

  return prisma.resume.create({
    data: {
      skills: allSkills,
      experience: parsed.experience,
      education: parsed.education,
      rawText: text,
    },
  });
}