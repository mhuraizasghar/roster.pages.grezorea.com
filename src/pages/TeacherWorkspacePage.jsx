import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  FolderTree,
  Radio,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import LibraryPanel from '../components/teacher/LibraryPanel';
import QuizEditorPanel from '../components/teacher/QuizEditorPanel';
import RosterPanel from '../components/teacher/RosterPanel';
import GroupManagementPanel from '../components/teacher/GroupManagementPanel';
import AssignmentPanel, { AssignQuizModal } from '../components/teacher/AssignmentPanel';
import RoomsPanel from '../components/teacher/RoomsPanel';
import ReportsPanel from '../components/teacher/ReportsPanel';

const TABS = [
  { id: 'library', label: 'Quiz Library', icon: FolderTree },
  { id: 'roster', label: 'Students', icon: Users },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'assignments', label: 'Assignments', icon: CalendarClock },
  { id: 'rooms', label: 'Live Classrooms', icon: Radio },
  { id: 'reports', label: 'Results & Analytics', icon: BarChart3 },
];

export default function TeacherWorkspacePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('library');
  const [loading, setLoading] = useState(true);

  const [library, setLibrary] = useState({
    folders: [],
    quizzes: [],
    trashFolders: [],
    trashQuizzes: [],
  });
  const [roster, setRoster] = useState({ entries: [], groups: [] });
  const [assignments, setAssignments] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [editingQuiz, setEditingQuiz] = useState(null);
  const [assigningQuiz, setAssigningQuiz] = useState(null);
  const [initialRoomQuiz, setInitialRoomQuiz] = useState(null);
  const [initialReportTarget, setInitialReportTarget] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [libRes, rosRes, asgRes, roomRes] = await Promise.all([
        api.get('/api/library'),
        api.get('/api/roster'),
        api.get('/api/assignments'),
        api.get('/api/rooms'),
      ]);
      setLibrary({
        folders: libRes.folders || [],
        quizzes: libRes.quizzes || [],
        trashFolders: libRes.trashFolders || [],
        trashQuizzes: libRes.trashQuizzes || [],
      });
      setRoster({
        entries: rosRes.entries || [],
        groups: rosRes.groups || [],
      });
      setAssignments(asgRes.assignments || []);
      setRooms(roomRes.rooms || []);
    } catch (err) {
      showToast(err.message || 'Failed to load workspace data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadLibrary = useCallback(async () => {
    try {
      const result = await api.get('/api/library');
      setLibrary({ folders: result.folders || [], quizzes: result.quizzes || [], trashFolders: result.trashFolders || [], trashQuizzes: result.trashQuizzes || [] });
    } catch (err) { showToast(err.message || 'Could not refresh the quiz library.', 'error'); }
  }, [showToast]);

  const loadRoster = useCallback(async () => {
    try {
      const result = await api.get('/api/roster');
      setRoster({ entries: result.entries || [], groups: result.groups || [] });
    } catch (err) { showToast(err.message || 'Could not refresh students and groups.', 'error'); }
  }, [showToast]);

  const loadAssignments = useCallback(async () => {
    try {
      const result = await api.get('/api/assignments');
      setAssignments(result.assignments || []);
    } catch (err) { showToast(err.message || 'Could not refresh assignments.', 'error'); }
  }, [showToast]);

  const loadRooms = useCallback(async () => {
    try {
      const result = await api.get('/api/rooms');
      setRooms(result.rooms || []);
    } catch (err) { showToast(err.message || 'Could not refresh live rooms.', 'error'); }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeRoomsCount = rooms.filter((r) => r.status !== 'ended').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b" style={{ borderColor: 'var(--eval-border)' }}>
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
            Teacher Workspace
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {user?.displayName}
          </h1>
          <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
            {user?.institutionName ? `${user.institutionName} · ` : ''}
            {library.quizzes.length} quiz(zes) · {roster.entries.length} rostered student(s) · {assignments.length} assignment(s)
          </p>
        </div>

        {/* Summary KPIs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-surface)' }}>
            Active Rooms: <strong className="font-mono">{activeRoomsCount}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-surface)' }}>
            Roster Active:{' '}
            <strong className="font-mono">
              {roster.entries.filter((r) => r.status === 'active').length}/{roster.entries.length}
            </strong>
          </div>
        </div>
      </div>

      {/* Tab Navigation (hidden while editing a quiz) */}
      {!editingQuiz && (
        <div className="flex max-w-full items-center gap-4 overflow-x-auto border-b" style={{ borderColor: 'var(--eval-border)' }} role="tablist" aria-label="Workspace sections">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`relative inline-flex shrink-0 items-center gap-2 px-1 py-3 text-xs font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-[var(--eval-accent)] after:transition-transform after:content-[''] ${active ? 'after:scale-x-100' : 'hover:after:scale-x-100'}`}
                style={{ color: active ? 'var(--eval-ink)' : 'var(--eval-muted)' }}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'rooms' && activeRoomsCount > 0 && (
                  <span className="ml-0.5 text-[10px] font-mono" style={{ color: 'var(--eval-accent)' }}>
                    {activeRoomsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="eval-card p-12 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
          Loading workspace...
        </div>
      ) : editingQuiz ? (
        <QuizEditorPanel
          quiz={editingQuiz}
          onBack={() => {
            setEditingQuiz(null);
            loadLibrary();
          }}
          onSaved={(updated) => {
            setEditingQuiz(updated);
            loadLibrary();
          }}
        />
      ) : (
        <>
          {activeTab === 'library' && (
            <LibraryPanel
              folders={library.folders}
              quizzes={library.quizzes}
              trashFolders={library.trashFolders}
              trashQuizzes={library.trashQuizzes}
              onRefresh={loadLibrary}
              onEditQuiz={(quiz) => setEditingQuiz(quiz)}
              onAssignQuiz={(quiz) => setAssigningQuiz(quiz)}
              onLaunchLive={(quiz) => {
                setInitialRoomQuiz(quiz);
                setActiveTab('rooms');
              }}
            />
          )}

          {activeTab === 'roster' && (
            <RosterPanel
              entries={roster.entries}
              groups={roster.groups}
              onRefresh={loadRoster}
            />
          )}

          {activeTab === 'groups' && (
            <GroupManagementPanel groups={roster.groups} entries={roster.entries} onRefresh={loadRoster} />
          )}

          {activeTab === 'assignments' && (
            <AssignmentPanel
              assignments={assignments}
              onRefresh={loadAssignments}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomsPanel
              rooms={rooms}
              quizzes={library.quizzes}
              initialQuiz={initialRoomQuiz}
              onClearInitialQuiz={() => setInitialRoomQuiz(null)}
              onRefresh={loadRooms}
              onViewReport={(target) => {
                setInitialReportTarget(target);
                setActiveTab('reports');
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsPanel initialTarget={initialReportTarget} />
          )}
        </>
      )}

      {/* Assign Quiz Modal */}
      {assigningQuiz && (
        <AssignQuizModal
          quiz={assigningQuiz}
          groups={roster.groups}
          rosterEntries={roster.entries}
          onClose={() => setAssigningQuiz(null)}
          onAssigned={() => loadAssignments()}
        />
      )}
    </div>
  );
}
