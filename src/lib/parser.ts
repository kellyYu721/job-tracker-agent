import * as cheerio from "cheerio";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ParsedJob = {
  company: string;
  role: string;
  location?: string;
  salaryRange?: string;
  requirements: string[];
  niceToHaves: string[];
  rawDescription?: string;
  sponsorship: {
    sponsorsH1B: boolean | "unknown";
    sponsorshipNotes?: string;
  };
};

export async function parseJobPosting(url: string): Promise<ParsedJob> {
  // Fetch the page
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove scripts and styles
  $("script, style, nav, footer, header").remove();

  // Get text content
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  return parseJobText(text);
}

export async function parseJobText(text: string): Promise<ParsedJob> {
  const prompt = `Analyze this job posting and extract information.

IMPORTANT: Check carefully for H1B visa sponsorship information. Look for phrases like:
- "We do not sponsor visas" / "Unable to sponsor" / "No sponsorship" → sponsorsH1B: false
- "Must be authorized to work" / "No visa support" → sponsorsH1B: false  
- "Will sponsor" / "Visa sponsorship available" / "H1B transfer welcome" → sponsorsH1B: true
- If no mention of sponsorship/visa/work authorization → sponsorsH1B: "unknown"

Return JSON only, no markdown:
{
  "company": "Company Name",
  "role": "Job Title",
  "location": "City, State or Remote",
  "salaryRange": "$X - $Y" or null,
  "requirements": ["required skill 1", "required skill 2"],
  "niceToHaves": ["nice to have 1", "nice to have 2"],
  "sponsorship": {
    "sponsorsH1B": true | false | "unknown",
    "sponsorshipNotes": "exact quote or summary about sponsorship policy"
  }
}

Job posting:
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
    company: parsed.company ?? "Unknown",
    role: parsed.role ?? "Unknown",
    location: parsed.location,
    salaryRange: parsed.salaryRange,
    requirements: parsed.requirements ?? [],
    niceToHaves: parsed.niceToHaves ?? [],
    rawDescription: text,
    sponsorship: {
      sponsorsH1B: parsed.sponsorship?.sponsorsH1B ?? "unknown",
      sponsorshipNotes: parsed.sponsorship?.sponsorshipNotes,
    },
  };
}