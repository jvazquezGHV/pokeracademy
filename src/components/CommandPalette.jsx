import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';
import './CommandPalette.css';

const COMMANDS = [
  // Game Tables
  { id: 'sandbox', title: 'AI Sandbox Poker Table', category: 'Live Game', path: '/sandbox', icon: '🤖', badge: 'Play AI' },
  { id: 'multiplayer', title: 'Multiplayer Arena & Rooms', category: 'Live Game', path: '/multiplayer', icon: '🌐', badge: 'PvP Live' },
  { id: 'dashboard', title: 'Curriculum & Boss Challenges', category: 'Live Game', path: '/', icon: '🏆', badge: 'Home' },

  // Interactive Trainers
  { id: 'preflop', title: 'Preflop Action Trainer (6-Max)', category: 'Trainers', path: '/trainer/preflop', icon: '🎯', badge: 'Position GTO' },
  { id: 'math', title: 'Math & Pot Odds Drill', category: 'Trainers', path: '/trainer/math', icon: '📊', badge: 'Pot Odds' },
  { id: 'postflop', title: 'Postflop Scenario Simulator', category: 'Trainers', path: '/trainer/postflop', icon: '⚡', badge: 'Tactics' },

  // Solvers & Analyzers
  { id: 'ranges', title: 'GTO Pre-Flop Range Charts & Painter', category: 'Theory & Tools', path: '/ranges', icon: '🗺️', badge: 'Range Chart' },
  { id: 'analyzer', title: 'Hand Analyzer & Equity Lab', category: 'Theory & Tools', path: '/analyzer', icon: '🔬', badge: 'Monte Carlo' },
  { id: 'analytics', title: 'Personal Leak Tracker & HUD', category: 'Theory & Tools', path: '/analytics', icon: '📈', badge: 'Leak Profile' },
  { id: 'history', title: 'Hand History Log & Replayer', category: 'Theory & Tools', path: '/history', icon: '📜', badge: 'Replayer' },

  // Admin
  { id: 'users', title: 'User Management & Controls', category: 'Admin Tools', path: '/admin/users', icon: '👥', badge: 'Admin Only' }
];

const CommandPalette = ({ isOpen, onClose, isAdmin = false }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Filter commands by query and admin privileges
  const filteredCommands = COMMANDS.filter(cmd => {
    if (cmd.id === 'users' && !isAdmin) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.badge.toLowerCase().includes(q)
    );
  });

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation inside command palette
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      }
    }
  };

  const executeCommand = (cmd) => {
    playSound('click');
    onClose();
    navigate(cmd.path);
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search Input Bar */}
        <div className="cmd-search-row">
          <span className="cmd-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-search-input"
            placeholder="Type a page, trainer, or tool (e.g. Ranges, Preflop, Math, Analyzer)..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          <span className="cmd-esc-tag">ESC</span>
        </div>

        {/* Results List */}
        <div className="cmd-results-list">
          {filteredCommands.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.85rem' }}>
              No matches found for "{query}".
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <div
                key={cmd.id}
                className={`cmd-result-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="cmd-result-left">
                  <span className="cmd-result-icon">{cmd.icon}</span>
                  <span className="cmd-result-title">{cmd.title}</span>
                </div>
                <span className="cmd-result-badge">{cmd.badge}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div className="cmd-footer">
          <div className="cmd-footer-keys">
            <span className="cmd-key-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span className="cmd-key-hint"><kbd>↵</kbd> Select</span>
            <span className="cmd-key-hint"><kbd>ESC</kbd> Close</span>
          </div>
          <span style={{ fontSize: '0.7rem' }}>Poker Academy Quick Switcher</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
