import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";
import { getResume, upsertResume } from "@/lib/resume";
import { matchResumeToJob } from "@/lib/matcher";
import { parseJobPosting } from "@/lib/parser";
import { addTimelineEvent, getTimeline } from "@/lib/timeline";
import { prisma } from "@/lib/prisma";
import {
  addApplication,
  addApplicationFromParsedJob,
  listApplications,
  updateApplicationStatus,
  findMostRecentByCompany,
  updateApplicationMatch,
  getApplicationById,
  getStaleApplications,
  getGhostedCandidates,
  getNeedingFollowUp,
  getApplicationStats,
  getTopMatches,
} from "@/lib/applications";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Tool arg schemas (guardrails)
const AddSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().optional(),
  link: z.string().url().optional(),
  notes: z.string().optional(),
});

const ListSchema = z.object({
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]).optional(),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]),
});

const UpdateByCompanySchema = z.object({
  company: z.string().min(1),
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]),
});

const AddFromUrlSchema = z.object({
  url: z.string().url(),
});

const SetResumeSchema = z.object({
  skills: z.array(z.string()).min(1),
  experience: z.string().optional(),
  education: z.string().optional(),
});

const CheckFitSchema = z.object({
  company: z.string().min(1),
});

// ---- Tool definitions for the model
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_application",
      description:
        "Add a job application to the tracker. Use when the user asks to add/save/log an application.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          location: { type: "string" },
          link: { type: "string" },
          notes: { type: "string" },
        },
        required: ["company", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_applications",
      description:
        "List applications. Use when the user asks to show/list/view applications, optionally by status.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_application_status",
      description:
        "Update an application's status by id. Use when the user asks to change status and provides an id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: {
            type: "string",
            enum: ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"],
          },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_status_by_company",
      description:
        "Update the most recent application status by company name. Use when the user says 'Update Stripe to INTERVIEW'.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string" },
          status: {
            type: "string",
            enum: ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"],
          },
        },
        required: ["company", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_job_from_url",
      description:
        "Parse a job posting URL and add it to the tracker. Use when user provides a job posting link/URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The job posting URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_resume",
      description:
        "Save the user's resume/skills. Use when user says 'my skills are...' or 'set my resume' or lists their skills.",
      parameters: {
        type: "object",
        properties: {
          skills: {
            type: "array",
            items: { type: "string" },
            description: "List of skills (e.g., ['Python', 'React', 'SQL'])",
          },
          experience: {
            type: "string",
            description: "Brief experience summary (optional)",
          },
          education: {
            type: "string",
            description: "Education background (optional)",
          },
        },
        required: ["skills"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_fit",
      description:
        "Check how well the user's resume matches a job application. Use when user asks 'how well do I fit', 'check my fit for X', 'match me against X'.",
      parameters: {
        type: "object",
        properties: {
          company: {
            type: "string",
            description: "Company name to check fit against",
          },
        },
        required: ["company"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attention_needed",
      description:
        "Get applications that need attention: stale apps, follow-ups needed, possible ghosted, and summary stats. Use when user asks 'what needs attention', 'give me a summary', 'what should I focus on', 'how am I doing'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
  type: "function",
  function: {
    name: "add_note",
    description: "Add a note or record an interaction for a job application. Use when user says 'add note for Google: spoke with recruiter' or 'log phone screen with Amazon'",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
        note: { type: "string", description: "The note to record" },
        type: { 
          type: "string", 
          enum: ["note", "phone_screen", "interview", "follow_up", "email_sent"],
          description: "Type of interaction"
        },
      },
      required: ["company", "note"],
    },
  },
},
{
  type: "function",
  function: {
    name: "get_application_history",
    description: "Get the timeline of interactions with a company. Use when user asks 'what's my history with Google' or 'show Amazon timeline'",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
      },
      required: ["company"],
    },
  },
},
{
  type: "function",
  function: {
    name: "draft_follow_up_email",
    description: "Draft a follow-up email for a job application. Use when user says 'write a follow-up for Google'",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
        context: { type: "string", description: "Additional context like 'after phone screen'" },
      },
      required: ["company"],
    },
  },
},
{
  type: "function",
  function: {
    name: "tailor_resume",
    description: "Get advice on tailoring resume for a job. Use when user says 'how should I adjust my resume for Google'",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
      },
      required: ["company"],
    },
  },
},
];

// ---- Confirm-before-write (in-memory pending action)
type PendingAction =
  | { type: "add"; args: z.infer<typeof AddSchema> }
  | { type: "add_from_url"; args: { url: string; parsed: Awaited<ReturnType<typeof parseJobPosting>> } }
  | { type: "update"; args: { id: string; status: ApplicationStatus } }
  | { type: "set_resume"; args: z.infer<typeof SetResumeSchema> };

// ---- Confirm-before-write (persist across dev hot reloads)
const globalForPending = globalThis as unknown as {
  __pendingBySession?: Map<string, PendingAction>;
};

const pendingBySession =
  globalForPending.__pendingBySession ?? new Map<string, PendingAction>();

globalForPending.__pendingBySession = pendingBySession;

// ---- Conversation history (persist across messages)
const globalForHistory = globalThis as unknown as {
  __historyBySession?: Map<string, OpenAI.Chat.Completions.ChatCompletionMessageParam[]>;
};

const historyBySession =
  globalForHistory.__historyBySession ?? new Map<string, OpenAI.Chat.Completions.ChatCompletionMessageParam[]>();

globalForHistory.__historyBySession = historyBySession;

const MAX_HISTORY = 20; // Keep last 20 messages

function normalizeConfirm(s: string) {
  return s.trim().toUpperCase();
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const message = String(body?.message ?? "");
  const sid = String(body?.sessionId ?? "default");

  // 0) Handle confirmation / cancel
  const normalized = normalizeConfirm(message);
  if (normalized === "CONFIRM" || normalized === "YES") {
    const pending = pendingBySession.get(sid);
    if (!pending) {
      return NextResponse.json({ reply: "Nothing to confirm." });
    }

    pendingBySession.delete(sid);

    if (pending.type === "add") {
      const created = await addApplication(pending.args);
      return NextResponse.json({
        reply: `✅ Saved.\n${created.company} — ${created.role}\nStatus: ${created.status}\nID: ${created.id}`,
      });
    }

    if (pending.type === "add_from_url") {
      const created = await addApplicationFromParsedJob(
        pending.args.parsed,
        pending.args.url
      );
      return NextResponse.json({
        reply:
          `✅ Saved from URL.\n` +
          `${created.company} — ${created.role}\n` +
          `Location: ${created.location ?? "N/A"}\n` +
          `Status: ${created.status}\n` +
          `ID: ${created.id}`,
      });
    }

    if (pending.type === "update") {
      const updated = await updateApplicationStatus(pending.args);
      return NextResponse.json({
        reply: `✅ Updated.\n${updated.company} — ${updated.role}\nNew status: ${updated.status}\nID: ${updated.id}`,
      });
    }

    if (pending.type === "set_resume") {
      const resume = await upsertResume(pending.args);
      return NextResponse.json({
        reply:
          `✅ Resume saved!\n\n` +
          `Skills: ${resume.skills.join(", ")}\n` +
          (resume.experience ? `Experience: ${resume.experience}\n` : "") +
          (resume.education ? `Education: ${resume.education}` : ""),
      });
    }
  }

  if (normalized === "CANCEL" || normalized === "NO") {
    const existed = pendingBySession.delete(sid);
    return NextResponse.json({
      reply: existed ? "Cancelled. No changes were made." : "Nothing to cancel.",
    });
  }

  // ---- Rule-based intent (so CONFIRM always works even if the model doesn't call tools)
  function parseAdd(text: string) {
    const m = text.match(
      /add an application:\s*company\s*([^,]+)\s*,\s*role\s*([^,]+)(?:\s*,\s*location\s*([^,]+))?(?:\s*,\s*link\s*([^,]+))?(?:\s*,\s*notes\s*(.+))?/i
    );
    if (!m) return null;

    return {
      company: m[1].trim(),
      role: m[2].trim(),
      location: m[3]?.trim(),
      link: m[4]?.trim(),
      notes: m[5]?.trim(),
    };
  }

  function parseUpdateByCompany(text: string) {
    const m = text.match(/update\s+(.+?)\s+to\s+(APPLIED|INTERVIEW|OFFER|REJECTED)\s*$/i);
    if (!m) return null;

    return {
      company: m[1].trim(),
      status: m[2].toUpperCase() as ApplicationStatus,
    };
  }

  const addParsed = parseAdd(message);
  if (addParsed) {
    const args = AddSchema.parse(addParsed);
    pendingBySession.set(sid, { type: "add", args });

    return NextResponse.json({
      reply:
        `I'm about to add:\n` +
        `• Company: ${args.company}\n` +
        `• Role: ${args.role}\n` +
        (args.location ? `• Location: ${args.location}\n` : "") +
        (args.link ? `• Link: ${args.link}\n` : "") +
        (args.notes ? `• Notes: ${args.notes}\n` : "") +
        `\nReply CONFIRM to save, or CANCEL to abort.`,
    });
  }

  const updParsed = parseUpdateByCompany(message);
  if (updParsed) {
    const found = await findMostRecentByCompany(updParsed.company);

    if (!found) {
      return NextResponse.json({
        reply: `I can't find an application for "${updParsed.company}". Try: "List my applications".`,
      });
    }

    pendingBySession.set(sid, {
      type: "update",
      args: { id: found.id, status: updParsed.status },
    });

    return NextResponse.json({
      reply:
        `I'm about to update:\n` +
        `${found.company} — ${found.role}\n` +
        `ID: ${found.id}\n` +
        `New status: ${updParsed.status}\n\n` +
        `Reply CONFIRM to proceed, or CANCEL to abort.`,
    });
  }

  // Get or create conversation history
  let history = historyBySession.get(sid) || [];

  // Build messages with history
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a job application tracker agent.\n\n" +
        "You can:\n" +
        "- Add applications, list them, update status\n" +
        "- Parse job URLs and save them\n" +
        "- Save resume skills and check job fit\n" +
        "- Show what needs attention\n" +
        "- Add notes/interactions for applications\n" +
        "- Show application history/timeline\n" +
        "- Draft follow-up emails (you generate the text, user copies and sends it themselves)\n" +
        "- Give resume tailoring advice for specific jobs\n" +
        "- Revise or edit previously drafted content based on user feedback\n\n" +
        "IMPORTANT RULES:\n" +
        "1. For any write action (add, update, set_resume), ask user to reply CONFIRM before saving.\n" +
        "2. You CANNOT send emails. You can only draft/generate email text for the user to copy.\n" +
        "3. When user gives feedback on a draft (like 'don't mention X', 'make it shorter'), revise the draft accordingly.\n" +
        "4. Remember the context of the conversation to handle follow-up requests.\n" +
        "Be concise and helpful.",
    },
    ...history,
    { role: "user", content: message },
  ];

  // 1) Ask model for either a direct reply or a tool call
  let resp = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages,
    tools,
    tool_choice: "auto",
  });

  // 2) Handle up to 3 tool calls (simple agent loop)
  for (let i = 0; i < 3; i++) {
    const choice = resp.choices[0];
    const toolCalls = choice.message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) break;

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      const name = call.function.name;
      const args = JSON.parse(call.function.arguments || "{}");

      let result: any;

      try {
        // WRITE: add (store pending, ask user to confirm)
        if (name === "add_application") {
          const parsed = AddSchema.parse(args);

          pendingBySession.set(sid, { type: "add", args: parsed });

          result = {
            ok: true,
            needs_confirmation: true,
            message:
              `I'm about to add:\n` +
              `• Company: ${parsed.company}\n` +
              `• Role: ${parsed.role}\n` +
              (parsed.location ? `• Location: ${parsed.location}\n` : "") +
              (parsed.link ? `• Link: ${parsed.link}\n` : "") +
              (parsed.notes ? `• Notes: ${parsed.notes}\n` : "") +
              `\nReply CONFIRM to save, or CANCEL to abort.`,
          };
        }

        // READ: list
        else if (name === "list_applications") {
          const parsed = ListSchema.parse(args);
          const apps = await listApplications(
            parsed.status ? { status: parsed.status as ApplicationStatus } : undefined
          );
          result = { ok: true, applications: apps };
        }

        // WRITE: update by id (store pending)
        else if (name === "update_application_status") {
          const parsed = UpdateSchema.parse(args);

          pendingBySession.set(sid, {
            type: "update",
            args: { id: parsed.id, status: parsed.status as ApplicationStatus },
          });

          result = {
            ok: true,
            needs_confirmation: true,
            message: `I'm about to update application ${parsed.id} to ${parsed.status}.\nReply CONFIRM to proceed, or CANCEL to abort.`,
          };
        }

        // WRITE: update by company (store pending)
        else if (name === "update_status_by_company") {
          const parsed = UpdateByCompanySchema.parse(args);
          const found = await findMostRecentByCompany(parsed.company);

          if (!found) {
            result = {
              ok: false,
              error: `No application found for company "${parsed.company}". Try: "List my applications".`,
            };
          } else {
            pendingBySession.set(sid, {
              type: "update",
              args: { id: found.id, status: parsed.status as ApplicationStatus },
            });

            result = {
              ok: true,
              needs_confirmation: true,
              message:
                `I'm about to update:\n` +
                `${found.company} — ${found.role}\n` +
                `ID: ${found.id}\n` +
                `New status: ${parsed.status}\n\n` +
                `Reply CONFIRM to proceed, or CANCEL to abort.`,
            };
          }
        }

        // WRITE: add from URL (parse, then store pending)
        else if (name === "add_job_from_url") {
          const parsed = AddFromUrlSchema.parse(args);

          try {
            const jobData = await parseJobPosting(parsed.url);

            pendingBySession.set(sid, {
              type: "add_from_url",
              args: { url: parsed.url, parsed: jobData },
            });

            result = {
              ok: true,
              needs_confirmation: true,
              message:
                `I parsed this job posting:\n\n` +
                `• Company: ${jobData.company}\n` +
                `• Role: ${jobData.role}\n` +
                `• Location: ${jobData.location ?? "Not specified"}\n` +
                `• Salary: ${jobData.salaryRange ?? "Not specified"}\n` +
                `• Requirements: ${jobData.requirements.slice(0, 5).join(", ")}${jobData.requirements.length > 5 ? "..." : ""}\n\n` +
                `Reply CONFIRM to save, or CANCEL to abort.`,
            };
          } catch (e: any) {
            console.error("Parse error:", e);
            result = {
              ok: false,
              error: `Failed to parse job posting: ${e.message}`,
            };
          }
        }

        // WRITE: set resume (store pending, ask user to confirm)
        else if (name === "set_resume") {
          const parsed = SetResumeSchema.parse(args);

          pendingBySession.set(sid, { type: "set_resume", args: parsed });

          result = {
            ok: true,
            needs_confirmation: true,
            message:
              `I'm about to save your resume:\n\n` +
              `• Skills: ${parsed.skills.join(", ")}\n` +
              (parsed.experience ? `• Experience: ${parsed.experience}\n` : "") +
              (parsed.education ? `• Education: ${parsed.education}\n` : "") +
              `\nReply CONFIRM to save, or CANCEL to abort.`,
          };
        }

        // READ: check fit
        else if (name === "check_fit") {
          const parsed = CheckFitSchema.parse(args);

          const resume = await getResume();
          if (!resume || resume.skills.length === 0) {
            result = {
              ok: false,
              error: "No resume found. Please set your skills first. Say: 'My skills are Python, React, SQL...'",
            };
          } else {
            const job = await findMostRecentByCompany(parsed.company);
            if (!job) {
              result = {
                ok: false,
                error: `No application found for "${parsed.company}". Try: "List my applications".`,
              };
            } else if (job.requirements.length === 0) {
              result = {
                ok: false,
                error: `The job at ${parsed.company} has no requirements saved. Try adding a job from URL to get full details.`,
              };
            } else {
              const match = await matchResumeToJob(
                resume.skills,
                job.requirements,
                job.niceToHaves
              );

              await updateApplicationMatch(job.id, {
                fitScore: match.fitScore,
                skillMatches: match.skillMatches,
                skillGaps: match.skillGaps,
              });

              result = {
                ok: true,
                match: {
                  company: job.company,
                  role: job.role,
                  fitScore: match.fitScore,
                  skillMatches: match.skillMatches,
                  skillGaps: match.skillGaps,
                  summary: match.summary,
                },
              };
            }
          }
        }

        // READ: get attention needed
        else if (name === "get_attention_needed") {
          const [stale, ghosted, needFollowUp, stats, topMatches] = await Promise.all([
            getStaleApplications(7),
            getGhostedCandidates(14),
            getNeedingFollowUp(),
            getApplicationStats(),
            getTopMatches(3),
          ]);

          result = {
            ok: true,
            summary: {
              stats,
              needsAttention: {
                stale: stale.map(a => ({
                  company: a.company,
                  role: a.role,
                  daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
                })),
                probablyGhosted: ghosted.map(a => ({
                  company: a.company,
                  role: a.role,
                  daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
                })),
                needFollowUp: needFollowUp.map(a => ({
                  company: a.company,
                  role: a.role,
                  daysSinceActivity: Math.floor((Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)),
                })),
              },
              topMatches: topMatches.map(a => ({
                company: a.company,
                role: a.role,
                fitScore: a.fitScore,
              })),
            },
          };
        }

        // ADD NOTE
else if (name === "add_note") {
  const { company, note, type = "note" } = args as { company: string; note: string; type?: string };
  
  const apps = await listApplications();
  const app = apps.find(a => a.company.toLowerCase().includes(company.toLowerCase()));
  
  if (!app) {
    result = { ok: false, error: `No application found for "${company}"` };
  } else {
    await addTimelineEvent(app.id, type as any, note);
    await prisma.application.update({
      where: { id: app.id },
      data: { lastActivityAt: new Date() },
    });
    
    result = { 
      ok: true, 
      message: `✅ Added note to ${app.company}: "${note}"`,
    };
  }
}

// GET APPLICATION HISTORY
else if (name === "get_application_history") {
  const { company } = args as { company: string };
  
  const apps = await listApplications();
  const app = apps.find(a => a.company.toLowerCase().includes(company.toLowerCase()));
  
  if (!app) {
    result = { ok: false, error: `No application found for "${company}"` };
  } else {
    const timeline = await getTimeline(app.id);
    
    result = {
      ok: true,
      application: {
        company: app.company,
        role: app.role,
        status: app.status,
        appliedAt: app.appliedAt,
      },
      timeline: timeline.map((e: { type: string; title: string; date: Date }) => ({
        type: e.type,
        title: e.title,
        date: e.date.toLocaleDateString(),
      })),
    };
  }
}

// DRAFT FOLLOW-UP EMAIL
else if (name === "draft_follow_up_email") {
  const { company, context } = args as { company: string; context?: string };
  
  const apps = await listApplications();
  const app = apps.find(a => a.company.toLowerCase().includes(company.toLowerCase()));
  
  if (!app) {
    result = { ok: false, error: `No application found for "${company}"` };
  } else {
    const timeline = await getTimeline(app.id);
    const resume = await getResume();
    const daysSinceApplied = app.appliedAt 
      ? Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const emailPrompt = `Draft a professional follow-up email.

Company: ${app.company}
Role: ${app.role}
Applied: ${daysSinceApplied ? `${daysSinceApplied} days ago` : 'Recently'}
Status: ${app.status}
${timeline.length > 0 ? `Recent Activity: ${timeline[0].title}` : ''}
${context ? `Context: ${context}` : ''}
${resume ? `Key Skills: ${resume.skills.slice(0, 5).join(', ')}` : ''}

Write a concise, professional follow-up email. Return ONLY the email body, no subject line.`;

    const emailResponse = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: emailPrompt }],
      temperature: 0.7,
    });

    result = {
      ok: true,
      subject: `Following Up: ${app.role} Application`,
      email: emailResponse.choices[0].message.content,
      instructions: "Copy this email and send it yourself. I cannot send emails for you.",
    };
  }
}


// TAILOR RESUME
else if (name === "tailor_resume") {
  const { company } = args as { company: string };
  
  const apps = await listApplications();
  const app = apps.find(a => a.company.toLowerCase().includes(company.toLowerCase()));
  
  if (!app) {
    result = { ok: false, error: `No application found for "${company}"` };
  } else {
    const resume = await getResume();
    
    if (!resume) {
      result = { ok: false, error: "No resume on file. Upload your resume first using the 📎 button." };
    } else {
      const tailorPrompt = `Give specific resume tailoring advice.

JOB:
- Company: ${app.company}
- Role: ${app.role}
- Requirements: ${app.requirements?.join(', ') || 'Not specified'}
- Nice to Haves: ${app.niceToHaves?.join(', ') || 'Not specified'}

RESUME:
- Skills: ${resume.skills.join(', ')}
- Experience: ${resume.experience || 'Not specified'}

Provide actionable advice:
1. Keywords to add
2. Skills to highlight
3. Skills gaps to address
4. How to frame experience

Be specific and concise.`;

      const tailorResponse = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: tailorPrompt }],
        temperature: 0.7,
      });

      result = {
        ok: true,
        company: app.company,
        role: app.role,
        advice: tailorResponse.choices[0].message.content,
      };
    }
  }
}
        else {
          result = { ok: false, error: "Unknown tool" };
        }
      } catch (e: any) {
        result = { ok: false, error: e.message };
      }

      if (result.needs_confirmation) {
        return NextResponse.json({ reply: result.message });
      }

      messages.push(choice.message);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      tools,
      tool_choice: "auto",
    });
  }

  const finalText = resp.choices[0].message.content ?? "";
  
  // Save to history
  history.push({ role: "user", content: message });
  history.push({ role: "assistant", content: finalText });

  // Trim history if too long
  if (history.length > MAX_HISTORY) {
    history = history.slice(-MAX_HISTORY);
  }
  historyBySession.set(sid, history);

  return NextResponse.json({ reply: finalText });
}