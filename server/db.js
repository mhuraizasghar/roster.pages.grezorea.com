import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { normalizeEmail } from './grading.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'eval.runtime.json');

export function createSeedData() {
  const now = new Date().toISOString();
  const teacherId = 't_demo_sarah';
  const teacher2Id = 't_demo_khalid';
  const student1Id = 's_demo_ali';
  const student2Id = 's_demo_sara';

  const users = [
    {
      id: teacherId,
      email: 'teacher@eval.demo',
      role: 'teacher',
      displayName: 'Dr. Sarah Lin',
      institutionName: 'Air University',
      authProvider: 'email',
      emailVerified: true,
      passwordHash: hashPassword('TeacherEval2026!'),
      createdAt: now,
    },
    {
      id: teacher2Id,
      email: 'prof.khalid@eval.demo',
      role: 'teacher',
      displayName: 'Prof. Khalid Mahmood',
      institutionName: 'National Institute of Computing',
      authProvider: 'google',
      emailVerified: true,
      passwordHash: hashPassword('TeacherEval2026!'),
      createdAt: now,
    },
    {
      id: student1Id,
      email: 'ali.khan@university.edu',
      role: 'student',
      displayName: 'Ali Khan',
      institutionName: 'Air University',
      authProvider: 'google',
      emailVerified: true,
      passwordHash: null,
      createdAt: now,
    },
    {
      id: student2Id,
      email: 'sara.ahmed@college.edu',
      role: 'student',
      displayName: 'Sara Ahmed',
      institutionName: 'Grezorea Technical College',
      authProvider: 'otp',
      emailVerified: true,
      passwordHash: null,
      createdAt: now,
    },
  ];

  const groups = [
    { id: 'grp_cs101', teacherId, name: 'CS-101 Section A', createdAt: now },
    { id: 'grp_phys', teacherId, name: 'Physics Lab B', createdAt: now },
    { id: 'grp_khalid_ai', teacherId: teacher2Id, name: 'AI Seminar', createdAt: now },
  ];

  const rosterEntries = [
    {
      id: 'ros_1',
      teacherId,
      studentEmail: 'ali.khan@university.edu',
      displayName: 'Ali Khan',
      groupId: 'grp_cs101',
      status: 'active',
      studentUserId: student1Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ros_2',
      teacherId,
      studentEmail: 'sara.ahmed@college.edu',
      displayName: 'Sara Ahmed',
      groupId: 'grp_cs101',
      status: 'active',
      studentUserId: student2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ros_3',
      teacherId,
      studentEmail: 'zainab.iqbal@institute.org',
      displayName: 'Zainab Iqbal',
      groupId: 'grp_phys',
      status: 'pending',
      studentUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ros_4',
      teacherId: teacher2Id,
      studentEmail: 'ali.khan@university.edu',
      displayName: 'Ali Khan',
      groupId: 'grp_khalid_ai',
      status: 'active',
      studentUserId: student1Id,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const folders = [
    { id: 'fld_cs', ownerId: teacherId, parentId: null, name: 'Computer Science', isSubject: true, deletedAt: null, createdAt: now, updatedAt: now },
    { id: 'fld_cs_mid', ownerId: teacherId, parentId: 'fld_cs', name: 'Midterm Prep', isSubject: false, deletedAt: null, createdAt: now, updatedAt: now },
    { id: 'fld_phys', ownerId: teacherId, parentId: null, name: 'Applied Physics', isSubject: true, deletedAt: null, createdAt: now, updatedAt: now },
    { id: 'fld_trash_demo', ownerId: teacherId, parentId: null, name: 'Archived Drafts', isSubject: false, deletedAt: now, createdAt: now, updatedAt: now },
    { id: 'fld_khalid_ai', ownerId: teacher2Id, parentId: null, name: 'Machine Learning', isSubject: true, deletedAt: null, createdAt: now, updatedAt: now },
  ];

  const csQuestions = [
    {
      id: 'q_cs_1',
      position: 0,
      type: 'mcq',
      prompt: 'Which data structure operates strictly on a Last-In, First-Out (LIFO) principle?',
      options: ['Queue', 'Stack', 'Hash Table', 'Binary Heap'],
      correctAnswer: 1,
      acceptedAnswers: [],
      matchOptions: {},
      points: 2,
      timeLimitSec: 20,
      explanation: 'A stack pushes and pops from the same top end (LIFO).',
      imageUrl: '',
    },
    {
      id: 'q_cs_2',
      position: 1,
      type: 'mcq',
      prompt: 'Select ALL protocols that operate at the Transport Layer of the TCP/IP model.',
      options: ['TCP', 'HTTP', 'UDP', 'DNS'],
      correctAnswer: [0, 2],
      acceptedAnswers: [],
      matchOptions: {},
      points: 3,
      timeLimitSec: 25,
      explanation: 'TCP and UDP are Transport Layer protocols; HTTP and DNS are Application Layer.',
      imageUrl: '',
    },
    {
      id: 'q_cs_3',
      position: 2,
      type: 'tf',
      prompt: 'Random Access Memory (RAM) retains its stored data after the computer is completely powered off.',
      options: ['True', 'False'],
      correctAnswer: false,
      acceptedAnswers: [],
      matchOptions: {},
      points: 1,
      timeLimitSec: 15,
      explanation: 'RAM is volatile memory and loses its contents without power.',
      imageUrl: '',
    },
    {
      id: 'q_cs_4',
      position: 3,
      type: 'short_answer',
      prompt: 'What does CPU stand for?',
      options: [],
      correctAnswer: 'Central Processing Unit',
      acceptedAnswers: ['Central Processing Unit', 'central processor unit'],
      matchOptions: { caseSensitive: false, ignoreSpaces: true, allowMinorSpelling: true },
      points: 2,
      timeLimitSec: 30,
      explanation: 'CPU stands for Central Processing Unit.',
      imageUrl: '',
    },
    {
      id: 'q_cs_5',
      position: 4,
      type: 'challenge',
      prompt: 'Speed Round: What is the decimal value of the binary number 10110?',
      options: ['18', '20', '22', '26'],
      correctAnswer: 2,
      acceptedAnswers: [],
      matchOptions: {},
      points: 100,
      timeLimitSec: 20,
      explanation: '16 + 0 + 4 + 2 + 0 = 22.',
      imageUrl: '',
    },
  ];

  const physQuestions = [
    {
      id: 'q_ph_1',
      position: 0,
      type: 'mcq',
      prompt: 'What is the SI unit of electrical resistance?',
      options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
      correctAnswer: 2,
      acceptedAnswers: [],
      matchOptions: {},
      points: 2,
      timeLimitSec: 20,
      explanation: 'Electrical resistance is measured in Ohms (Ω).',
      imageUrl: '',
    },
    {
      id: 'q_ph_2',
      position: 1,
      type: 'tf',
      prompt: 'Acceleration due to gravity near Earth\'s surface is approximately 9.8 m/s².',
      options: ['True', 'False'],
      correctAnswer: true,
      acceptedAnswers: [],
      matchOptions: {},
      points: 1,
      timeLimitSec: 15,
      explanation: 'Standard gravity g ≈ 9.81 m/s².',
      imageUrl: '',
    },
    {
      id: 'q_ph_3',
      position: 2,
      type: 'short_answer',
      prompt: 'State the surname of the physicist who formulated the three laws of motion.',
      options: [],
      correctAnswer: 'Newton',
      acceptedAnswers: ['Newton', 'Isaac Newton', 'Sir Isaac Newton'],
      matchOptions: { caseSensitive: false, ignoreSpaces: true, allowMinorSpelling: true },
      points: 2,
      timeLimitSec: 25,
      explanation: 'Sir Isaac Newton published the three laws of motion in Principia Mathematica.',
      imageUrl: '',
    },
  ];

  const aiQuestions = [
    {
      id: 'q_ai_1',
      position: 0,
      type: 'mcq',
      prompt: 'Which activation function outputs values strictly between 0 and 1?',
      options: ['ReLU', 'Sigmoid', 'Tanh', 'Leaky ReLU'],
      correctAnswer: 1,
      acceptedAnswers: [],
      matchOptions: {},
      points: 2,
      timeLimitSec: 20,
      explanation: 'The logistic sigmoid maps real numbers into (0, 1).',
      imageUrl: '',
    },
    {
      id: 'q_ai_2',
      position: 1,
      type: 'short_answer',
      prompt: 'Name the optimization algorithm that updates weights in the opposite direction of the loss gradient.',
      options: [],
      correctAnswer: 'Gradient Descent',
      acceptedAnswers: ['Gradient Descent', 'Stochastic Gradient Descent', 'SGD'],
      matchOptions: { caseSensitive: false, ignoreSpaces: true, allowMinorSpelling: true },
      points: 2,
      timeLimitSec: 30,
      explanation: 'Gradient Descent iteratively minimizes the loss function.',
      imageUrl: '',
    },
  ];

  const quizzes = [
    {
      id: 'quiz_cs_fund',
      ownerId: teacherId,
      folderId: 'fld_cs_mid',
      title: 'Systems & Algorithms Diagnostics',
      subject: 'Computer Science',
      description: 'Diagnostic check covering data structures, transport protocols, memory, and binary arithmetic.',
      currentVersionId: 'qv_cs_1',
      draftQuestions: csQuestions,
      settings: { passMark: 50, shuffleOptions: false },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'quiz_phys_1',
      ownerId: teacherId,
      folderId: 'fld_phys',
      title: 'Classical Mechanics & Circuits',
      subject: 'Applied Physics',
      description: 'Quick conceptual check on SI units, kinematics, and Newtonian mechanics.',
      currentVersionId: 'qv_phys_1',
      draftQuestions: physQuestions,
      settings: { passMark: 60, shuffleOptions: true },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'quiz_trash_demo',
      ownerId: teacherId,
      folderId: 'fld_cs',
      title: 'Old Orientation Survey',
      subject: 'Computer Science',
      description: 'Soft-deleted quiz kept in Trash for restore demonstration.',
      currentVersionId: null,
      draftQuestions: [
        {
          id: 'q_old_1',
          position: 0,
          type: 'tf',
          prompt: 'I have installed the required IDE.',
          options: ['True', 'False'],
          correctAnswer: true,
          acceptedAnswers: [],
          matchOptions: {},
          points: 1,
          timeLimitSec: 15,
          explanation: '',
          imageUrl: '',
        },
      ],
      settings: { passMark: 50, shuffleOptions: false },
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'quiz_khalid_ai',
      ownerId: teacher2Id,
      folderId: 'fld_khalid_ai',
      title: 'Neural Networks Foundations',
      subject: 'Machine Learning',
      description: 'Core concepts in activation functions and gradient-based optimization.',
      currentVersionId: 'qv_ai_1',
      draftQuestions: aiQuestions,
      settings: { passMark: 50, shuffleOptions: false },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const quizVersions = [
    {
      id: 'qv_cs_1',
      quizId: 'quiz_cs_fund',
      ownerId: teacherId,
      versionNumber: 1,
      title: 'Systems & Algorithms Diagnostics',
      subject: 'Computer Science',
      description: quizzes[0].description,
      settings: quizzes[0].settings,
      questions: csQuestions.map((q) => ({ ...q })),
      createdAt: now,
    },
    {
      id: 'qv_phys_1',
      quizId: 'quiz_phys_1',
      ownerId: teacherId,
      versionNumber: 1,
      title: 'Classical Mechanics & Circuits',
      subject: 'Applied Physics',
      description: quizzes[1].description,
      settings: quizzes[1].settings,
      questions: physQuestions.map((q) => ({ ...q })),
      createdAt: now,
    },
    {
      id: 'qv_ai_1',
      quizId: 'quiz_khalid_ai',
      ownerId: teacher2Id,
      versionNumber: 1,
      title: 'Neural Networks Foundations',
      subject: 'Machine Learning',
      description: quizzes[3].description,
      settings: quizzes[3].settings,
      questions: aiQuestions.map((q) => ({ ...q })),
      createdAt: now,
    },
  ];

  const futureDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const assignments = [
    {
      id: 'asg_cs_mid',
      teacherId,
      quizVersionId: 'qv_cs_1',
      title: 'CS-101 Midterm Diagnostic',
      targetType: 'groups',
      targetEmails: [],
      targetGroupIds: ['grp_cs101'],
      dueAt: futureDue,
      settings: {
        timeLimitMin: 15,
        maxAttempts: 2,
        showAnswersAfterSubmit: true,
        shuffleQuestions: false,
        allowSaveProgress: true,
      },
      createdAt: now,
    },
    {
      id: 'asg_ai_1',
      teacherId: teacher2Id,
      quizVersionId: 'qv_ai_1',
      title: 'AI Seminar Week 1 Check',
      targetType: 'groups',
      targetEmails: [],
      targetGroupIds: ['grp_khalid_ai'],
      dueAt: futureDue,
      settings: {
        timeLimitMin: 10,
        maxAttempts: 1,
        showAnswersAfterSubmit: true,
        shuffleQuestions: false,
        allowSaveProgress: true,
      },
      createdAt: now,
    },
  ];

  const attempts = [
    {
      id: 'att_demo_1',
      studentId: student2Id,
      studentEmail: 'sara.ahmed@college.edu',
      teacherId,
      quizVersionId: 'qv_cs_1',
      assignmentId: 'asg_cs_mid',
      roomId: null,
      status: 'submitted',
      questionOrder: csQuestions.map((q) => q.id),
      startedAt: new Date(Date.now() - 420 * 1000).toISOString(),
      submittedAt: new Date(Date.now() - 120 * 1000).toISOString(),
      score: 106,
      maxScore: 108,
      percent: 98.1,
      answers: [
        { id: 'ans_d1', questionId: 'q_cs_1', response: 1, isCorrect: true, awardedPoints: 2, gradedBy: 'auto', answeredAt: now },
        { id: 'ans_d2', questionId: 'q_cs_2', response: [0, 2], isCorrect: true, awardedPoints: 3, gradedBy: 'auto', answeredAt: now },
        { id: 'ans_d3', questionId: 'q_cs_3', response: false, isCorrect: true, awardedPoints: 1, gradedBy: 'auto', answeredAt: now },
        { id: 'ans_d4', questionId: 'q_cs_4', response: 'central processing unti', isCorrect: true, awardedPoints: 2, gradedBy: 'auto', answeredAt: now },
        { id: 'ans_d5', questionId: 'q_cs_5', response: 2, isCorrect: true, awardedPoints: 98, gradedBy: 'auto', answeredAt: now },
      ],
    },
  ];

  const rooms = [
    {
      id: 'room_demo_1',
      teacherId,
      quizVersionId: 'qv_phys_1',
      code: 'PHY742',
      title: 'Applied Physics Live Check-in',
      mode: 'teacher_paced',
      status: 'lobby',
      currentQuestionIdx: 0,
      revealedCurrent: false,
      openJoin: false,
      questionStartedAt: null,
      quickQuestionPayload: null,
      settings: { showFeedbackImmediately: true },
      participants: [],
      responses: {},
      createdAt: now,
      endedAt: null,
    },
  ];

  return {
    users,
    groups,
    rosterEntries,
    folders,
    quizzes,
    quizVersions,
    assignments,
    assignmentOverrides: [],
    rooms,
    attempts,
    otps: {},
    verificationTokens: {},
    resetTokens: {},
    revokedSids: [],
    rateLimits: {},
  };
}

export function createDatabase({ filePath = DEFAULT_DB_PATH, persist = true } = {}) {
  let state;
  if (persist && fs.existsSync(filePath)) {
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      state = createSeedData();
    }
  } else {
    state = createSeedData();
  }

  function save() {
    if (!persist) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  if (persist && !fs.existsSync(filePath)) {
    save();
  }

  function getVersion(versionId) {
    return state.quizVersions.find((v) => v.id === versionId) || null;
  }

  function createSnapshot(quiz, teacherId) {
    const existingCount = state.quizVersions.filter((v) => v.quizId === quiz.id).length;
    const versionId = `qv_${crypto.randomUUID().slice(0, 12)}`;
    const snapshot = {
      id: versionId,
      quizId: quiz.id,
      ownerId: teacherId,
      versionNumber: existingCount + 1,
      title: quiz.title,
      subject: quiz.subject || 'General',
      description: quiz.description || '',
      settings: JSON.parse(JSON.stringify(quiz.settings || { passMark: 50, shuffleOptions: false })),
      questions: (quiz.draftQuestions || []).map((q, idx) => ({
        ...JSON.parse(JSON.stringify(q)),
        id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`,
        position: idx,
      })),
      createdAt: new Date().toISOString(),
    };
    state.quizVersions.push(snapshot);
    quiz.currentVersionId = versionId;
    save();
    return snapshot;
  }

  function isEmailOnTeacherRoster(teacherId, email) {
    const norm = normalizeEmail(email);
    if (!norm) return false;
    return state.rosterEntries.some(
      (r) => r.teacherId === teacherId && normalizeEmail(r.studentEmail) === norm
    );
  }

  function getTeachersForStudentEmail(email) {
    const norm = normalizeEmail(email);
    const entries = state.rosterEntries.filter((r) => normalizeEmail(r.studentEmail) === norm);
    return entries;
  }

  function isStudentTargetedByAssignment(assignment, email) {
    const norm = normalizeEmail(email);
    const rosterEntry = state.rosterEntries.find(
      (r) => r.teacherId === assignment.teacherId && normalizeEmail(r.studentEmail) === norm
    );
    if (!rosterEntry) return false;

    if (assignment.targetType === 'all_roster') return true;
    if (assignment.targetType === 'students') {
      return (assignment.targetEmails || []).some((e) => normalizeEmail(e) === norm);
    }
    if (assignment.targetType === 'groups') {
      return Boolean(rosterEntry.groupId && (assignment.targetGroupIds || []).includes(rosterEntry.groupId));
    }
    return false;
  }

  return {
    state,
    save,
    getVersion,
    createSnapshot,
    isEmailOnTeacherRoster,
    getTeachersForStudentEmail,
    isStudentTargetedByAssignment,
  };
}
