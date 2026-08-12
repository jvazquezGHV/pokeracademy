import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Dashboard from './components/Dashboard';
import LessonView from './components/LessonView';
import QuizView from './components/QuizView';
import HandAnalyzer from './components/HandAnalyzer';
import GameEngine from './components/GameEngine';
import MultiplayerLobby from './components/MultiplayerLobby';
import MultiplayerTable from './components/MultiplayerTable';
import Auth from './components/Auth';
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
        <nav style={{ padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => supabase.auth.signOut()}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Auth />} />
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
          path="/multiplayer/:code" 
          element={
            <ProtectedRoute session={session}>
              <MultiplayerTable session={session} />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
