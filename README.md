# Job Tracker AI Agent

An intelligent job application tracking system with AI-powered features.

## Features

- **Dashboard** - Visual pipeline of all applications with status tracking
- **AI Chat Agent** - Natural language interface to manage applications
- **H1B Detection** - Chrome extension auto-detects visa sponsorship
- **Resume Matching** - AI compares your skills to job requirements
- **Follow-up Emails** - AI drafts professional follow-up emails
- **Resume Tailoring** - Get specific advice for each job
- **Analytics** - Track response rates, interviews, offers
- **Daily Summary** - Automated email reports

## Why This is an AI Agent (Not Just CRUD)

| Feature         | Traditional App      | This AI Agent                             |
| --------------- | -------------------- | ----------------------------------------- |
| Input           | Forms, dropdowns     | Natural language: "Add Google SWE job"    |
| Understanding   | Exact field matching | LLM interprets intent, handles variations |
| Data extraction | Manual copy-paste    | Paste URL → AI extracts structured data   |
| Decision making | None                 | Detects stale apps, suggests follow-ups   |
| Matching        | Keyword search       | Semantic understanding of skills          |
| Proactive       | None                 | "What needs attention?" analyzes all apps |

## Tech Stack

- **Frontend**: Next.js 14+, React, TypeScript, Recharts
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **AI**: OpenAI GPT-4.1-mini (function calling)
- **Email**: Resend
- **Extension**: Chrome Extension (Manifest V3)

## Agent Capabilities

```
 "Add note for Google: had phone screen with Sarah"
   → Records interaction in timeline

 "Write a follow-up email for Stripe"
   → Drafts professional email based on your resume & job details

 "How should I tailor my resume for this job?"
   → Analyzes job requirements vs your skills, gives specific advice

 "What needs my attention?"
   → Finds stale applications, suggests follow-ups, identifies ghosted apps
```

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/kellyYu721/job-tracker-agent.git
cd job-tracker-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/jobtracker
OPENAI_API_KEY=sk-your-key
RESEND_API_KEY=re_your-key
DAILY_SUMMARY_EMAIL=your@email.com
```

### 4. Set up database

```bash
npx prisma migrate dev
```

### 5. Run the app

```bash
npm run dev
```

## Chrome Extension Setup

1. Go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **"Load unpacked"**
4. Select the `chrome-extension` folder
5. Visit any job posting → Extension auto-parses H1B status!

## Project Structure

```
job-tracker-agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/        # AI chat agent
│   │   │   ├── dashboard/    # Dashboard data
│   │   │   ├── applications/ # CRUD endpoints
│   │   │   ├── parse-job/    # Job parsing
│   │   │   ├── resume/       # Resume upload
│   │   │   └── summary/      # Email summary
│   │   └── page.tsx          # Main dashboard
│   ├── components/
│   │   └── ChatBox.tsx       # Floating chat widget
│   └── lib/
│       ├── applications.ts   # Application logic
│       ├── matcher.ts        # Resume-job matching
│       ├── parser.ts         # Job posting parser
│       ├── resume.ts         # Resume handling
│       └── timeline.ts       # Activity timeline
├── chrome-extension/         # Browser extension
├── prisma/
│   └── schema.prisma         # Database schema
└── vercel.json               # Cron job config
```

## Key Technical Decisions

1. **OpenAI Function Calling** - Structured tool use for reliable actions
2. **Confirmation Flow** - All write operations require explicit CONFIRM
3. **Local H1B Detection** - Regex patterns for instant results, no API needed
4. **Conversation Memory** - Agent remembers context for follow-up questions
5. **Semantic Matching** - LLM understands skill equivalencies

## License

MIT

---

Built by [Kelly Yu](https://github.com/kellyYu721)
EOF
