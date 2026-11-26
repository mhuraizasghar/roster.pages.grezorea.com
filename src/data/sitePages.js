/**
 * Dedicated public pages registry for Roster (roster.pages.grezorea.com).
 * Every public route linked in the footer and sitemap resolves to a real, structured page.
 */

export const SITE_PAGES = {
  features: {
    eyebrow: 'Platform Overview',
    title: 'Complete assessment infrastructure for modern classrooms',
    lead: 'Roster combines a structured instructor quiz library, verified email rosters, real-time live rooms, and self-paced assignments under one cohesive platform.',
    updated: '2026',
    primaryCta: { label: 'Sign up for free', to: '/teacher/signup' },
    secondaryCta: { label: 'Instructor Guide', to: '/guide/instructors' },
    sections: [
      {
        heading: 'File-System Quiz Library',
        body: 'Organize assessments into subjects and arbitrarily nested folders. Search across titles and subjects, sort by name or last updated timestamp, duplicate quizzes into drafts, and recover accidentally removed items from Trash before permanent deletion.',
        bullets: [
          'Subject containers and nested folder hierarchy with breadcrumbs',
          'Move folders and quizzes cleanly across locations',
          'Soft-delete Trash with one-click restore or permanent purge',
        ],
      },
      {
        heading: 'Email Roster Access Control',
        body: 'Students never browse instructors or search for public classes. Adding a student email to your roster is the single action that links them to your live rooms and assignments across institutions.',
        bullets: [
          'Single email add and bulk CSV or pasted list import',
          'Automatic lowercase trimming, duplicate detection, and malformed email rejection',
          'Class sections and groups for targeted quiz distribution',
        ],
      },
      {
        heading: 'Reporting, Overrides & CSV Export',
        body: 'Inspect item-level accuracy across every submission, surface the most-missed prompts automatically, override short-answer grades manually, and export formula-safe CSV gradebooks.',
      },
    ],
  },

  'live-rooms': {
    eyebrow: 'Real-Time Delivery',
    title: 'Live Classrooms & Interactive Pacing',
    lead: 'Run synchronized sessions over WebSockets across phones and laptops with automatic reconnection and persistent server-side responses.',
    primaryCta: { label: 'Launch a Room', to: '/teacher' },
    secondaryCta: { label: 'Join with Room Code', to: '/student/login#room-join' },
    sections: [
      {
        heading: 'Four Live Classroom Modes',
        body: 'Choose the cadence that fits your lecture or lab session. Multiple live rooms can operate concurrently with unique 6-character room codes and scannable QR join links.',
        bullets: [
          'Teacher-Paced: Advance question-by-question as live response distributions update in real time',
          'Student-Paced: Let students move through room questions independently while you monitor completion',
          'Challenge Mode: Timed rounds with deterministic speed-bonus scoring (up to +50%) and a live leaderboard',
          'Quick Question: Launch an unscripted exit ticket or single poll without creating a saved quiz first',
        ],
      },
      {
        heading: 'Classroom Projector Mode',
        body: 'Toggle Present Mode in the Live Room Host Console to hide sidebars and enlarge question typography and live response charts for lecture hall projection while keeping answer keys hidden until you click Reveal.',
      },
      {
        heading: 'Automatic Gradebook Persistence',
        body: 'Ending a live session automatically converts participant responses into permanent Attempt records visible in both the Instructor Reports tab and each student’s Completed Results.',
      },
    ],
  },

  assignments: {
    eyebrow: 'Self-Paced Exams',
    title: 'Scheduled Assignments & Per-Student Overrides',
    lead: 'Distribute timed or untimed assessments to your entire roster, specific class sections, or individual students with full control over deadlines and retakes.',
    primaryCta: { label: 'Open Student Dashboard', to: '/student' },
    secondaryCta: { label: 'Instructor Login', to: '/teacher/login' },
    sections: [
      {
        heading: 'Configurable Assessment Rules',
        body: 'Every assignment supports optional due timestamps, countdown time limits with server-tracked deadlines, attempt caps, question shuffling, and configurable answer-key visibility after submission.',
        bullets: [
          'Incremental per-question answer saving so students never lose progress across devices or dropped networks',
          'Automatic submission when a timed exam reaches deadline expiration',
          'Late submission tracking when completed past the effective due date',
        ],
      },
      {
        heading: 'Individual Student Extensions',
        body: 'Instructors can grant per-student extended due dates, extra attempts, or reopen an assignment for a specific student without modifying settings for the rest of the section.',
      },
    ],
  },

  'question-formats': {
    eyebrow: 'Authoring & Grading',
    title: 'Four Question Formats & Deterministic Grading',
    lead: 'Author structured questions with custom point weights, explanations, and forgiving automated grading—backed by manual instructor overrides.',
    primaryCta: { label: 'Create a Quiz', to: '/teacher/signup' },
    secondaryCta: { label: 'Snapshot Architecture', to: '/architecture' },
    sections: [
      {
        heading: 'Supported Question Types',
        body: 'Mix and match formats inside any quiz in your library:',
        bullets: [
          'Multiple Choice (Single & Multi-Select): Exact-set matching across selected option indices',
          'True / False: Normalized binary evaluation with optional explanations',
          'Short Answer: Multiple accepted phrases with configurable case sensitivity, whitespace normalization, and minor Levenshtein spelling tolerance',
          'Challenge Rounds: Timed multiple-choice questions awarding base points plus up to 50% speed bonus based on remaining seconds',
        ],
      },
      {
        heading: 'Manual Grading Overrides',
        body: 'For nuanced short-answer responses or partial credit adjustments, instructors can inspect individual student responses in Reports and override correctness or awarded points with immediate total recalculation.',
      },
    ],
  },

  architecture: {
    eyebrow: 'Data Integrity',
    title: 'Immutable Quiz Snapshots & Cross-Institution Rosters',
    lead: 'Why editing a draft in your library never corrupts active assignments, live rooms, or historical student grades.',
    primaryCta: { label: 'Security Overview', to: '/security' },
    secondaryCta: { label: 'Platform Overview', to: '/features' },
    sections: [
      {
        heading: 'Versioned Quiz Snapshots',
        body: 'Whenever an instructor publishes a self-paced assignment or launches a live classroom, Roster captures a deep, immutable QuizVersion snapshot of the quiz title, settings, and ordered questions.',
        bullets: [
          'Draft edits in the Quiz Library never alter in-progress or past student submissions',
          'Historical reports always match the exact question text and point weights the student answered',
          'Full traceability between live library drafts and deployed quiz versions',
        ],
      },
      {
        heading: 'Cross-Institution Roster Graph',
        body: 'A single student email can appear on rosters belonging to multiple instructors at different universities without conflict. Each instructor sees only their own library, roster, rooms, and results.',
      },
    ],
  },

  security: {
    eyebrow: 'Security & Integrity',
    title: 'Server-Enforced Access & Zero Answer Leakage',
    lead: 'Designed for high-trust classroom testing where exam keys, roster access, and portal roles must be verified on the server.',
    primaryCta: { label: 'Data Retention Policy', to: '/data-retention' },
    secondaryCta: { label: 'System Status', to: '/status' },
    sections: [
      {
        heading: 'Answer Key Stripping',
        body: 'Students never receive correctAnswer indices, accepted short-answer lists, or explanations in network payloads prior to submission or explicit instructor reveal in a live room.',
      },
      {
        heading: 'Verified Identity Gate',
        body: 'Student sign-in requires either a verified Google email or a confirmed 6-digit one-time email code. Unverified addresses cannot claim pending roster spots, and emails not present on any instructor roster are denied access cleanly.',
      },
      {
        heading: 'Strict Role Separation & CSV Safety',
        body: 'Teacher and Student accounts hold fixed single roles with separate portals and wrong-portal guidance. Exported CSV reports escape leading formula characters (=, +, -, @) to neutralize spreadsheet formula injection.',
      },
    ],
  },

  'guide/instructors': {
    eyebrow: 'Documentation',
    title: 'Instructor Quick-Start Guide',
    lead: 'Go from account creation to hosting your first roster-gated live classroom or self-paced exam in five minutes.',
    primaryCta: { label: 'Open Teacher Workspace', to: '/teacher' },
    secondaryCta: { label: 'Create Instructor Account', to: '/teacher/signup' },
    special: 'instructor-guide',
    sections: [
      {
        heading: '1. Create & Verify Your Instructor Account',
        body: 'Sign up on the Teacher Portal with Google or your institutional email and password. Confirm the verification email sent to your inbox to activate your workspace.',
      },
      {
        heading: '2. Build Your Student Roster & Sections',
        body: 'Open the Student Roster tab to add student emails one at a time, paste a list, or upload a CSV file with email, name, and group columns. Pending students automatically activate the first time they sign in.',
      },
      {
        heading: '3. Author Quizzes & Publish',
        body: 'Create subject folders in Quiz Library, add questions across all four supported types, and either click Assign for self-paced deadlines or Live Room for real-time pacing.',
      },
    ],
  },

  'guide/students': {
    eyebrow: 'Documentation',
    title: 'Student Guide',
    lead: 'How to sign in via an instructor roster, join live classrooms from phone or laptop, and review your completed assessments.',
    primaryCta: { label: 'Student Sign In', to: '/student/login' },
    secondaryCta: { label: 'Join a Live Room', to: '/student/login#room-join' },
    sections: [
      {
        heading: '1. Verify Your Rostered Email',
        body: 'Student accounts are created by invitation when an instructor adds your email address. Open Student Login and sign in with Google or request a 6-digit one-time code to that exact email.',
      },
      {
        heading: '2. View All Classes in One Dashboard',
        body: 'Once signed in, your dashboard automatically aggregates active live rooms, assigned quizzes, and past scores from every instructor whose roster includes your email.',
      },
      {
        heading: '3. Reconnect Without Losing Progress',
        body: 'Assignment answers save incrementally as you select them. If your mobile connection drops during a timed exam or live room, sign back in to resume right where you left off.',
      },
    ],
  },

  support: {
    eyebrow: 'Help Center',
    title: 'Support & Frequently Asked Questions',
    lead: 'Answers to common account, roster, email delivery, and live classroom questions for instructors and students.',
    primaryCta: { label: 'System Status', to: '/status' },
    secondaryCta: { label: 'Student Login', to: '/student/login' },
    special: 'support-faq',
    sections: [],
  },

  changelog: {
    eyebrow: 'Release Notes',
    title: 'Platform Changelog',
    lead: 'Recent milestones, security improvements, and capability updates shipped on Roster.',
    primaryCta: { label: 'Explore Features', to: '/features' },
    secondaryCta: { label: 'System Status', to: '/status' },
    sections: [
      {
        heading: 'v2.0 — Roster Enterprise Classroom Release',
        body: 'Complete architectural rebuild introducing dual-portal role isolation, roster-gated OTP and Google sign-in, nested folder quiz library with soft-delete Trash, immutable QuizVersion snapshots, four live room modes with WebSocket sync, projector presentation mode, and branded transactional email notifications.',
      },
      {
        heading: 'v2.1 — Reporting, Roster Search & Overrides',
        body: 'Added live roster search and status filters, roster CSV export, printable PDF/report layouts, manual short-answer grading overrides with email notifications, and per-student assignment deadline extensions.',
      },
    ],
  },

  status: {
    eyebrow: 'Operations',
    title: 'System Status',
    lead: 'Live operational health across Roster API endpoints, real-time WebSocket room sync, and transactional email delivery.',
    primaryCta: { label: 'Support & FAQs', to: '/support' },
    secondaryCta: { label: 'Return Home', to: '/' },
    special: 'system-status',
    sections: [],
  },

  privacy: {
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    lead: 'How Roster handles verified instructor and student identities, assessment responses, and roster records.',
    updated: 'November 2026',
    primaryCta: { label: 'Data Retention', to: '/data-retention' },
    secondaryCta: { label: 'Terms of Service', to: '/terms' },
    sections: [
      {
        heading: 'Information We Process',
        body: 'Roster processes account display names, verified email addresses, optional institution names, instructor-authored quiz content, roster membership records, and student assessment responses solely to operate classroom assessments.',
      },
      {
        heading: 'No Cross-Student Exposure or Ad Tracking',
        body: 'Students never view other students’ email addresses, personal scores, or rosters from instructors who have not added them. Roster does not serve advertising or sell academic data to third parties.',
      },
      {
        heading: 'Minimal OAuth Scopes',
        body: 'Google Sign-In is used exclusively for identity verification (verified email and display profile). Roster does not request Drive, Gmail, or Classroom read/write scopes.',
      },
    ],
  },

  terms: {
    eyebrow: 'Legal',
    title: 'Terms of Service',
    lead: 'Standard terms governing use of the Roster classroom assessment platform by instructors and students.',
    updated: 'November 2026',
    primaryCta: { label: 'Privacy Policy', to: '/privacy' },
    secondaryCta: { label: 'Data Retention', to: '/data-retention' },
    sections: [
      {
        heading: 'Authorized Academic Use',
        body: 'Instructors are responsible for managing accurate student email rosters and authoring lawful instructional materials. Students agree to complete live rooms and assignments using only their own verified identity.',
      },
      {
        heading: 'Account Role Separation',
        body: 'Each Roster account holds a single permanent role (Teacher or Student). Individuals acting in both capacities maintain separate accounts for each portal.',
      },
      {
        heading: 'Service Availability',
        body: 'Roster snapshots active quizzes and persists student answers incrementally to minimize disruption during live classroom sessions and network interruptions.',
      },
    ],
  },

  'data-retention': {
    eyebrow: 'Legal & Governance',
    title: 'Data Retention & Snapshot Policy',
    lead: 'How Roster preserves academic records while supporting safe deletion and roster updates.',
    updated: 'November 2026',
    primaryCta: { label: 'Security Overview', to: '/security' },
    secondaryCta: { label: 'Privacy Policy', to: '/privacy' },
    sections: [
      {
        heading: 'Soft-Delete Trash Recovery',
        body: 'Deleted folders and quizzes in an instructor’s library move to Trash first so items can be restored intact before explicit permanent deletion.',
      },
      {
        heading: 'Roster Removal & Historical Grades',
        body: 'Removing a student from an instructor’s roster revokes future access to that instructor’s rooms and assignments while preserving historical submission records for institutional audit continuity.',
      },
      {
        heading: 'Session Revocation',
        body: 'Signing out revokes the active session token immediately on the server. Password reset and one-time verification codes expire automatically within short security windows.',
      },
    ],
  },

  sitemap: {
    eyebrow: 'Directory',
    title: 'Site Directory & Sitemap',
    lead: 'Complete index of public pages, portals, guides, and documentation available on Roster.',
    primaryCta: { label: 'Home', to: '/' },
    secondaryCta: { label: 'Features', to: '/features' },
    special: 'html-sitemap',
    sections: [],
  },
};
