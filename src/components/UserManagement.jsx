import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './UserManagement.css';

const VAULT_STORAGE_KEY = 'poker_admin_credentials_vault';
const ADMIN_EMAIL = 'jvazquez.sd@outlook.com';

const SETUP_SQL_CODE = `-- ==============================================================================
-- POKER ACADEMY: USER MANAGEMENT & CONTROL SQL SETUP
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Create a secure view for the admin to inspect all registered users
CREATE OR REPLACE VIEW public.app_users AS
SELECT 
  u.id, 
  u.email, 
  u.created_at, 
  u.last_sign_in_at,
  u.banned_until,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)) AS display_name,
  CASE 
    WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN false
    ELSE true
  END AS is_active
FROM auth.users u;

GRANT SELECT ON public.app_users TO authenticated;

-- 2. Function to toggle user active status (Activate / Inactivate)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(target_user_id uuid, activate boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can modify user status.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id AND email = 'jvazquez.sd@outlook.com') AND NOT activate THEN
    RAISE EXCEPTION 'Cannot inactivate the primary administrator account.';
  END IF;

  IF activate THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;
  ELSE
    UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = target_user_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(uuid, boolean) TO authenticated;

-- 3. Function to directly set a user's password without requiring an email link
CREATE OR REPLACE FUNCTION public.admin_set_user_password(target_user_id uuid, new_plain_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can reset passwords.';
  END IF;

  IF length(new_plain_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users 
  SET encrypted_password = extensions.crypt(new_plain_password, extensions.gen_salt('bf'))
  WHERE id = target_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;

-- 4. Function to permanently delete a user
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'jvazquez.sd@outlook.com' THEN
    RAISE EXCEPTION 'Access denied. Only the administrator can delete users.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id AND email = 'jvazquez.sd@outlook.com') THEN
    RAISE EXCEPTION 'Cannot delete the primary administrator account.';
  END IF;

  DELETE FROM public.poker_players WHERE user_id = target_user_id;
  DELETE FROM public.user_progress WHERE user_id = target_user_id;
  DELETE FROM public.hand_histories WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;`;

const UserManagement = ({ session }) => {
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  // Live Users from Supabase
  const [users, setUsers] = useState([]);
  const [isViewConnected, setIsViewConnected] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Modal States
  const [resetModalUser, setResetModalUser] = useState(null);
  const [directNewPassword, setDirectNewPassword] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState(null);

  // Current user password change state
  const [myNewPassword, setMyNewPassword] = useState('');
  const [myConfirmPassword, setMyConfirmPassword] = useState('');

  // Create new user state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [saveToVault, setSaveToVault] = useState(true);

  // Vault state
  const [vault, setVault] = useState([]);
  const [showPasswords, setShowPasswords] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  // Initialize vault from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VAULT_STORAGE_KEY);
      if (stored) {
        setVault(JSON.parse(stored));
      } else {
        const initial = [
          {
            id: 'admin-root',
            email: session?.user?.email || ADMIN_EMAIL,
            password: '••••••••••••',
            displayName: 'Primary Administrator',
            note: 'Admin account (Full Permissions)',
            createdAt: new Date().toISOString()
          }
        ];
        setVault(initial);
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(initial));
      }
    } catch {
      // Fallback
    }
  }, [session]);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setFetchingUsers(true);
    try {
      // Attempt to load from the secure app_users view
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // app_users view is not installed yet; fallback to discovered users
        setIsViewConnected(false);
        await loadDiscoveredFallback();
      } else if (data) {
        setIsViewConnected(true);
        setUsers(data);
      }
    } catch {
      setIsViewConnected(false);
      await loadDiscoveredFallback();
    } finally {
      setFetchingUsers(false);
    }
  };

  const loadDiscoveredFallback = async () => {
    const userMap = {};

    // 1. Gather from poker_players
    const { data: players } = await supabase
      .from('poker_players')
      .select('user_id, display_name, created_at')
      .order('created_at', { ascending: false });

    if (players) {
      players.forEach(p => {
        if (!p.user_id) return;
        userMap[p.user_id] = {
          id: p.user_id,
          email: p.display_name?.includes('@') ? p.display_name : `player_${p.user_id.substring(0, 6)}@unknown.com`,
          display_name: p.display_name || 'Multiplayer Player',
          created_at: p.created_at,
          last_sign_in_at: p.created_at,
          is_active: true
        };
      });
    }

    // 2. Add current admin if missing
    if (session?.user?.id && !userMap[session.user.id]) {
      userMap[session.user.id] = {
        id: session.user.id,
        email: session.user.email || ADMIN_EMAIL,
        display_name: 'Primary Administrator',
        created_at: session.user.created_at || new Date().toISOString(),
        last_sign_in_at: session.user.last_sign_in_at || new Date().toISOString(),
        is_active: true
      };
    }

    // 3. Merge vault entries
    const vaultList = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || '[]');
    vaultList.forEach(v => {
      if (v.id && !userMap[v.id]) {
        userMap[v.id] = {
          id: v.id,
          email: v.email,
          display_name: v.displayName || v.email.split('@')[0],
          created_at: v.createdAt,
          last_sign_in_at: v.createdAt,
          is_active: true
        };
      }
    });

    setUsers(Object.values(userMap));
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  // 1. Password Reset: Direct set via RPC
  const handleDirectPasswordReset = async () => {
    if (!resetModalUser || !directNewPassword) return;
    if (directNewPassword.length < 6) {
      setAlert({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.rpc('admin_set_user_password', {
        target_user_id: resetModalUser.id,
        new_plain_password: directNewPassword
      });

      if (error) {
        setAlert({
          type: 'error',
          message: `Direct reset failed: ${error.message}. (Ensure the SQL functions are installed in Supabase).`
        });
      } else {
        // Also update in vault if it exists
        const updatedVault = vault.map(v => 
          (v.id === resetModalUser.id || v.email === resetModalUser.email) 
            ? { ...v, password: directNewPassword } 
            : v
        );
        setVault(updatedVault);
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));

        setAlert({
          type: 'success',
          message: `Password for ${resetModalUser.email} has been updated directly to: ${directNewPassword}`
        });
        setResetModalUser(null);
        setDirectNewPassword('');
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Error executing direct reset.' });
    } finally {
      setLoading(false);
    }
  };

  // 2. Password Reset: Dispatch recovery link email
  const handleSendResetEmail = async (targetEmail) => {
    const emailToSend = targetEmail || resetModalUser?.email;
    if (!emailToSend) {
      setAlert({ type: 'error', message: 'No target email provided.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailToSend, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setAlert({ type: 'error', message: `Reset link error: ${error.message}` });
      } else {
        setAlert({
          type: 'success',
          message: `Password reset email dispatched to ${emailToSend}. The user can click it to set a new password!`
        });
        if (resetModalUser) setResetModalUser(null);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispatch reset email.' });
    } finally {
      setLoading(false);
    }
  };

  // 3. Toggle User Active / Inactive Status
  const handleToggleStatus = async (user) => {
    if (user.email === ADMIN_EMAIL && user.is_active) {
      setAlert({ type: 'error', message: 'Cannot inactivate the primary administrator.' });
      return;
    }

    const newActiveState = !user.is_active;
    const actionLabel = newActiveState ? 'Activate' : 'Inactivate';
    
    if (!window.confirm(`Are you sure you want to ${actionLabel.toLowerCase()} user "${user.email}"?`)) {
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.rpc('admin_toggle_user_status', {
        target_user_id: user.id,
        activate: newActiveState
      });

      if (error) {
        setAlert({
          type: 'error',
          message: `Could not ${actionLabel.toLowerCase()} user: ${error.message}. (Ensure the SQL functions are installed).`
        });
      } else {
        setAlert({
          type: 'success',
          message: `User ${user.email} is now ${newActiveState ? 'ACTIVE 🟢' : 'INACTIVE / SUSPENDED 🔴'}.`
        });
        // Optimistically update table
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newActiveState } : u));
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Error updating status.' });
    } finally {
      setLoading(false);
    }
  };

  // 4. Delete User
  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    if (deleteModalUser.email === ADMIN_EMAIL) {
      setAlert({ type: 'error', message: 'Cannot delete the primary administrator.' });
      setDeleteModalUser(null);
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: deleteModalUser.id
      });

      if (error) {
        setAlert({
          type: 'error',
          message: `Deletion failed: ${error.message}. (Ensure the SQL setup script has been executed in Supabase).`
        });
      } else {
        setAlert({
          type: 'success',
          message: `User "${deleteModalUser.email}" permanently deleted from Supabase Auth and database tables.`
        });

        // Remove from users list
        setUsers(prev => prev.filter(u => u.id !== deleteModalUser.id));
        // Remove from vault
        const updatedVault = vault.filter(v => v.id !== deleteModalUser.id && v.email !== deleteModalUser.email);
        setVault(updatedVault);
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));

        setDeleteModalUser(null);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Error executing deletion.' });
    } finally {
      setLoading(false);
    }
  };

  // 5. Create / Provision New User Account
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      setAlert({ type: 'error', message: 'Please provide both Email and Password.' });
      return;
    }
    if (newUserPassword.length < 6) {
      setAlert({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            display_name: newUserDisplayName || newUserEmail.split('@')[0]
          }
        }
      });

      if (error) {
        setAlert({ type: 'error', message: `Creation failed: ${error.message}` });
      } else {
        const createdUser = {
          id: data?.user?.id || `user_${Date.now()}`,
          email: newUserEmail,
          password: newUserPassword,
          displayName: newUserDisplayName || newUserEmail.split('@')[0],
          note: 'Created via User Control Panel',
          createdAt: new Date().toISOString()
        };

        if (saveToVault) {
          const updatedVault = [createdUser, ...vault.filter(v => v.email !== newUserEmail)];
          setVault(updatedVault);
          localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));
        }

        setAlert({
          type: 'success',
          message: `Account "${newUserEmail}" created successfully and saved in Credentials Vault!`
        });

        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserDisplayName('');
        loadUsers();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to create account.' });
    } finally {
      setLoading(false);
    }
  };

  // 6. Direct Update of Active Admin Password
  const handleUpdateMyPassword = async (e) => {
    e.preventDefault();
    if (myNewPassword.length < 6) {
      setAlert({ type: 'error', message: 'New password must be at least 6 characters.' });
      return;
    }
    if (myNewPassword !== myConfirmPassword) {
      setAlert({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: myNewPassword
      });

      if (error) {
        setAlert({ type: 'error', message: error.message });
      } else {
        setAlert({ type: 'success', message: 'Your admin password has been updated!' });
        setMyNewPassword('');
        setMyConfirmPassword('');
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.display_name && user.display_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.id && user.id.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return user.is_active !== false;
    if (statusFilter === 'inactive') return user.is_active === false;
    return true;
  });

  return (
    <div className="user-mgmt-container">
      {/* Header */}
      <div className="user-mgmt-header">
        <div>
          <h1>👥 User Management & Control</h1>
          <p>Inspect active users, reset passwords directly, activate, inactivate, or delete accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="user-mgmt-badge">
            🛡️ Admin: {session?.user?.email || ADMIN_EMAIL}
          </span>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={loadUsers}
            disabled={fetchingUsers}
          >
            {fetchingUsers ? 'Refreshing...' : '🔄 Refresh List'}
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {alert && (
        <div className={`user-mgmt-alert user-mgmt-alert-${alert.type}`}>
          {alert.type === 'success' && '✅'}
          {alert.type === 'error' && '⚠️'}
          {alert.type === 'info' && 'ℹ️'}
          <span>{alert.message}</span>
        </div>
      )}

      {/* SQL Setup Banner (if view is not connected yet) */}
      {!isViewConnected && !fetchingUsers && (
        <div className="sql-banner">
          <div className="sql-banner-title">
            <span>⚡</span> Enable Direct Auth Management (1-Minute Supabase Setup)
          </div>
          <p className="sql-banner-desc">
            To view all <code>auth.users</code> directly in this table and unlock 1-click password resets, activation/inactivation, and deletion, run the database setup script in your Supabase SQL Editor.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="user-mgmt-btn user-mgmt-btn-primary user-mgmt-btn-sm"
              onClick={() => copyToClipboard(SETUP_SQL_CODE, 'setup_sql')}
            >
              {copiedKey === 'setup_sql' ? '✅ Copied SQL to Clipboard!' : '📋 Copy SQL Setup Script'}
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Then paste & run it at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Supabase Dashboard &rarr; SQL Editor</a>.
            </span>
          </div>
        </div>
      )}

      {/* Live Users Table Section */}
      <div className="user-mgmt-card" style={{ marginBottom: '2.5rem' }}>
        <div className="user-mgmt-toolbar">
          <div>
            <h3 className="user-mgmt-card-title" style={{ margin: 0 }}>
              <span>📋</span> Registered Accounts ({filteredUsers.length})
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {isViewConnected ? 'Live sync with Supabase Auth' : 'Discovered & local users fallback'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <div className="user-mgmt-search">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by email, name, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="user-mgmt-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {fetchingUsers ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading users from Supabase...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No accounts match your search or filter.
          </div>
        ) : (
          <div className="user-mgmt-table-wrapper">
            <table className="user-mgmt-table">
              <thead>
                <tr>
                  <th>User / Email</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Sign In</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isAdmin = user.email === ADMIN_EMAIL;
                  const isActive = user.is_active !== false;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>
                          {isAdmin && <span className="admin-tag">Admin</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                          <span>{user.display_name || 'No display name'}</span>
                          <span>•</span>
                          <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                            ID: {user.id.substring(0, 8)}...
                          </span>
                        </div>
                      </td>

                      <td>
                        {isActive ? (
                          <span className="status-badge status-badge-active">
                            🟢 Active
                          </span>
                        ) : (
                          <span className="status-badge status-badge-inactive">
                            🔴 Inactive
                          </span>
                        )}
                      </td>

                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </td>

                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {/* 1. Reset Password */}
                          <button
                            type="button"
                            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                            onClick={() => {
                              setResetModalUser(user);
                              setDirectNewPassword('');
                            }}
                            title="Reset Password"
                          >
                            🔑 Reset Pass
                          </button>

                          {/* 2. Activate / Inactivate */}
                          {!isAdmin && (
                            <button
                              type="button"
                              className={`user-mgmt-btn user-mgmt-btn-sm ${isActive ? 'user-mgmt-btn-warning' : 'user-mgmt-btn-success'}`}
                              onClick={() => handleToggleStatus(user)}
                              disabled={loading}
                              title={isActive ? 'Inactivate (Suspend) User' : 'Activate User'}
                            >
                              {isActive ? '🔒 Inactivate' : '🔓 Activate'}
                            </button>
                          )}

                          {/* 3. Delete */}
                          {!isAdmin && (
                            <button
                              type="button"
                              className="user-mgmt-btn user-mgmt-btn-danger user-mgmt-btn-sm"
                              onClick={() => setDeleteModalUser(user)}
                              disabled={loading}
                              title="Delete User Permanently"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grid: Provision New Account & Change Admin Password */}
      <div className="user-mgmt-grid">
        {/* Card: Provision / Create New User */}
        <div className="user-mgmt-card">
          <h3 className="user-mgmt-card-title">
            <span>➕</span> Provision New Account
          </h3>
          <p className="user-mgmt-card-desc">
            Register a new player or testing account with specific credentials. Automatically saved to your local vault.
          </p>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>Account Email</label>
              <input
                type="email"
                className="user-mgmt-input"
                placeholder="player_pro@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
            </div>

            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <label style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => setNewUserPassword(generateRandomPassword())}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ⚡ Auto-Generate
                </button>
              </div>
              <input
                type="text"
                className="user-mgmt-input"
                placeholder="At least 6 characters"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
              />
            </div>

            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>Display Name (Optional)</label>
              <input
                type="text"
                className="user-mgmt-input"
                placeholder="e.g. Hero_Player2"
                value={newUserDisplayName}
                onChange={(e) => setNewUserDisplayName(e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                checked={saveToVault}
                onChange={(e) => setSaveToVault(e.target.checked)}
              />
              Save credentials in Credentials Vault
            </label>

            <button
              type="submit"
              className="user-mgmt-btn user-mgmt-btn-primary"
              disabled={loading || !newUserEmail || !newUserPassword}
              style={{ marginTop: '0.5rem' }}
            >
              {loading ? 'Creating...' : 'Create Account & Save'}
            </button>
          </form>
        </div>

        {/* Card: Update Active Admin Password */}
        <div className="user-mgmt-card">
          <h3 className="user-mgmt-card-title">
            <span>🛡️</span> Change Current Admin Password
          </h3>
          <p className="user-mgmt-card-desc">
            Directly update the password for your active administrator account ({session?.user?.email}).
          </p>

          <form onSubmit={handleUpdateMyPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>New Admin Password</label>
              <input
                type="password"
                className="user-mgmt-input"
                placeholder="••••••••••••"
                value={myNewPassword}
                onChange={(e) => setMyNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>Confirm Password</label>
              <input
                type="password"
                className="user-mgmt-input"
                placeholder="••••••••••••"
                value={myConfirmPassword}
                onChange={(e) => setMyConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="user-mgmt-btn user-mgmt-btn-secondary"
              disabled={loading || !myNewPassword || !myConfirmPassword}
              style={{ marginTop: 'auto' }}
            >
              Update Admin Password
            </button>
          </form>
        </div>
      </div>

      {/* Credentials Vault Section */}
      <div className="user-mgmt-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 className="user-mgmt-card-title" style={{ margin: '0 0 0.25rem 0' }}>
              <span>🗄️</span> Saved Credentials Vault ({vault.length})
            </h3>
            <p className="user-mgmt-card-desc" style={{ margin: 0 }}>
              Stores created accounts locally on this device so you can instantly copy passwords.
            </p>
          </div>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={() => {
              const email = prompt('Enter Account Email:');
              if (!email) return;
              const pass = prompt('Enter Account Password:') || '••••••';
              const name = prompt('Display Name / Note:') || 'Manual Entry';
              const entry = {
                id: `entry_${Date.now()}`,
                email,
                password: pass,
                displayName: name,
                note: 'Manually added',
                createdAt: new Date().toISOString()
              };
              const updated = [entry, ...vault];
              setVault(updated);
              localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
            }}
          >
            + Add Existing Account to Vault
          </button>
        </div>

        {vault.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: '1rem 0' }}>
            No credentials saved in vault yet. Use the "Provision New Account" tool above to add accounts.
          </p>
        ) : (
          <div>
            {vault.map((item) => {
              const isRevealed = showPasswords[item.id];
              return (
                <div key={item.id} className="vault-item">
                  <div className="vault-info">
                    <div className="vault-email">
                      <span>👤 {item.email}</span>
                      {item.displayName && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                          ({item.displayName})
                        </span>
                      )}
                    </div>
                    <div className="vault-pass">
                      <span>Password:</span>
                      <strong>{isRevealed ? item.password : '••••••••••••'}</strong>
                    </div>
                    {item.note && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {item.note} • Created {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                      onClick={() => setShowPasswords(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      title="Reveal / Mask Password"
                    >
                      {isRevealed ? '🙈 Hide' : '👁️ Show'}
                    </button>

                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                      onClick={() => copyToClipboard(item.email, `email_${item.id}`)}
                      title="Copy Email"
                    >
                      {copiedKey === `email_${item.id}` ? '✅ Copied Email' : '📋 Copy Email'}
                    </button>

                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                      onClick={() => copyToClipboard(item.password, `pass_${item.id}`)}
                      title="Copy Password"
                    >
                      {copiedKey === `pass_${item.id}` ? '✅ Copied Pass' : '🔑 Copy Pass'}
                    </button>

                    {item.id !== 'admin-root' && (
                      <button
                        type="button"
                        className="user-mgmt-btn user-mgmt-btn-danger user-mgmt-btn-sm"
                        onClick={() => {
                          const updated = vault.filter(v => v.id !== item.id);
                          setVault(updated);
                          localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
                        }}
                        title="Delete from Vault"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Supabase Dashboard Guide & SQL Reference */}
      <details className="user-mgmt-card" style={{ cursor: 'pointer' }}>
        <summary style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)', outline: 'none' }}>
          💡 Complete Supabase SQL Setup Script (Click to Expand / Copy)
        </summary>
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <p>
            Copy and run this in your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Supabase SQL Editor</a> to enable complete database-level control:
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className="user-mgmt-btn user-mgmt-btn-primary user-mgmt-btn-sm"
              onClick={() => copyToClipboard(SETUP_SQL_CODE, 'modal_sql')}
            >
              {copiedKey === 'modal_sql' ? '✅ Copied Script!' : '📋 Copy Entire SQL Script'}
            </button>
          </div>
          <pre className="sql-block">
            {SETUP_SQL_CODE}
          </pre>
        </div>
      </details>

      {/* MODAL 1: Reset Password Modal */}
      {resetModalUser && (
        <div className="modal-overlay" onClick={() => setResetModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔑 Reset Password</h3>
              <button className="modal-close-btn" onClick={() => setResetModalUser(null)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
              Target User: <strong style={{ color: 'var(--text-primary)' }}>{resetModalUser.email}</strong>
            </p>

            {/* Direct Password Reset Form */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Set New Password Directly
                </label>
                <button
                  type="button"
                  onClick={() => setDirectNewPassword(generateRandomPassword())}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ⚡ Auto-Generate
                </button>
              </div>

              <input
                type="text"
                className="user-mgmt-input"
                placeholder="Enter new password (min 6 chars)"
                value={directNewPassword}
                onChange={(e) => setDirectNewPassword(e.target.value)}
                style={{ marginBottom: '0.75rem' }}
              />

              <button
                type="button"
                className="user-mgmt-btn user-mgmt-btn-primary"
                style={{ width: '100%' }}
                onClick={handleDirectPasswordReset}
                disabled={loading || !directNewPassword || directNewPassword.length < 6}
              >
                {loading ? 'Updating...' : 'Save New Password Directly'}
              </button>
            </div>

            <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              — OR —
            </div>

            {/* Email Reset Link Button */}
            <button
              type="button"
              className="user-mgmt-btn user-mgmt-btn-secondary"
              style={{ width: '100%' }}
              onClick={() => handleSendResetEmail(resetModalUser.email)}
              disabled={loading}
            >
              ✉️ Send Reset Link via Email
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete User Confirmation Modal */}
      {deleteModalUser && (
        <div className="modal-overlay" onClick={() => setDeleteModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: '#f87171' }}>🗑️ Delete User</h3>
              <button className="modal-close-btn" onClick={() => setDeleteModalUser(null)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete user <strong>{deleteModalUser.email}</strong>?
            </p>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              marginBottom: '1.25rem'
            }}>
              ⚠️ This will remove the account from Supabase Auth and cascade delete all their multiplayer room entries, lesson progress, and hand histories. This action cannot be undone.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="user-mgmt-btn user-mgmt-btn-secondary"
                onClick={() => setDeleteModalUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="user-mgmt-btn user-mgmt-btn-danger"
                onClick={handleDeleteUser}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
