// Job Tracker - FAST local parsing + optional AI enhancement
(function() {
  let currentJobUrl = null;
  let widgetElement = null;
  let parseTimeout = null;
  let userSkills = null;

  // Load user skills from storage
  chrome.storage.local.get(['userSkills'], (result) => {
    userSkills = result.userSkills || [];
  });

  
  // ========== FAST LOCAL PARSING ==========

// H1B detection keywords - NO sponsorship
const NO_H1B_PATTERNS = [
  // Direct sponsorship denial
  /not\s+sponsor/i,
  /no\s+sponsor/i,
  /unable\s+to\s+sponsor/i,
  /cannot\s+sponsor/i,
  /will\s+not\s+sponsor/i,
  /without\s+sponsor/i,
  /don'?t\s+sponsor/i,
  /does\s+not\s+sponsor/i,
  /no\s+visa\s+sponsor/i,
  /no\s+h-?1b/i,
  /not\s+eligible\s+for\s+(visa\s+)?sponsor/i,
  /sponsorship\s+is\s+not\s+available/i,
  /visa\s+sponsorship\s+is\s+not\s+available/i,
  /sponsorship\s+not\s+available/i,
  
  // Work authorization requirements
  // /must\s+be\s+(legally\s+)?authorized/i,
  // /must\s+have\s+(valid\s+)?(work\s+)?authorization/i,
  // /authorized\s+to\s+work\s+(in\s+)?(the\s+)?(us|u\.s\.|united\s+states)/i,
  // /eligibility\s+to\s+work/i,
  // /are\s+you\s+authorized\s+to\s+work/i,
  // /legally\s+authorized\s+to\s+work/i,
  // /legally\s+permitted\s+to\s+work/i,
  // /proof\s+of\s+(work\s+)?authorization/i,
  // /employment\s+eligibility/i,
  
  // US Citizens / Green Card only
  /citizens?\s+(and|or)\s+(permanent\s+)?residents?\s+only/i,
  /us\s+citizen(ship)?\s+required/i,
  /must\s+be\s+(a\s+)?us\s+citizen/i,
  /only\s+(eligible|available)\s+(for|to)\s+(people|candidates|individuals)?\s*(who\s+are\s+)?us\s+citizens?/i,
  /eligible\s+(only\s+)?for\s+(us\s+)?citizens?\s+(or|and)\s+(current\s+)?green\s+card/i,
  /us\s+citizens?\s+or\s+(current\s+)?green\s+card\s+holders?/i,
  /green\s+card\s+holders?\s+(only|required)/i,
  /permanent\s+resident(s)?\s+(only|required)/i,
  /u\.?s\.?\s+person(s)?\s+(only|required)/i,
  
  // Security clearance
  /security\s+clearance\s+required/i,
  /clearance\s+required/i,
  /active\s+(and\s+)?transferable\s+.*clearance/i,
  /u\.?s\.?\s+citizen.*clearance/i,
  /clearance.*u\.?s\.?\s+citizen/i,
  /itar\s+(regulations?|restricted|compliance)/i,
  /export\s+control/i,
  
  // Specific visa types not supported
  /cannot\s+(provide|support).*visa/i,
  /cannot\s+(provide|support).*(opt|cpt|ead|h-?1b|tn)/i,
  /not\s+(provide|support).*(opt|cpt|ead|h-?1b|tn)/i,
  /no\s+(opt|cpt|ead|h-?1b|tn)\s*(support)?/i,
  /(opt|cpt|ead|h-?1b|tn)\s+(is\s+)?not\s+(accepted|supported|available)/i,
  /employment\s+visa.*not\s+(available|supported)/i,
  /work\s+authorization\s+paperwork/i,
  
  // E-Verify (often implies no sponsorship)
  /e-?verify\s+employer/i,
  /participate.*e-?verify/i,
];

// H1B detection keywords - YES sponsorship
const YES_H1B_PATTERNS = [
  /will\s+sponsor/i,
  /visa\s+sponsor(ship)?\s+(available|provided|offered)/i,
  /h-?1b\s+(transfer\s+)?(welcome|accepted|supported)/i,
  /sponsor(s|ing)?\s+(h-?1b|visa|work\s+authorization)/i,
  /open\s+to\s+sponsor/i,
  /sponsorship\s+(is\s+)?available/i,
  /immigration\s+(assistance|support)/i,
  /visa\s+support\s+available/i,
  /international\s+candidates?\s+(welcome|encouraged)/i,
  /willing\s+to\s+sponsor/i,
  /can\s+sponsor/i,
  /sponsor.*qualified\s+candidates?/i,
];

  // Common tech skills for matching
  const SKILL_PATTERNS = {
    languages: /\b(javascript|typescript|python|java|c\+\+|c#|ruby|go|golang|rust|swift|kotlin|php|scala|r\b|sql|html|css)\b/gi,
    frameworks: /\b(react|angular|vue|next\.?js|node\.?js|express|django|flask|spring|rails|laravel|\.net|tensorflow|pytorch|keras)\b/gi,
    cloud: /\b(aws|azure|gcp|google\s+cloud|amazon\s+web\s+services|kubernetes|k8s|docker|terraform|jenkins|ci\/cd)\b/gi,
    databases: /\b(mysql|postgresql|postgres|mongodb|redis|elasticsearch|dynamodb|cassandra|oracle|sql\s+server)\b/gi,
    tools: /\b(git|github|gitlab|jira|confluence|figma|sketch|webpack|npm|yarn|linux|unix|agile|scrum)\b/gi,
    ai_ml: /\b(machine\s+learning|deep\s+learning|nlp|natural\s+language|computer\s+vision|ai|artificial\s+intelligence|llm|gpt|transformers)\b/gi,
  };

  // Experience level detection
  const EXPERIENCE_PATTERNS = {
    entry: /\b(entry[\s-]?level|junior|0-2\s+years?|1-2\s+years?|new\s+grad|recent\s+graduate)\b/gi,
    mid: /\b(mid[\s-]?level|3-5\s+years?|2-4\s+years?|4-6\s+years?)\b/gi,
    senior: /\b(senior|sr\.?|lead|principal|staff|7\+\s+years?|5\+\s+years?|8\+\s+years?|10\+\s+years?)\b/gi,
  };

  // Fast local parse function
  function fastParse(text) {
    const result = {
      h1b: 'unknown',
      h1bReason: null,
      company: null,
      role: null,
      location: null,
      salary: null,
      skills: [],
      experience: null,
      matchedSkills: [],
      missingSkills: [],
    };

    // Check H1B status
    for (const pattern of NO_H1B_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        result.h1b = 'no';
        result.h1bReason = match[0];
        break;
      }
    }

    if (result.h1b === 'unknown') {
      for (const pattern of YES_H1B_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          result.h1b = 'yes';
          result.h1bReason = match[0];
          break;
        }
      }
    }

    // Extract skills
    const allSkills = new Set();
    for (const [category, pattern] of Object.entries(SKILL_PATTERNS)) {
      const matches = text.match(pattern) || [];
      matches.forEach(skill => allSkills.add(skill.toLowerCase()));
    }
    result.skills = Array.from(allSkills);

    // Match with user skills
    if (userSkills && userSkills.length > 0) {
      const userSkillsLower = userSkills.map(s => s.toLowerCase());
      result.matchedSkills = result.skills.filter(s => 
        userSkillsLower.some(us => s.includes(us) || us.includes(s))
      );
      result.missingSkills = result.skills.filter(s => 
        !userSkillsLower.some(us => s.includes(us) || us.includes(s))
      );
    }

    // Detect experience level
    for (const [level, pattern] of Object.entries(EXPERIENCE_PATTERNS)) {
      if (pattern.test(text)) {
        result.experience = level;
        break;
      }
    }

    // Extract salary (common patterns)
    const salaryMatch = text.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per\s+)?(?:year|yr|annually|\/yr|\/year|k))?/i);
    if (salaryMatch) {
      result.salary = salaryMatch[0];
    }

    // Try to extract company and role from page
    result.company = extractCompany();
    result.role = extractRole();
    result.location = extractLocation();

    return result;
  }

  function extractCompany() {
    // Indeed
    const indeedCompany = document.querySelector('[data-testid="inlineHeader-companyName"]') ||
                          document.querySelector('.jobsearch-InlineCompanyRating-companyHeader') ||
                          document.querySelector('.company_name');
    if (indeedCompany) return indeedCompany.innerText.trim();

    // LinkedIn
    const linkedinCompany = document.querySelector('.jobs-unified-top-card__company-name') ||
                            document.querySelector('.job-details-jobs-unified-top-card__company-name');
    if (linkedinCompany) return linkedinCompany.innerText.trim();

    // Greenhouse/Lever - usually in the page title or header
    const pageTitle = document.title;
    const titleMatch = pageTitle.match(/at\s+(.+?)(?:\s*[-|]|$)/i);
    if (titleMatch) return titleMatch[1].trim();

    return null;
  }

  function extractRole() {
    // Indeed
    const indeedRole = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]') ||
                       document.querySelector('.jobsearch-JobInfoHeader-title') ||
                       document.querySelector('h1.jobTitle');
    if (indeedRole) return indeedRole.innerText.trim();

    // LinkedIn
    const linkedinRole = document.querySelector('.jobs-unified-top-card__job-title') ||
                         document.querySelector('.job-details-jobs-unified-top-card__job-title');
    if (linkedinRole) return linkedinRole.innerText.trim();

    // Generic h1
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.length < 100) return h1.innerText.trim();

    return null;
  }

  function extractLocation() {
    // Indeed
    const indeedLocation = document.querySelector('[data-testid="inlineHeader-companyLocation"]') ||
                           document.querySelector('.jobsearch-JobInfoHeader-subtitle > div');
    if (indeedLocation) return indeedLocation.innerText.trim();

    // LinkedIn
    const linkedinLocation = document.querySelector('.jobs-unified-top-card__bullet');
    if (linkedinLocation) return linkedinLocation.innerText.trim();

    return null;
  }

  // ========== UI ==========

   function createWidget() {
  if (widgetElement) {
    widgetElement.remove();
  }

  widgetElement = document.createElement('div');
  widgetElement.id = 'job-tracker-widget';
  widgetElement.innerHTML = `
    <style>
      #jt-widget {
        position: fixed;
        top: 80px;
        right: 20px;
        width: 300px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        transition: all 0.2s ease;
      }
      #jt-widget.minimized {
        width: auto;
      }
      #jt-widget.minimized #jt-body { display: none; }
      #jt-widget.minimized #jt-header { border-radius: 12px; cursor: pointer; }
      #jt-header {
        background: #1a1a1a;
        color: white;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 600;
      }
      #jt-header-btns {
        display: flex;
        gap: 8px;
      }
      .jt-header-btn {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        cursor: pointer;
        font-size: 16px;
        padding: 4px 8px;
        border-radius: 4px;
        line-height: 1;
      }
      .jt-header-btn:hover { background: rgba(255,255,255,0.2); }
      #jt-body { padding: 12px; }
      
      .jt-h1b {
        padding: 10px 12px;
        border-radius: 8px;
        margin-bottom: 12px;
        font-weight: 600;
        font-size: 14px;
      }
      .jt-h1b-yes { background: #d1fae5; color: #065f46; }
      .jt-h1b-no { background: #fee2e2; color: #991b1b; }
      .jt-h1b-unknown { background: #f3f4f6; color: #6b7280; }
      .jt-h1b-reason {
        font-size: 11px;
        font-weight: normal;
        opacity: 0.8;
        margin-top: 4px;
      }

      .jt-job-title {
        font-weight: 600;
        font-size: 15px;
        color: #1a1a1a;
        margin-bottom: 2px;
      }
      .jt-job-company {
        color: #666;
        font-size: 13px;
      }
      .jt-job-meta {
        color: #888;
        font-size: 12px;
        margin-top: 4px;
      }
      .jt-job-salary {
        color: #10b981;
        font-weight: 500;
      }

      .jt-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #eee;
      }
      .jt-section-title {
        font-size: 11px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      
      .jt-skills {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .jt-skill {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
      }
      .jt-skill-match { background: #d1fae5; color: #065f46; }
      .jt-skill-missing { background: #fee2e2; color: #991b1b; }
      .jt-skill-neutral { background: #f3f4f6; color: #374151; }

      .jt-match-score {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      .jt-match-bar {
        flex: 1;
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
      }
      .jt-match-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .jt-match-text {
        font-size: 13px;
        font-weight: 600;
        min-width: 45px;
      }

      .jt-btn {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        margin-top: 12px;
        transition: all 0.15s ease;
      }
      .jt-btn:hover { transform: scale(1.02); }
      .jt-btn-primary { background: #3b82f6; color: white; }
      .jt-btn-success { background: #10b981; color: white; }
      .jt-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    </style>
    <div id="jt-widget">
      <div id="jt-header">
        <span id="jt-header-title">💼 Analyzing...</span>
        <div id="jt-header-btns">
          <button class="jt-header-btn" id="jt-minimize" title="Minimize">−</button>
          <button class="jt-header-btn" id="jt-close" title="Close">✕</button>
        </div>
      </div>
      <div id="jt-body">
        <div id="jt-content"></div>
      </div>
    </div>
  `;

  document.body.appendChild(widgetElement);

  // Close button
  const closeBtn = document.getElementById('jt-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    widgetElement.style.display = 'none';
  });

  // Minimize button
  const minimizeBtn = document.getElementById('jt-minimize');
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const widget = document.getElementById('jt-widget');
    widget.classList.toggle('minimized');
    minimizeBtn.textContent = widget.classList.contains('minimized') ? '+' : '−';
  });

  // Click header to expand when minimized
  const header = document.getElementById('jt-header');
  header.addEventListener('click', (e) => {
    // Only expand if clicking on header background, not buttons
    if (e.target === header || e.target.id === 'jt-header-title') {
      const widget = document.getElementById('jt-widget');
      if (widget.classList.contains('minimized')) {
        widget.classList.remove('minimized');
        minimizeBtn.textContent = '−';
      }
    }
  });
}

  function renderResults(parsed, jobText) {
    const content = document.getElementById('jt-content');
    const headerTitle = document.getElementById('jt-header-title');

    // H1B badge
    let h1bClass, h1bText, h1bEmoji;
    if (parsed.h1b === 'yes') {
      h1bClass = 'jt-h1b-yes';
      h1bText = 'H1B Visa Sponsored';
      h1bEmoji = '✅';
    } else if (parsed.h1b === 'no') {
      h1bClass = 'jt-h1b-no';
      h1bText = 'No H1B Sponsorship';
      h1bEmoji = '❌';
    } else {
      h1bClass = 'jt-h1b-unknown';
      h1bText = 'H1B Status Unknown';
      h1bEmoji = '❓';
    }

    headerTitle.textContent = `${h1bEmoji} ${parsed.company || 'Job'}`;

    // Calculate match score
    const matchScore = parsed.skills.length > 0 
      ? Math.round((parsed.matchedSkills.length / parsed.skills.length) * 100)
      : 0;
    
    const matchColor = matchScore >= 70 ? '#10b981' : matchScore >= 40 ? '#f59e0b' : '#ef4444';

    content.innerHTML = `
      <div class="jt-h1b ${h1bClass}">
        ${h1bEmoji} ${h1bText}
        ${parsed.h1bReason ? `<div class="jt-h1b-reason">"${parsed.h1bReason}"</div>` : ''}
      </div>

      <div class="jt-job-title">${parsed.role || 'Job Position'}</div>
      <div class="jt-job-company">${parsed.company || 'Company'}</div>
      <div class="jt-job-meta">
        ${parsed.location ? `📍 ${parsed.location}` : ''}
        ${parsed.experience ? ` • ${parsed.experience.charAt(0).toUpperCase() + parsed.experience.slice(1)} Level` : ''}
      </div>
      ${parsed.salary ? `<div class="jt-job-meta jt-job-salary">💰 ${parsed.salary}</div>` : ''}

      ${userSkills && userSkills.length > 0 ? `
        <div class="jt-section">
          <div class="jt-section-title">Resume Match</div>
          <div class="jt-match-score">
            <div class="jt-match-bar">
              <div class="jt-match-fill" style="width: ${matchScore}%; background: ${matchColor};"></div>
            </div>
            <span class="jt-match-text" style="color: ${matchColor};">${matchScore}%</span>
          </div>
        </div>
      ` : ''}

      ${parsed.matchedSkills.length > 0 ? `
        <div class="jt-section">
          <div class="jt-section-title">✓ Skills You Have (${parsed.matchedSkills.length})</div>
          <div class="jt-skills">
            ${parsed.matchedSkills.slice(0, 8).map(s => `<span class="jt-skill jt-skill-match">${s}</span>`).join('')}
            ${parsed.matchedSkills.length > 8 ? `<span class="jt-skill jt-skill-match">+${parsed.matchedSkills.length - 8}</span>` : ''}
          </div>
        </div>
      ` : ''}

      ${parsed.missingSkills.length > 0 ? `
        <div class="jt-section">
          <div class="jt-section-title">✗ Skills to Learn (${parsed.missingSkills.length})</div>
          <div class="jt-skills">
            ${parsed.missingSkills.slice(0, 6).map(s => `<span class="jt-skill jt-skill-missing">${s}</span>`).join('')}
            ${parsed.missingSkills.length > 6 ? `<span class="jt-skill jt-skill-missing">+${parsed.missingSkills.length - 6}</span>` : ''}
          </div>
        </div>
      ` : ''}

      ${!userSkills || userSkills.length === 0 ? `
        <div class="jt-section">
          <div class="jt-section-title">Skills Required (${parsed.skills.length})</div>
          <div class="jt-skills">
            ${parsed.skills.slice(0, 10).map(s => `<span class="jt-skill jt-skill-neutral">${s}</span>`).join('')}
            ${parsed.skills.length > 10 ? `<span class="jt-skill jt-skill-neutral">+${parsed.skills.length - 10}</span>` : ''}
          </div>
        </div>
      ` : ''}

      <button class="jt-btn jt-btn-primary" id="jt-save-btn">📥 Save to Tracker</button>
    `;

    // Save button
    document.getElementById('jt-save-btn').addEventListener('click', async () => {
      const btn = document.getElementById('jt-save-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Saving...';

      try {
        const response = await fetch('http://localhost:3000/api/parse-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: jobText, 
            url: window.location.href, 
            save: true 
          }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        btn.textContent = '✅ Saved!';
        btn.className = 'jt-btn jt-btn-success';
      } catch (err) {
        btn.textContent = '❌ ' + err.message;
        setTimeout(() => {
          btn.textContent = '📥 Save to Tracker';
          btn.className = 'jt-btn jt-btn-primary';
          btn.disabled = false;
        }, 2000);
      }
    });
  }

  // ========== MAIN LOGIC ==========

  function getJobDescription() {
    const selectors = [
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '.jobs-description',
      '.job-description',
      '[data-testid="job-description"]',
      '.jobsearch-RightPane',
      'article',
      'main'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText.length > 200) {
        return el.innerText;
      }
    }

    return null;
  }

  function analyzeJob() {
    const jobText = getJobDescription();
    if (!jobText || jobText.length < 100) return;

    const newUrl = window.location.href;
    if (newUrl === currentJobUrl) return;
    currentJobUrl = newUrl;

    createWidget();
    widgetElement.style.display = 'block';

    // FAST local parse (instant!)
    const parsed = fastParse(jobText);
    renderResults(parsed, jobText);
  }

  // Watch for job changes
  function watchForJobs() {
    // Click listener
    document.addEventListener('click', () => {
      if (parseTimeout) clearTimeout(parseTimeout);
      parseTimeout = setTimeout(analyzeJob, 800);
    });

    // URL change listener
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (parseTimeout) clearTimeout(parseTimeout);
        parseTimeout = setTimeout(analyzeJob, 800);
      }
    }, 300);

    // Initial check
    setTimeout(analyzeJob, 1000);
  }

  // Start
  watchForJobs();
})();