import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MatchResult {
  fitScore: number;           // 0-100
  skillMatches: string[];     // skills you have
  skillGaps: string[];        // skills you're missing
  summary: string;            // brief assessment
}

export async function matchResumeToJob(
  resumeSkills: string[],
  jobRequirements: string[],
  jobNiceToHaves: string[]
): Promise<MatchResult> {
  const prompt = `Compare this candidate's skills against the job requirements.

CANDIDATE SKILLS:
${resumeSkills.join(", ")}

JOB REQUIREMENTS:
${jobRequirements.join(", ")}

NICE TO HAVES:
${jobNiceToHaves.join(", ")}

Return JSON only, no markdown:
{
  "fitScore": <number 0-100>,
  "skillMatches": ["skill1", "skill2"],
  "skillGaps": ["missing skill1", "missing skill2"],
  "summary": "Brief 1-2 sentence assessment"
}

Be nuanced:
- "Python" covers "scripting", "programming"
- "React" covers "frontend development"
- "3 years experience" partially covers "5 years experience"
- Nice-to-haves should boost score but gaps shouldn't hurt much`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const content = response.choices[0].message.content ?? "{}";
  const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    fitScore: parsed.fitScore ?? 0,
    skillMatches: parsed.skillMatches ?? [],
    skillGaps: parsed.skillGaps ?? [],
    summary: parsed.summary ?? "Unable to assess",
  };
}