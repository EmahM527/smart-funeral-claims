from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import copy

# ── Colour palette ──────────────────────────────────────────────────────────
DARK_NAVY   = RGBColor(0x0D, 0x1B, 0x2A)
MID_BLUE    = RGBColor(0x1B, 0x48, 0x86)
ACCENT_TEAL = RGBColor(0x00, 0xB4, 0xD8)
LIGHT_GREY  = RGBColor(0xF0, 0xF4, 0xF8)
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
GOLD        = RGBColor(0xFF, 0xC3, 0x00)

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)

BLANK = prs.slide_layouts[6]   # completely blank layout

# ── Helper utilities ─────────────────────────────────────────────────────────

def add_rect(slide, l, t, w, h, fill_rgb, alpha=None):
    shape = slide.shapes.add_shape(1, Inches(l), Inches(t), Inches(w), Inches(h))
    shape.line.fill.background()
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_rgb
    return shape

def add_textbox(slide, l, t, w, h, text, font_size=18, bold=False,
                color=WHITE, align=PP_ALIGN.LEFT, wrap=True):
    txb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    txb.word_wrap = wrap
    tf = txb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = "Calibri"
    return txb

def add_bullet_textbox(slide, l, t, w, h, lines, font_size=15,
                       color=DARK_NAVY, title=None, title_size=18):
    txb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    txb.word_wrap = True
    tf = txb.text_frame
    tf.word_wrap = True
    first = True
    if title:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = PP_ALIGN.LEFT
        run = p.add_run()
        run.text = title
        run.font.size = Pt(title_size)
        run.font.bold = True
        run.font.color.rgb = MID_BLUE
        run.font.name = "Calibri"
    for line in lines:
        if first:
            p = tf.paragraphs[0]
            first = False
        else:
            p = tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.level = 0
        run = p.add_run()
        run.text = line
        run.font.size = Pt(font_size)
        run.font.color.rgb = color
        run.font.name = "Calibri"
    return txb

def slide_base(header_text, q_label=None):
    """Create a new slide with standard header bar."""
    slide = prs.slides.add_slide(BLANK)
    # background
    add_rect(slide, 0, 0, 13.33, 7.5, LIGHT_GREY)
    # header bar
    add_rect(slide, 0, 0, 13.33, 1.1, DARK_NAVY)
    # accent stripe
    add_rect(slide, 0, 1.1, 13.33, 0.07, ACCENT_TEAL)
    # header text
    add_textbox(slide, 0.3, 0.15, 10, 0.8, header_text,
                font_size=26, bold=True, color=WHITE)
    # question label badge
    if q_label:
        add_rect(slide, 11.5, 0.15, 1.6, 0.55, ACCENT_TEAL)
        add_textbox(slide, 11.5, 0.15, 1.6, 0.55, q_label,
                    font_size=13, bold=True, color=DARK_NAVY, align=PP_ALIGN.CENTER)
    # footer
    add_rect(slide, 0, 7.1, 13.33, 0.4, DARK_NAVY)
    add_textbox(slide, 0.3, 7.1, 9, 0.4,
                "DataSecure Solutions  |  FIR411  |  Cloud Security Awareness",
                font_size=10, color=ACCENT_TEAL)
    add_textbox(slide, 11, 7.1, 2.0, 0.4, "2026",
                font_size=10, color=LIGHT_GREY, align=PP_ALIGN.RIGHT)
    return slide

def two_column(slide, left_title, left_bullets, right_title, right_bullets,
               top=1.3, height=5.6, font_size=14):
    col_w = 6.2
    # left card
    add_rect(slide, 0.3, top, col_w, height, WHITE)
    add_bullet_textbox(slide, 0.5, top+0.15, col_w-0.4, height-0.3,
                       left_bullets, font_size=font_size, color=DARK_NAVY,
                       title=left_title)
    # right card
    add_rect(slide, 6.8, top, col_w, height, WHITE)
    add_bullet_textbox(slide, 7.0, top+0.15, col_w-0.4, height-0.3,
                       right_bullets, font_size=font_size, color=DARK_NAVY,
                       title=right_title)

def single_card(slide, bullets, top=1.3, height=5.6, font_size=14, title=None):
    add_rect(slide, 0.3, top, 12.73, height, WHITE)
    add_bullet_textbox(slide, 0.5, top+0.15, 12.33, height-0.3,
                       bullets, font_size=font_size, color=DARK_NAVY, title=title)

# ════════════════════════════════════════════════════════════════════════════
# TITLE SLIDE
# ════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(BLANK)
add_rect(slide, 0, 0, 13.33, 7.5, DARK_NAVY)
add_rect(slide, 0, 2.8, 13.33, 0.1, ACCENT_TEAL)
add_rect(slide, 0, 5.5, 13.33, 0.1, ACCENT_TEAL)
add_rect(slide, 0, 5.6, 13.33, 1.9, MID_BLUE)

add_textbox(slide, 0.5, 0.5, 12.0, 0.8,
            "DATASECURE SOLUTIONS", 20, bold=True, color=ACCENT_TEAL,
            align=PP_ALIGN.CENTER)
add_textbox(slide, 0.5, 1.2, 12.0, 1.3,
            "Cloud Security Awareness", 44, bold=True, color=WHITE,
            align=PP_ALIGN.CENTER)
add_textbox(slide, 0.5, 2.5, 12.0, 0.6,
            "Workplace Professional Skills  |  FIR411", 20, color=GOLD,
            align=PP_ALIGN.CENTER)
add_textbox(slide, 0.5, 3.2, 12.0, 2.0,
            "Covering: Presentation Skills • 4IR Technologies\n"
            "Compliance & Ethics • Teamwork • Meetings & Participation",
            18, color=LIGHT_GREY, align=PP_ALIGN.CENTER)
add_textbox(slide, 0.5, 5.65, 12.0, 0.5,
            "Presented by: Cloud Administrator  |  DataSecure Solutions  |  2026",
            14, color=WHITE, align=PP_ALIGN.CENTER)

# ════════════════════════════════════════════════════════════════════════════
# QUESTION 1 – PRESENTATION SKILLS (PS01)
# ════════════════════════════════════════════════════════════════════════════

# --- Q1 Overview ---
s = slide_base("Q1: Presentation Skills (PS01)", "PS01 | 25 Marks")
single_card(s, [
    "Scenario:  New employees are joining DataSecure Solutions and need a formal",
    "introduction to Cloud Security Awareness.",
    "",
    "Tasks Covered:",
    "  1.  Audience Analysis – understand who we are presenting to",
    "  2.  Objective – define what the presentation must achieve",
    "  3.  Presentation Structure – Introduction, Body, Conclusion",
    "  4.  Tools & Technology – choose the right delivery platform",
], font_size=15, title="Overview")

# --- Q1 Audience Analysis ---
s = slide_base("Q1: Audience Analysis", "PS01 | 5 Marks")
two_column(s,
    "Who is the Audience?",
    [
        "• New employees – diverse backgrounds",
        "• Mix of technical & non-technical staff",
        "• Limited prior cloud security knowledge",
        "• Different learning styles (visual, auditory)",
        "• Age range: 20s – 40s",
    ],
    "How Does This Influence Style?",
    [
        "• Use plain language – avoid heavy jargon",
        "• Include visuals: diagrams & icons",
        "• Keep slides simple & uncluttered",
        "• Allow Q&A time for engagement",
        "• Provide take-away handouts/checklists",
        "• Use relatable real-world examples",
    ]
)

# --- Q1 Objective ---
s = slide_base("Q1: Presentation Objective", "PS01 | 5 Marks")
single_card(s, [
    "Primary Objective:",
    "  To educate new employees on the fundamental principles of Cloud Security",
    "  and their individual responsibilities in protecting company and client data.",
    "",
    "Specific Outcomes – By the end of the session, employees will be able to:",
    "  ✓  Define cloud security and explain why it matters",
    "  ✓  Identify the most common cloud security threats (phishing, weak passwords, data leaks)",
    "  ✓  Apply best practices: strong passwords, MFA, least-privilege access",
    "  ✓  Report suspicious activity through the correct channels",
    "  ✓  Understand their legal obligations under POPIA (Protection of Personal Information Act)",
], font_size=14, title="SMART Objective")

# --- Q1 Presentation Structure ---
s = slide_base("Q1: Presentation Structure", "PS01 | 10 Marks")
single_card(s, [
    "INTRODUCTION  (5 min)",
    "  • Welcome & self-introduction",
    "  • State the purpose and outcomes of the session",
    "  • Icebreaker: 'Have you ever received a suspicious email?'",
    "",
    "BODY  (20 min)",
    "  Section 1 – What is Cloud Security?",
    "    – Cloud models (IaaS, PaaS, SaaS) and shared responsibility",
    "  Section 2 – Common Threats",
    "    – Phishing, ransomware, insider threats, weak credentials",
    "  Section 3 – Best Practices",
    "    – MFA, password policies, data classification, VPN use",
    "  Section 4 – Company Policies & POPIA Obligations",
    "    – Acceptable Use Policy, incident reporting procedures",
    "",
    "CONCLUSION  (5 min)",
    "  • Recap key takeaways",
    "  • Q&A session",
    "  • Hand out Security Awareness Checklist",
], font_size=12, title="Structured Outline")

# --- Q1 Tools ---
s = slide_base("Q1: Presentation Tools & Technologies", "PS01 | 5 Marks")
two_column(s,
    "Delivery Tools",
    [
        "• Microsoft PowerPoint",
        "   – Branded slides, animations, notes",
        "• Microsoft Teams / Zoom",
        "   – Remote / hybrid delivery",
        "• Mentimeter / Slido",
        "   – Live polls & interactive quizzes",
        "• YouTube clips",
        "   – Short security awareness videos",
    ],
    "Why These Tools?",
    [
        "• PowerPoint: widely used, professional",
        "• Teams: supports screen sharing & recording",
        "• Mentimeter: increases engagement & feedback",
        "• Video clips: cater for visual learners",
        "• All tools are cloud-based – consistent",
        "  with the cloud-first workplace culture",
    ]
)

# ════════════════════════════════════════════════════════════════════════════
# QUESTION 2 – 4IR RESEARCH & APPLICATION (PS02)
# ════════════════════════════════════════════════════════════════════════════

s = slide_base("Q2: 4IR Research & Application (PS02)", "PS02 | 25 Marks")
single_card(s, [
    "Scenario:  Management at DataSecure Solutions wants to introduce Fourth Industrial",
    "Revolution (4IR) technologies to improve cloud operations and business efficiency.",
    "",
    "Tasks Covered:",
    "  1.  Identify TWO relevant 4IR technologies",
    "  2.  Explain how each technology is used in the workplace",
    "  3.  Describe efficiency improvements & reduced development time",
    "  4.  Provide ONE practical company example",
], font_size=15, title="Overview")

s = slide_base("Q2: Technology 1 – Artificial Intelligence & Machine Learning", "PS02 | 10 Marks")
two_column(s,
    "What is AI/ML?",
    [
        "• Algorithms that learn from data to make",
        "  decisions without explicit programming",
        "• Subset of 4IR's intelligent automation",
        "• Examples: ChatGPT, AWS SageMaker,",
        "  Google AutoML",
    ],
    "Use in the Cloud Workplace",
    [
        "• Threat detection: analyse login patterns,",
        "  flag anomalies in real time",
        "• Automated incident response: quarantine",
        "  compromised accounts instantly",
        "• Predictive maintenance: forecast server",
        "  failures before they occur",
        "• AI chatbots: handle Tier-1 IT support 24/7",
        "• Code review assistants: auto-scan for",
        "  vulnerabilities in deployment pipelines",
    ]
)

s = slide_base("Q2: Technology 2 – Internet of Things (IoT)", "PS02 | 10 Marks")
two_column(s,
    "What is IoT?",
    [
        "• Network of physical devices embedded with",
        "  sensors & software that collect and exchange",
        "  data via the cloud",
        "• Examples: smart CCTV, biometric scanners,",
        "  smart building systems",
    ],
    "Use in the Cloud Workplace",
    [
        "• Physical security: IoT door sensors &",
        "  biometrics control server room access",
        "• Environmental monitoring: temperature &",
        "  humidity alerts for data centres",
        "• Asset tracking: monitor hardware in real time",
        "• Energy management: smart systems reduce",
        "  power consumption by up to 30%",
        "• Edge computing: IoT devices process data",
        "  locally, reducing cloud latency",
    ]
)

s = slide_base("Q2: Efficiency Gains & Practical Example", "PS02 | 10 Marks")
two_column(s,
    "Efficiency Improvements",
    [
        "AI/ML:",
        "  • Reduces manual security monitoring by ~70%",
        "  • Cuts incident response time from hours to seconds",
        "  • Automates repetitive dev/test tasks",
        "",
        "IoT:",
        "  • Real-time visibility reduces downtime",
        "  • Predictive alerts cut hardware failures by 40%",
        "  • Reduces on-site IT staff requirements",
    ],
    "Practical Company Example",
    [
        "DataSecure Solutions Implementation:",
        "",
        "  Phase 1 – AI: Deploy AWS GuardDuty (ML-based",
        "  threat detection) across all client cloud accounts.",
        "  Automated playbooks quarantine threats in < 60 s.",
        "",
        "  Phase 2 – IoT: Install smart access control &",
        "  temperature sensors in the data centre.",
        "  Dashboard alerts engineers before hardware fails.",
        "",
        "  Result: 60% fewer security incidents | 35% lower",
        "  operational costs in the first 6 months.",
    ]
)

# ════════════════════════════════════════════════════════════════════════════
# QUESTION 3 – COMPLIANCE & ETHICS (PS03)
# ════════════════════════════════════════════════════════════════════════════

s = slide_base("Q3: Compliance & Ethics (PS03)", "PS03 | 25 Marks")
single_card(s, [
    "Scenario:  Some employees are not following cloud security procedures,",
    "potentially putting client data and the company at legal risk.",
    "",
    "Tasks Covered:",
    "  1.  Explain ethics & governance in the workplace",
    "  2.  Compare company policies vs legal requirements (POPIA)",
    "  3.  Identify ONE risk or gap in current practices",
    "  4.  Suggest improvements to compliance & ethical behaviour",
], font_size=15, title="Overview")

s = slide_base("Q3: Ethics & Governance in the Workplace", "PS03 | 5 Marks")
two_column(s,
    "Ethics",
    [
        "• Doing what is right, not just what is allowed",
        "• Honesty, integrity, and accountability",
        "• Protecting client confidentiality",
        "• Reporting breaches even when inconvenient",
        "• Not sharing credentials or bypassing controls",
        "• Treating colleague & client data with respect",
    ],
    "Governance",
    [
        "• Framework of rules, policies & oversight",
        "• Ensures accountability at every level",
        "• Includes: Acceptable Use Policy (AUP),",
        "  Data Classification Policy, Incident",
        "  Response Plan, Access Control Policy",
        "• Regular audits & compliance reviews",
        "• Board-level responsibility for data protection",
    ]
)

s = slide_base("Q3: Company Policy vs POPIA Legislation", "PS03 | 10 Marks")
single_card(s, [
    "Company Policy (Internal)                    vs                    POPIA (Legal Requirement)",
    "",
    "Password Policy: change every 90 days        →   POPIA §19: reasonable security measures required",
    "Data Classification: Internal / Confidential →   POPIA §14: purpose limitation & data minimisation",
    "Incident Reporting: report to IT within 4 h  →   POPIA §22: notify Information Regulator & subjects",
    "Data Retention: 3 years for client records   →   POPIA §14: no longer than necessary for purpose",
    "Access Control: role-based (RBAC)            →   POPIA §19: restrict access to authorised persons only",
    "Privacy Policy: shared with clients on sign-up →  POPIA §18: notification of collection mandatory",
    "",
    "Key Insight: Where internal policy is WEAKER than POPIA, the law takes precedence.",
    "DataSecure must ensure all internal policies meet or EXCEED POPIA requirements.",
], font_size=12, title="Side-by-Side Comparison")

s = slide_base("Q3: Risk / Gap & Suggested Improvements", "PS03 | 10 Marks")
two_column(s,
    "Identified Gap",
    [
        "RISK: Inadequate Employee Training",
        "",
        "• Staff are unaware of POPIA obligations",
        "• No mandatory security awareness training",
        "• Passwords are shared informally via chat",
        "• Personal devices used on corporate network",
        "  without Mobile Device Management (MDM)",
        "• Result: HIGH risk of data breach &",
        "  regulatory fines up to R10 million",
    ],
    "Suggested Improvements",
    [
        "✓  Mandatory annual POPIA compliance training",
        "✓  Implement Multi-Factor Authentication (MFA)",
        "   company-wide",
        "✓  Enforce MDM policy for BYOD devices",
        "✓  Monthly phishing simulation campaigns",
        "✓  Clear whistle-blower / incident reporting",
        "   channel (anonymous hotline)",
        "✓  Disciplinary policy for non-compliance",
        "✓  Appoint a dedicated Information Officer",
        "   as required by POPIA Chapter 8",
    ]
)

# ════════════════════════════════════════════════════════════════════════════
# QUESTION 4 – TEAMWORK & COMMUNICATION (PS04)
# ════════════════════════════════════════════════════════════════════════════

s = slide_base("Q4: Teamwork & Communication (PS04)", "PS04 | 25 Marks")
single_card(s, [
    "Scenario:  You are part of a team working to resolve a cloud system issue",
    "affecting a client. Effective communication and collaboration are critical.",
    "",
    "Tasks Covered:",
    "  1.  Communication methods using appropriate technology",
    "  2.  Effective team collaboration",
    "  3.  Handling conflict within the team",
    "  4.  Time management to meet deadlines",
], font_size=15, title="Overview")

s = slide_base("Q4: Communication Methods", "PS04 | 5 Marks")
two_column(s,
    "Tools Used",
    [
        "• Microsoft Teams",
        "   – Instant messaging, file sharing, calls",
        "• Jira / Azure DevOps",
        "   – Task tracking & progress updates",
        "• Email",
        "   – Formal escalation & client communication",
        "• Confluence / SharePoint",
        "   – Documentation & knowledge base",
        "• Zoom/Teams Calls",
        "   – Daily stand-up & incident bridge calls",
    ],
    "Best Practices",
    [
        "• Establish a dedicated Teams channel for",
        "  the incident (e.g. #client-incident-2026)",
        "• Daily stand-up: 15 min, same time each day",
        "• Use @mentions to direct tasks to individuals",
        "• Status updates every 2 hours during P1 issues",
        "• All decisions documented in writing",
        "• Escalation matrix clearly defined upfront",
    ]
)

s = slide_base("Q4: Team Collaboration", "PS04 | 10 Marks")
single_card(s, [
    "Collaboration Framework – RACI Model:",
    "  R = Responsible  |  A = Accountable  |  C = Consulted  |  I = Informed",
    "",
    "Practical Steps for Effective Collaboration:",
    "  ✓  Define roles & responsibilities clearly at the start of the incident",
    "  ✓  Break the problem into subtasks and assign ownership in Jira",
    "  ✓  Use shared documentation – everyone works from the same source of truth",
    "  ✓  Encourage open communication – all ideas are welcome regardless of rank",
    "  ✓  Pair senior staff with juniors for knowledge transfer",
    "  ✓  Conduct a blameless post-mortem after resolution to improve future response",
    "  ✓  Celebrate team success – acknowledge contributions publicly",
    "",
    "Key Principle: Trust + Transparency = High-performing Team",
], font_size=13, title="Collaboration Framework")

s = slide_base("Q4: Conflict Resolution & Time Management", "PS04 | 10 Marks")
two_column(s,
    "Conflict Resolution",
    [
        "Steps to resolve team conflict:",
        "1.  Stay calm – address issues privately first",
        "2.  Listen actively to all perspectives",
        "3.  Focus on the problem, not the person",
        "4.  Find common ground / shared goal",
        "5.  Agree on a solution collaboratively",
        "6.  Escalate to Team Lead if unresolved",
        "7.  Document the outcome & monitor",
        "",
        "Remember: Conflict handled well",
        "strengthens team relationships.",
    ],
    "Time Management",
    [
        "Techniques used:",
        "• Prioritise tasks: P1 (critical) → P3 (low)",
        "• Time-box tasks: e.g. 2 hrs to diagnose root",
        "  cause, then re-assess",
        "• Use Kanban board in Jira – visualise progress",
        "• Set micro-deadlines to stay on track",
        "• Delegate according to strengths",
        "• Avoid scope creep – stay focused on incident",
        "• Buffer time built in for testing & handover",
        "• Regular check-ins to remove blockers fast",
    ]
)

# ════════════════════════════════════════════════════════════════════════════
# QUESTION 5 – MEETINGS & PARTICIPATION (PS05)
# ════════════════════════════════════════════════════════════════════════════

s = slide_base("Q5: Meetings & Participation (PS05)", "PS05 | 25 Marks")
single_card(s, [
    "Scenario:  You are required to attend a team meeting to discuss cloud system",
    "improvements and client issues at DataSecure Solutions.",
    "",
    "Tasks Covered:",
    "  1.  Prepare a meeting agenda",
    "  2.  Write meeting minutes (at least 5 key points)",
    "  3.  Explain your role and contribution",
    "  4.  Describe the importance of meeting procedures & documentation",
], font_size=15, title="Overview")

s = slide_base("Q5: Meeting Agenda", "PS05 | 5 Marks")
single_card(s, [
    "MEETING AGENDA",
    "Organisation:  DataSecure Solutions",
    "Date / Time:   12 May 2026  |  09:00 – 10:00",
    "Venue:         Boardroom B / Microsoft Teams",
    "Chairperson:   Cloud Administrator",
    "Attendees:     IT Team, Security Officer, Client Relations Manager, Team Lead",
    "",
    "AGENDA ITEMS:",
    "  1.  Opening & Welcome                                    (09:00 – 09:05)   Chairperson",
    "  2.  Review of previous minutes & action items            (09:05 – 09:15)   Secretary",
    "  3.  Cloud system performance report – current issues     (09:15 – 09:30)   Cloud Admin",
    "  4.  Security awareness training update – new employees   (09:30 – 09:40)   Security Officer",
    "  5.  4IR technology adoption – AI & IoT proposal         (09:40 – 09:50)   Team Lead",
    "  6.  POPIA compliance review & staff concerns             (09:50 – 09:55)   Compliance Lead",
    "  7.  Action items, next steps & closure                   (09:55 – 10:00)   Chairperson",
], font_size=12, title="")

s = slide_base("Q5: Meeting Minutes", "PS05 | 10 Marks")
single_card(s, [
    "MINUTES OF MEETING – DataSecure Solutions  |  12 May 2026  |  09:00",
    "",
    "1.  WELCOME:  Chairperson opened the meeting and confirmed quorum. All agenda items confirmed.",
    "",
    "2.  PREVIOUS MINUTES:  Minutes of 28 April 2026 were reviewed and accepted. 3 of 5 action items",
    "    were completed; 2 (MFA rollout & MDM policy) are still in progress.",
    "",
    "3.  CLOUD SYSTEM PERFORMANCE:  The Cloud Admin reported intermittent latency spikes on Client A's",
    "    Azure environment. Root cause identified as misconfigured load balancer. Fix deployed; monitoring",
    "    continues. ACTION: Cloud Admin to submit RCA report by 15 May 2026.",
    "",
    "4.  SECURITY TRAINING UPDATE:  Security Officer confirmed 14 new employees completed onboarding",
    "    training. Phishing simulation scheduled for 20 May. ACTION: Distribute POPIA checklist to all staff.",
    "",
    "5.  4IR PROPOSAL:  Team Lead presented AI/ML threat detection and IoT monitoring proposal.",
    "    Budget approved for a 3-month pilot. ACTION: Team Lead to procure AWS GuardDuty licence by EOM.",
    "",
    "6.  COMPLIANCE:  2 staff members flagged for sharing login credentials. HR to issue formal warning.",
    "    Information Officer to be appointed. ACTION: HR to complete appointment by 30 May 2026.",
    "",
    "7.  CLOSURE:  Chairperson summarised action items. Next meeting: 26 May 2026 at 09:00.",
], font_size=11, title="")

s = slide_base("Q5: Role, Participation & Meeting Procedures", "PS05 | 10 Marks")
two_column(s,
    "My Role & Contribution",
    [
        "Role: Cloud Administrator & Chairperson",
        "",
        "Contributions:",
        "• Compiled and distributed the agenda 48 h",
        "  before the meeting",
        "• Facilitated the discussion – ensured all",
        "  voices were heard",
        "• Presented the cloud system performance",
        "  report with data evidence",
        "• Kept the meeting on schedule",
        "• Summarised decisions & assigned action",
        "  owners with clear deadlines",
        "• Followed up on previous action items",
    ],
    "Importance of Proper Procedures",
    [
        "Why meeting procedures matter:",
        "• Ensure meetings are productive & focused",
        "• Agendas prevent topic drift & time waste",
        "• Minutes create an official record for",
        "  accountability & legal compliance",
        "• Action items ensure follow-through",
        "• Proper procedures promote fairness –",
        "  everyone has an equal opportunity to speak",
        "• Documentation supports POPIA compliance",
        "  (audit trail for decisions on client data)",
        "• Builds organisational memory over time",
    ]
)

# ════════════════════════════════════════════════════════════════════════════
# CLOSING SLIDE
# ════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(BLANK)
add_rect(slide, 0, 0, 13.33, 7.5, DARK_NAVY)
add_rect(slide, 0, 3.4, 13.33, 0.1, ACCENT_TEAL)
add_rect(slide, 0, 5.8, 13.33, 0.1, ACCENT_TEAL)

add_textbox(slide, 0.5, 0.8, 12.0, 1.0,
            "Summary", 36, bold=True, color=ACCENT_TEAL, align=PP_ALIGN.CENTER)
add_textbox(slide, 1.0, 1.8, 11.0, 1.4,
            "Q1: Presentation Skills  •  Q2: 4IR Technologies\n"
            "Q3: Compliance & Ethics  •  Q4: Teamwork  •  Q5: Meetings",
            20, color=WHITE, align=PP_ALIGN.CENTER)
add_textbox(slide, 1.5, 3.6, 10.0, 1.5,
            "Together these skills make a responsible, effective\n"
            "Cloud Professional in the modern 4IR workplace.",
            22, bold=True, color=GOLD, align=PP_ALIGN.CENTER)
add_textbox(slide, 1.5, 5.1, 10.0, 0.6,
            "Thank you  |  Questions Welcome",
            24, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_textbox(slide, 1.5, 5.95, 10.0, 0.5,
            "DataSecure Solutions  |  FIR411 Professional Skills  |  2026",
            13, color=LIGHT_GREY, align=PP_ALIGN.CENTER)

# ════════════════════════════════════════════════════════════════════════════
out_path = r"C:\Users\Joy Legwabe\Desktop\emah\FIR411_Cloud_Security_Presentation.pptx"
prs.save(out_path)
print(f"Saved: {out_path}")
