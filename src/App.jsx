import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Dashboard from './components/Dashboard';
import LessonView from './components/LessonView';
import QuizView from './components/QuizView';
import HandAnalyzer from './components/HandAnalyzer';
import GameEngine from './components/GameEngine';
import MultiplayerLobby from './components/MultiplayerLobby';
import MultiplayerTable from './components/MultiplayerTable';
import ChallengeTable from './components/ChallengeTable';
import RangeChart from './components/RangeChart';
import HandHistoryLog from './components/HandHistoryLog';
import HandReplayer from './components/HandReplayer';
import PreflopTrainer from './components/PreflopTrainer';
import MathTrainer from './components/MathTrainer';
import PostFlopTrainer from './components/PostFlopTrainer';
import Analytics from './components/Analytics';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import UserManagement from './components/UserManagement';
import './index.css';

const ADMIN_EMAIL = 'jvazquez.sd@outlook.com';

// A simple wrapper to protect routes
const ProtectedRoute = ({ children, session, adminOnly = false }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  
  if (adminOnly && session.user.email !== ADMIN_EMAIL) {
    return <Navigate to="/multiplayer" replace />;
  }

  return children;
};

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>Loading...</div>;
  }

  return (
    <Router>
      {session && (
        <nav style={{ padding: '0 1.5rem', height: '48px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.35rem', letterSpacing: '-0.01em' }}>
              <span style={{ color: 'var(--accent-color)' }}>♠️</span> Poker Academy
            </Link>
            {session.user?.email === ADMIN_EMAIL && (
              <Link 
                to="/admin/users" 
                style={{
                  fontSize: '0.78rem',
                  color: '#60a5fa',
                  textDecoration: 'none',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.22)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontWeight: 500
                }}
              >
                👥 User Control
              </Link>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>
              {session.user?.email}
            </span>
            <button 
              onClick={() => supabase.auth.signOut()}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, padding: '0.2rem 0.4rem' }}
            >
              Sign Out
            </button>
          </div>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route 
          path="/admin/users" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <UserManagement session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <Dashboard session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/learn/:id" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <LessonView session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/quiz/:id" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <QuizView session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analyzer" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <HandAnalyzer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/sandbox" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <GameEngine />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/multiplayer" 
          element={
            <ProtectedRoute session={session}>
              <MultiplayerLobby session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/ranges" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <RangeChart />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/trainer/preflop" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <PreflopTrainer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/trainer/math" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <MathTrainer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/trainer/postflop" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <PostFlopTrainer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analytics" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <Analytics session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/history" 
          element={
            <ProtectedRoute session={session}>
              <HandHistoryLog />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/replayer/:id" 
          element={
            <ProtectedRoute session={session}>
              <HandReplayer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/multiplayer/:code" 
          element={
            <ProtectedRoute session={session}>
              <MultiplayerTable session={session} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/challenge/:id" 
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <ChallengeTable session={session} />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
