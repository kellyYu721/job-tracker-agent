import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: Request) {
  // Verify cron secret (optional security)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await generateDailySummary();
    
    const recipientEmail = process.env.DAILY_SUMMARY_EMAIL;
    if (!recipientEmail) {
      return NextResponse.json({ error: "No recipient email configured" }, { status: 400 });
    }

    // Send email
    const { data, error } = await resend.emails.send({
      from: "Job Tracker <onboarding@resend.dev>", // Use your domain after verifying
      to: recipientEmail,
      subject: `Job Tracker Daily Summary - ${new Date().toLocaleDateString()}`,
      html: summary.html,
    });

    if (error) {
      console.error("Email error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, emailId: data?.id, summary: summary.stats });
  } catch (e: any) {
    console.error("Summary error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function generateDailySummary() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  // Get all applications
  const allApps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Applications added today
  const addedToday = allApps.filter(
    (a) => new Date(a.createdAt) >= todayStart
  );

  // Applications added yesterday (for comparison)
  const addedYesterday = allApps.filter(
    (a) => new Date(a.createdAt) >= yesterdayStart && new Date(a.createdAt) < todayStart
  );

  // Status counts
  const statusCounts = {
    total: allApps.length,
    applied: allApps.filter((a) => a.status === "APPLIED").length,
    interview: allApps.filter((a) => a.status === "INTERVIEW").length,
    offer: allApps.filter((a) => a.status === "OFFER").length,
    rejected: allApps.filter((a) => a.status === "REJECTED").length,
    ghosted: allApps.filter((a) => a.status === "GHOSTED").length,
  };

  // Stale applications (no activity in 7+ days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleApps = allApps.filter(
    (a) => a.status === "APPLIED" && new Date(a.lastActivityAt) < sevenDaysAgo
  );

  // Probably ghosted (14+ days no response)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const probablyGhosted = allApps.filter(
    (a) => a.status === "APPLIED" && new Date(a.lastActivityAt) < fourteenDaysAgo
  );

  // Response rate
  const responded = statusCounts.interview + statusCounts.offer + statusCounts.rejected;
  const totalApplied = statusCounts.applied + responded + statusCounts.ghosted;
  const responseRate = totalApplied > 0 ? Math.round((responded / totalApplied) * 100) : 0;

  // Recent activity (status changes in last 24 hours)
  const recentActivity = allApps.filter(
    (a) => new Date(a.lastActivityAt) >= todayStart && new Date(a.createdAt) < todayStart
  );

  // Build HTML email
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
        h2 { color: #374151; margin-top: 24px; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
        .stat-box { background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 28px; font-weight: bold; }
        .stat-label { font-size: 12px; color: #6b7280; }
        .applied { color: #3b82f6; }
        .interview { color: #f59e0b; }
        .offer { color: #10b981; }
        .rejected { color: #ef4444; }
        .ghosted { color: #9ca3af; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
        .app-list { background: #f9fafb; padding: 12px 16px; border-radius: 8px; margin: 8px 0; }
        .app-item { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .app-item:last-child { border-bottom: none; }
        .company { font-weight: 600; }
        .role { color: #6b7280; font-size: 14px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1> Daily Job Search Summary</h1>
      <p>Here's your job search update for <strong>${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</strong></p>

      <h2>📈 Today's Activity</h2>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-number applied">${addedToday.length}</div>
          <div class="stat-label">Added Today</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${recentActivity.length}</div>
          <div class="stat-label">Status Updates</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${addedYesterday.length}</div>
          <div class="stat-label">Added Yesterday</div>
        </div>
      </div>

      ${addedToday.length > 0 ? `
        <div class="app-list">
          <strong>Applications added today:</strong>
          ${addedToday.map((a) => `
            <div class="app-item">
              <span class="company">${a.company}</span> - <span class="role">${a.role}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <h2> Overall Status</h2>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-number">${statusCounts.total}</div>
          <div class="stat-label">Total Applications</div>
        </div>
        <div class="stat-box">
          <div class="stat-number applied">${statusCounts.applied}</div>
          <div class="stat-label">Pending Response</div>
        </div>
        <div class="stat-box">
          <div class="stat-number interview">${statusCounts.interview}</div>
          <div class="stat-label">Interviewing</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-number offer">${statusCounts.offer}</div>
          <div class="stat-label">Offers</div>
        </div>
        <div class="stat-box">
          <div class="stat-number rejected">${statusCounts.rejected}</div>
          <div class="stat-label">Rejected</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${responseRate}%</div>
          <div class="stat-label">Response Rate</div>
        </div>
      </div>

      ${staleApps.length > 0 ? `
        <h2>⚠️ Needs Attention</h2>
        <div class="alert">
          <strong>${staleApps.length} application${staleApps.length > 1 ? "s" : ""} with no activity in 7+ days.</strong>
          Consider following up!
        </div>
        <div class="app-list">
          ${staleApps.slice(0, 5).map((a) => `
            <div class="app-item">
              <span class="company">${a.company}</span> - <span class="role">${a.role}</span>
              <div style="font-size: 12px; color: #9ca3af;">
                ${Math.floor((now.getTime() - new Date(a.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))} days since activity
              </div>
            </div>
          `).join("")}
          ${staleApps.length > 5 ? `<div style="color: #6b7280; font-size: 13px;">...and ${staleApps.length - 5} more</div>` : ""}
        </div>
      ` : ""}

      ${probablyGhosted.length > 0 ? `
        <div class="alert" style="background: #f3f4f6; border-color: #9ca3af;">
          <strong>👻 ${probablyGhosted.length} application${probablyGhosted.length > 1 ? "s" : ""} likely ghosted</strong> (14+ days no response).
          Consider marking them or moving on.
        </div>
      ` : ""}

      <div class="footer">
        <p>This is your automated daily summary from Job Tracker Agent.</p>
        <p>Keep up the great work! 💪</p>
      </div>
    </body>
    </html>
  `;

  return {
    html,
    stats: {
      addedToday: addedToday.length,
      totalApplications: statusCounts.total,
      statusCounts,
      staleCount: staleApps.length,
      responseRate,
    },
  };
}

// Also allow POST for manual testing
export async function POST(req: Request) {
  return GET(req);
}