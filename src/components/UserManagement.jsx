import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './UserManagement.css';

const VAULT_STORAGE_KEY = 'poker_admin_credentials_vault';

const UserManagement = ({ session }) => {
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  // Send reset email state
  const [resetEmail, setResetEmail] = useState('');
  
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

  // Discovered database users
  const [discoveredUsers, setDiscoveredUsers] = useState([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  // Initialize vault from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VAULT_STORAGE_KEY);
      if (stored) {
        setVault(JSON.parse(stored));
      } else {
        // Pre-populate with admin reference
        const initial = [
          {
            id: 'admin-root',
            email: session?.user?.email || 'jvazquez.sd@outlook.com',
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

  // Fetch discovered users from poker tables
  useEffect(() => {
    fetchDiscoveredUsers();
  }, []);

  const fetchDiscoveredUsers = async () => {
    setFetchingUsers(true);
    try {
      const userMap = {};

      // 1. Fetch from poker_players
      const { data: players } = await supabase
        .from('poker_players')
        .select('user_id, display_name, created_at, chips, room_id')
        .order('created_at', { ascending: false });

      if (players) {
        players.forEach(p => {
          if (!p.user_id) return;
          if (!userMap[p.user_id]) {
            userMap[p.user_id] = {
              userId: p.user_id,
              displayName: p.display_name || 'Anonymous Player',
              roomsCount: 1,
              handsCount: 0,
              lastSeen: p.created_at || 'Recently'
            };
          } else {
            userMap[p.user_id].roomsCount += 1;
          }
        });
      }

      // 2. Fetch from user_progress
      const { data: progress } = await supabase
        .from('user_progress')
        .select('user_id, completed_lessons, updated_at');

      if (progress) {
        progress.forEach(pr => {
          if (!pr.user_id) return;
          if (!userMap[pr.user_id]) {
            userMap[pr.user_id] = {
              userId: pr.user_id,
              displayName: 'Training Academy Student',
              roomsCount: 0,
              handsCount: 0,
              lessonsCount: pr.completed_lessons ? pr.completed_lessons.length : 0,
              lastSeen: pr.updated_at || 'Recently'
            };
          } else {
            userMap[pr.user_id].lessonsCount = pr.completed_lessons ? pr.completed_lessons.length : 0;
          }
        });
      }

      setDiscoveredUsers(Object.values(userMap));
    } catch (err) {
      console.warn('Could not query discovered users:', err);
    } finally {
      setFetchingUsers(false);
    }
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
    setNewUserPassword(pass);
  };

  // 1. Send Reset Password Email
  const handleSendResetEmail = async (targetEmail) => {
    const emailToSend = targetEmail || resetEmail;
    if (!emailToSend) {
      setAlert({ type: 'error', message: 'Please provide a valid email address.' });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailToSend, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setAlert({ type: 'error', message: `Supabase error: ${error.message}` });
      } else {
        setAlert({
          type: 'success',
          message: `Password reset link dispatched to ${emailToSend}. The user can click it to set a new password!`
        });
        if (!targetEmail) setResetEmail('');
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispatch reset email.' });
    } finally {
      setLoading(false);
    }
  };

  // 2. Direct Update of Current Session Password
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
        setAlert({ type: 'success', message: 'Your password has been successfully updated!' });
        setMyNewPassword('');
        setMyConfirmPassword('');
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  // 3. Provision / Create New User Account
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      setAlert({ type: 'error', message: 'Please fill in both Email and Password.' });
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
        const userObj = {
          id: data?.user?.id || `user_${Date.now()}`,
          email: newUserEmail,
          password: newUserPassword,
          displayName: newUserDisplayName || newUserEmail.split('@')[0],
          note: 'Created via User Control Panel',
          createdAt: new Date().toISOString()
        };

        if (saveToVault) {
          const updatedVault = [userObj, ...vault.filter(v => v.email !== newUserEmail)];
          setVault(updatedVault);
          localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));
        }

        setAlert({
          type: 'success',
          message: `User ${newUserEmail} successfully created and credentials saved to your Credentials Vault!`
        });

        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserDisplayName('');
        fetchDiscoveredUsers();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to create user account.' });
    } finally {
      setLoading(false);
    }
  };

  // Delete from Vault
  const handleDeleteVaultItem = (id) => {
    const updated = vault.filter(v => v.id !== id);
    setVault(updated);
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className="user-mgmt-container">
      {/* Header */}
      <div className="user-mgmt-header">
        <div>
          <h1>👥 User Management & Control</h1>
          <p>Control user accounts, recover lost credentials, and manage testing profiles.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="user-mgmt-badge">
            🛡️ Admin: {session?.user?.email || 'Administrator'}
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

      {/* Control Grid */}
      <div className="user-mgmt-grid">
        {/* Card 1: Password Recovery for Any User */}
        <div className="user-mgmt-card">
          <h3 className="user-mgmt-card-title">
            <span>🔑</span> Recover User Credentials
          </h3>
          <p className="user-mgmt-card-desc">
            Forgot the credentials for an account? Enter the email address below to send an instant password reset link.
          </p>

          <div className="user-mgmt-input-group">
            <label>Target User Email</label>
            <input
              type="email"
              className="user-mgmt-input"
              placeholder="e.g. player2@pokeracademy.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-primary"
            onClick={() => handleSendResetEmail()}
            disabled={loading || !resetEmail}
            style={{ marginTop: 'auto' }}
          >
            ✉️ Send Password Reset Link
          </button>
        </div>

        {/* Card 2: Create / Register New User */}
        <div className="user-mgmt-card">
          <h3 className="user-mgmt-card-title">
            <span>➕</span> Provision New Account
          </h3>
          <p className="user-mgmt-card-desc">
            Create a new player or testing account with known credentials. Automatically saved to your vault.
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
                  onClick={generateRandomPassword}
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
                placeholder="e.g. Shark_Villian"
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

        {/* Card 3: Update Active Admin Password */}
        <div className="user-mgmt-card">
          <h3 className="user-mgmt-card-title">
            <span>🛡️</span> Change Current Password
          </h3>
          <p className="user-mgmt-card-desc">
            Directly update the password for your active admin account without needing your old password.
          </p>

          <form onSubmit={handleUpdateMyPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>New Password</label>
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
              <label>Confirm New Password</label>
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
              Update Password Directly
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
              Stores created credentials locally on this device so you never lose passwords again.
            </p>
          </div>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary"
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
                      className="user-mgmt-btn user-mgmt-btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => setShowPasswords(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      title="Reveal / Mask Password"
                    >
                      {isRevealed ? '🙈 Hide' : '👁️ Show'}
                    </button>

                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => copyToClipboard(item.email, `email_${item.id}`)}
                      title="Copy Email"
                    >
                      {copiedKey === `email_${item.id}` ? '✅ Copied Email' : '📋 Copy Email'}
                    </button>

                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => copyToClipboard(item.password, `pass_${item.id}`)}
                      title="Copy Password"
                    >
                      {copiedKey === `pass_${item.id}` ? '✅ Copied Pass' : '🔑 Copy Pass'}
                    </button>

                    <button
                      type="button"
                      className="user-mgmt-btn user-mgmt-btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => handleSendResetEmail(item.email)}
                      title="Send Password Reset Link"
                    >
                      ✉️ Reset Link
                    </button>

                    {item.id !== 'admin-root' && (
                      <button
                        type="button"
                        className="user-mgmt-btn user-mgmt-btn-danger"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => handleDeleteVaultItem(item.id)}
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

      {/* Discovered Users from Multiplayer & Progress Database */}
      <div className="user-mgmt-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 className="user-mgmt-card-title" style={{ margin: '0 0 0.25rem 0' }}>
              <span>🌐</span> Discovered Active Players ({discoveredUsers.length})
            </h3>
            <p className="user-mgmt-card-desc" style={{ margin: 0 }}>
              Users who have joined multiplayer rooms or tracked training progress in Supabase.
            </p>
          </div>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary"
            onClick={fetchDiscoveredUsers}
            disabled={fetchingUsers}
          >
            {fetchingUsers ? 'Refreshing...' : '🔄 Refresh Players'}
          </button>
        </div>

        {discoveredUsers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: '1rem 0' }}>
            {fetchingUsers ? 'Searching database tables...' : 'No external player activity recorded yet.'}
          </p>
        ) : (
          <div className="user-mgmt-table-wrapper">
            <table className="user-mgmt-table">
              <thead>
                <tr>
                  <th>Display Name</th>
                  <th>User ID</th>
                  <th>Rooms Joined</th>
                  <th>Lessons Done</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {discoveredUsers.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <strong>{u.displayName}</strong>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {u.userId.substring(0, 16)}...
                    </td>
                    <td>{u.roomsCount || 0}</td>
                    <td>{u.lessonsCount || 0}</td>
                    <td>
                      <button
                        type="button"
                        className="user-mgmt-btn user-mgmt-btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          const email = prompt(`Send Password Reset link for ${u.displayName}. Enter their email:`);
                          if (email) handleSendResetEmail(email);
                        }}
                      >
                        ✉️ Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supabase Dashboard Guide & Direct SQL Reference */}
      <details className="user-mgmt-card" style={{ cursor: 'pointer' }}>
        <summary style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)', outline: 'none' }}>
          💡 Supabase Auth Database Reference (For Full DB View)
        </summary>
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <p>
            Supabase handles credentials in its secure internal <code>auth.users</code> schema. If you need to view all raw registered accounts or reset passwords directly inside the Supabase Console:
          </p>
          <ol style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
            <li>Go to your <strong>Supabase Dashboard</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Users</strong>.</li>
            <li>You will see all registered emails, last signed-in dates, and can click "Send password recovery" or "Delete user" directly.</li>
            <li>Alternatively, in the <strong>SQL Editor</strong>, execute this query:</li>
          </ol>
          <pre className="sql-block">
{`-- View all registered accounts in Supabase Auth
SELECT id, email, created_at, last_sign_in_at 
FROM auth.users 
ORDER BY created_at DESC;`}
          </pre>
        </div>
      </details>
    </div>
  );
};

export default UserManagement;
