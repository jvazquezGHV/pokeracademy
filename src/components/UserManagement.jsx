import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './UserManagement.css';

const VAULT_STORAGE_KEY = 'poker_admin_credentials_vault';
const ADMIN_EMAIL = 'jvazquez.sd@outlook.com';

const UserManagement = ({ session }) => {
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState([]);
  const [fetchingUsers, setFetchingUsers] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState(null);
  const [editNickname, setEditNickname] = useState('');
  const [resetModalUser, setResetModalUser] = useState(null);
  const [directNewPassword, setDirectNewPassword] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState(null);

  // New User Form State (Modal)
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserNickname, setNewUserNickname] = useState('');
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
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not query app_users view directly, loading fallback:', error);
        await loadDiscoveredFallback();
      } else if (data) {
        setUsers(data);
      }
    } catch {
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
        display_name: session.user.user_metadata?.display_name || 'Primary Administrator',
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

  // 1. Create New User
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
      const displayNameToSet = newUserNickname.trim() || newUserEmail.split('@')[0];
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            display_name: displayNameToSet
          }
        }
      });

      if (error) {
        setAlert({ type: 'error', message: `Account creation failed: ${error.message}` });
      } else {
        const createdUser = {
          id: data?.user?.id || `user_${Date.now()}`,
          email: newUserEmail,
          password: newUserPassword,
          displayName: displayNameToSet,
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
          message: `User "${newUserEmail}" created successfully!`
        });

        setIsCreateModalOpen(false);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserNickname('');
        loadUsers();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to create account.' });
    } finally {
      setLoading(false);
    }
  };

  // 2. Edit User Nickname
  const handleSaveNickname = async (e) => {
    e.preventDefault();
    if (!editModalUser || !editNickname.trim()) return;

    setLoading(true);
    setAlert(null);

    const updatedName = editNickname.trim();

    try {
      // 1. Attempt RPC function
      const { error: rpcError } = await supabase.rpc('admin_update_user_nickname', {
        target_user_id: editModalUser.id,
        new_nickname: updatedName
      });

      if (rpcError) {
        // Fallback for current admin session
        if (editModalUser.id === session?.user?.id) {
          await supabase.auth.updateUser({
            data: { display_name: updatedName }
          });
        }
        // Also update poker_players
        await supabase
          .from('poker_players')
          .update({ display_name: updatedName })
          .eq('user_id', editModalUser.id);
      }

      // Update in vault if present
      const updatedVault = vault.map(v => 
        (v.id === editModalUser.id || v.email === editModalUser.email)
          ? { ...v, displayName: updatedName }
          : v
      );
      setVault(updatedVault);
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));

      setAlert({
        type: 'success',
        message: `Nickname for "${editModalUser.email}" updated to "${updatedName}".`
      });

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === editModalUser.id ? { ...u, display_name: updatedName } : u
      ));

      setEditModalUser(null);
      setEditNickname('');
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update nickname.' });
    } finally {
      setLoading(false);
    }
  };

  // 3. Password Reset: Direct set via RPC
  const handleDirectPasswordReset = async () => {
    if (!resetModalUser || !directNewPassword) return;
    if (directNewPassword.length < 6) {
      setAlert({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      // If it's the current admin, we can also use supabase.auth.updateUser directly
      if (resetModalUser.email === session?.user?.email) {
        const { error: directError } = await supabase.auth.updateUser({
          password: directNewPassword
        });
        if (directError) throw directError;
      } else {
        const { error } = await supabase.rpc('admin_set_user_password', {
          target_user_id: resetModalUser.id,
          new_plain_password: directNewPassword
        });
        if (error) throw error;
      }

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
    } catch (err) {
      setAlert({ type: 'error', message: `Password reset error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // 4. Password Reset: Dispatch recovery link email
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
          message: `Password reset email sent to ${emailToSend}.`
        });
        if (resetModalUser) setResetModalUser(null);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispatch reset email.' });
    } finally {
      setLoading(false);
    }
  };

  // 5. Toggle User Active / Inactive Status
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
          message: `Could not ${actionLabel.toLowerCase()} user: ${error.message}.`
        });
      } else {
        setAlert({
          type: 'success',
          message: `User ${user.email} is now ${newActiveState ? 'ACTIVE 🟢' : 'INACTIVE / SUSPENDED 🔴'}.`
        });
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newActiveState } : u));
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Error updating status.' });
    } finally {
      setLoading(false);
    }
  };

  // 6. Delete User
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
          message: `Deletion failed: ${error.message}.`
        });
      } else {
        setAlert({
          type: 'success',
          message: `User "${deleteModalUser.email}" permanently deleted.`
        });

        setUsers(prev => prev.filter(u => u.id !== deleteModalUser.id));
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
          <p>Inspect active users, manage nicknames, reset passwords, activate, inactivate, or delete accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-primary"
            onClick={() => {
              setIsCreateModalOpen(true);
              setNewUserEmail('');
              setNewUserPassword('');
              setNewUserNickname('');
            }}
          >
            ➕ Create New User
          </button>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary"
            onClick={loadUsers}
            disabled={fetchingUsers}
          >
            {fetchingUsers ? 'Refreshing...' : '🔄 Refresh'}
          </button>
          <span className="user-mgmt-badge">
            🛡️ Admin: {session?.user?.email || ADMIN_EMAIL}
          </span>
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

      {/* Users Table Card */}
      <div className="user-mgmt-card" style={{ marginBottom: '2.5rem' }}>
        <div className="user-mgmt-toolbar">
          <div>
            <h3 className="user-mgmt-card-title" style={{ margin: 0 }}>
              <span>📋</span> Registered Accounts ({filteredUsers.length})
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Live connection with Supabase database
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <div className="user-mgmt-search">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by email, nickname, or ID..."
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
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading users from Supabase...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No accounts match your search or filter.
          </div>
        ) : (
          <div className="user-mgmt-table-wrapper">
            <table className="user-mgmt-table">
              <thead>
                <tr>
                  <th>User / Email</th>
                  <th>Nickname</th>
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
                  const currentNickname = user.display_name || user.email.split('@')[0];

                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontWeight: 500, color: '#f8fafc', fontSize: '0.86rem' }}>{user.email}</span>
                          {isAdmin && <span className="admin-tag">Admin</span>}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                          ID: {user.id.substring(0, 12)}...
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setEditModalUser(user);
                            setEditNickname(user.display_name || '');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: '#38bdf8',
                            fontWeight: 500,
                            fontSize: '0.84rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                          title="Click to edit nickname"
                        >
                          <span>{currentNickname}</span>
                          <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>✏️</span>
                        </button>
                      </td>

                      <td>
                        {isActive ? (
                          <span className="status-badge status-badge-active">
                            ● Active
                          </span>
                        ) : (
                          <span className="status-badge status-badge-inactive">
                            ● Inactive
                          </span>
                        )}
                      </td>

                      <td style={{ fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </td>

                      <td style={{ fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}
                      </td>

                      <td>
                        <div className="user-actions-row">
                          {/* 1. Edit Nickname */}
                          <button
                            type="button"
                            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                            onClick={() => {
                              setEditModalUser(user);
                              setEditNickname(user.display_name || '');
                            }}
                            title="Edit Nickname"
                          >
                            ✏️ Edit
                          </button>

                          {/* 2. Reset Password */}
                          <button
                            type="button"
                            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                            onClick={() => {
                              setResetModalUser(user);
                              setDirectNewPassword('');
                            }}
                            title="Reset Password"
                          >
                            🔑 Reset
                          </button>

                          {/* 3. Activate / Inactivate */}
                          {!isAdmin && (
                            <button
                              type="button"
                              className={`user-mgmt-btn user-mgmt-btn-sm ${isActive ? 'user-mgmt-btn-warning' : 'user-mgmt-btn-success'}`}
                              onClick={() => handleToggleStatus(user)}
                              disabled={loading}
                              title={isActive ? 'Suspend User' : 'Activate User'}
                            >
                              {isActive ? '🔒 Suspend' : '🔓 Activate'}
                            </button>
                          )}

                          {/* 4. Delete */}
                          {!isAdmin && (
                            <button
                              type="button"
                              className="user-mgmt-btn user-mgmt-btn-danger user-mgmt-btn-sm"
                              onClick={() => setDeleteModalUser(user)}
                              disabled={loading}
                              title="Delete User Permanently"
                              style={{ padding: '0.25rem 0.5rem' }}
                            >
                              🗑️
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

      {/* Credentials Vault Section */}
      <div className="user-mgmt-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 className="user-mgmt-card-title" style={{ margin: '0 0 0.25rem 0' }}>
              <span>🗄️</span> Saved Credentials Vault ({vault.length})
            </h3>
            <p className="user-mgmt-card-desc" style={{ margin: 0 }}>
              Quick-copy passwords and accounts for fast testing or player credentials recovery.
            </p>
          </div>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={() => {
              const email = prompt('Enter Account Email:');
              if (!email) return;
              const pass = prompt('Enter Account Password:') || '••••••';
              const name = prompt('Nickname / Note:') || 'Manual Entry';
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
            + Add to Vault
          </button>
        </div>

        {vault.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: '1rem 0' }}>
            No credentials saved in vault. Click "+ Create New User" above to add accounts.
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
                        <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 'bold' }}>
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

      {/* MODAL 1: Create New User Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Create New User</h3>
              <button className="modal-close-btn" onClick={() => setIsCreateModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="user-mgmt-input-group" style={{ margin: 0 }}>
                <label>Email Address</label>
                <input
                  type="email"
                  className="user-mgmt-input"
                  placeholder="player@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                />
              </div>

              <div className="user-mgmt-input-group" style={{ margin: 0 }}>
                <label>Nickname / Display Name (Optional)</label>
                <input
                  type="text"
                  className="user-mgmt-input"
                  placeholder="e.g. SharkVillian"
                  value={newUserNickname}
                  onChange={(e) => setNewUserNickname(e.target.value)}
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

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveToVault}
                  onChange={(e) => setSaveToVault(e.target.checked)}
                />
                Save credentials in Credentials Vault
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="user-mgmt-btn user-mgmt-btn-primary"
                  disabled={loading || !newUserEmail || !newUserPassword}
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit User Nickname Modal */}
      {editModalUser && (
        <div className="modal-overlay" onClick={() => setEditModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Edit User Nickname</h3>
              <button className="modal-close-btn" onClick={() => setEditModalUser(null)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
              Account: <strong style={{ color: 'var(--text-primary)' }}>{editModalUser.email}</strong>
            </p>

            <form onSubmit={handleSaveNickname} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="user-mgmt-input-group" style={{ margin: 0 }}>
                <label>Nickname / Display Name</label>
                <input
                  type="text"
                  className="user-mgmt-input"
                  placeholder="Enter nickname..."
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  autoFocus
                  required
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'block' }}>
                  This nickname will be displayed at the poker tables, lobby, and throughout the academy.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-secondary"
                  onClick={() => setEditModalUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="user-mgmt-btn user-mgmt-btn-primary"
                  disabled={loading || !editNickname.trim()}
                >
                  {loading ? 'Saving...' : 'Save Nickname'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password Modal */}
      {resetModalUser && (
        <div className="modal-overlay" onClick={() => setResetModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔑 Reset Password</h3>
              <button className="modal-close-btn" onClick={() => setResetModalUser(null)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
              Target Account: <strong style={{ color: 'var(--text-primary)' }}>{resetModalUser.email}</strong>
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

            <div style={{ textAlign: 'center', margin: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
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

      {/* MODAL 4: Delete User Confirmation Modal */}
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
