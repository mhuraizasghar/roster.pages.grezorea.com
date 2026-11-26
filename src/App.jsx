import React from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import TeacherAuthPage from './pages/TeacherAuthPage';
import StudentLoginPage from './pages/StudentLoginPage';
import TeacherWorkspacePage from './pages/TeacherWorkspacePage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import LiveRoomHostPage from './pages/LiveRoomHostPage';
import LiveRoomStudentPage from './pages/LiveRoomStudentPage';
import AttemptRunnerPage from './pages/AttemptRunnerPage';
import AttemptReviewPage from './pages/AttemptReviewPage';
import SitePage from './pages/SitePage';
import GoogleAuthCallbackPage from './pages/GoogleAuthCallbackPage';
import { SITE_PAGES } from './data/sitePages';

function ProtectedRoute({ allowedRole = null, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
        Verifying session...
      </div>
    );
  }

  if (!user) {
    const loginPath = allowedRole === 'teacher' ? '/teacher/login' : '/student/login';
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={allowedRole === 'student' ? `${loginPath}?next=${next}` : loginPath} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    const correctWorkspace = user.role === 'teacher' ? '/teacher' : '/student';
    const correctLabel = user.role === 'teacher' ? 'Teacher Workspace' : 'Student Dashboard';
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="eval-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--status-warn)' }}>
            <AlertTriangle className="w-5 h-5" />
            Wrong Portal for This Account
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            You are currently signed in as <strong style={{ color: 'var(--eval-ink)' }}>{user.email}</strong> with a{' '}
            <strong className="uppercase">{user.role}</strong> role. Teacher and Student accounts are kept separate on Roster.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to={correctWorkspace} className="eval-btn-primary text-xs">
              Open {correctLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to="/" className="eval-btn-secondary text-xs">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

function NotFoundPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
      <div className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
        404
      </div>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
        The page you requested does not exist on Roster.
      </p>
      <Link to="/" className="eval-btn-primary text-xs inline-flex">
        Return Home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <div className="min-h-screen flex flex-col">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />

                  {/* Teacher Portal */}
                  <Route path="/teacher/login" element={<TeacherAuthPage initialMode="login" />} />
                  <Route path="/teacher/signup" element={<TeacherAuthPage initialMode="signup" />} />
                  <Route path="/teacher/reset" element={<TeacherAuthPage initialMode="reset" />} />
                  <Route
                    path="/teacher"
                    element={
                      <ProtectedRoute allowedRole="teacher">
                        <TeacherWorkspacePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/teacher/room/:code"
                    element={
                      <ProtectedRoute allowedRole="teacher">
                        <LiveRoomHostPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Student Portal */}
                  <Route path="/student/login" element={<StudentLoginPage />} />
                  <Route path="/auth/callback" element={<GoogleAuthCallbackPage />} />
                  <Route
                    path="/student"
                    element={
                      <ProtectedRoute allowedRole="student">
                        <StudentDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/room/:code"
                    element={
                      <ProtectedRoute allowedRole="student">
                        <LiveRoomStudentPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/attempt/:assignmentId"
                    element={
                      <ProtectedRoute allowedRole="student">
                        <AttemptRunnerPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/review/:attemptId"
                    element={
                      <ProtectedRoute>
                        <AttemptReviewPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Dedicated Platform, Guide, Trust, Operations & Legal Pages */}
                  {Object.keys(SITE_PAGES).map((key) => (
                    <Route key={key} path={`/${key}`} element={<SitePage pageKey={key} />} />
                  ))}

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
