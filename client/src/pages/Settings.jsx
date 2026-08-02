import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useSpaceStore } from '../store/spaceStore';
import { useUiStore } from '../store/uiStore';
import { useMode } from '../hooks/useMode';
import { useNavigate, useLocation } from 'react-router-dom';
import { DotIcon } from '../components/Logo';
import BackupModal from '../components/BackupModal';
import AiServerPanel from '../components/AiServerPanel';

export default function Settings() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const {
    theme, setTheme, colorPalette, setColorPalette, tempUnit, setTempUnit,
    weatherRefreshMins, setWeatherRefreshMins, zipCode, setZipCode,
    lowMotion, setLowMotion, motionPrefs, setMotionPref,
  } = useUiStore();
  const qc = useQueryClient();
  const [zipInput, setZipInput] = useState(zipCode);
  const [zipSaved, setZipSaved] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState(null); // 'ok' | 'fail'
  const { mode, setMode } = useMode();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [nickname,    setNickname]    = useState(user?.nickname    || '');
  const [saved, setSaved] = useState(false);

  const avatarInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const { data: updated } = await api.post(`/users/${user.id}/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      useAuthStore.getState().setUser({ ...user, ...updated }, null);
    } catch (err) {
      setAvatarError(err.response?.data?.error || 'Upload failed');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  // ── Account editing ──────────────────────────────────────────────────────────
  const [acctUsername,  setAcctUsername]  = useState(user?.username || '');
  const [acctUsernameSaved, setAcctUsernameSaved] = useState(false);
  const [acctUsernameError, setAcctUsernameError] = useState('');

  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [pwSaved,    setPwSaved]    = useState(false);
  const [pwError,    setPwError]    = useState('');

  const updateUsername = useMutation({
    mutationFn: (data) => api.put(`/users/${user.id}`, data),
    onSuccess: ({ data: updated }) => {
      useAuthStore.getState().setUser({ ...user, ...updated }, null);
      setAcctUsernameSaved(true);
      setAcctUsernameError('');
      setTimeout(() => setAcctUsernameSaved(false), 2500);
    },
    onError: (err) => setAcctUsernameError(err.response?.data?.error || 'Failed to update username'),
  });

  const updatePassword = useMutation({
    mutationFn: (data) => api.put(`/users/${user.id}`, data),
    onSuccess: () => {
      setPwSaved(true);
      setPwError('');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSaved(false), 2500);
    },
    onError: (err) => setPwError(err.response?.data?.error || 'Failed to update password'),
  });

  // ── PIN (self) ───────────────────────────────────────────────────────────────
  const [pin,        setPin]        = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaved,   setPinSaved]   = useState(false);
  const [pinError,   setPinError]   = useState('');

  const updatePin = useMutation({
    mutationFn: (data) => api.post('/auth/change-pin', data),
    onSuccess: () => {
      setPinSaved(true);
      setPinError('');
      setPin(''); setConfirmPin('');
      setTimeout(() => setPinSaved(false), 2500);
    },
    onError: (err) => setPinError(err.response?.data?.error || 'Failed to update PIN'),
  });

  function handleSavePin(e) {
    e.preventDefault();
    setPinError('');
    if (!/^\d{6}$/.test(pin)) { setPinError('PIN must be exactly 6 digits'); return; }
    if (pin !== confirmPin) { setPinError('PINs do not match'); return; }
    updatePin.mutate({ pin });
  }

  function handleSaveUsername() {
    setAcctUsernameError('');
    const trimmed = acctUsername.trim().toLowerCase().replace(/\s/g, '');
    if (!trimmed) { setAcctUsernameError('Username cannot be empty'); return; }
    if (trimmed === user.username) { setAcctUsernameError('That is already your username'); return; }
    updateUsername.mutate({ username: trimmed });
  }

  function handleSavePassword(e) {
    e.preventDefault();
    setPwError('');
    if (!currentPw) { setPwError('Enter your current password'); return; }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    updatePassword.mutate({ currentPassword: currentPw, password: newPw });
  }

  // ── Member management state ──────────────────────────────────────────────────
  // activeAction: { id, type: 'reset' | 'resetpin' | 'delete' } | null
  const [activeAction,  setActiveAction]  = useState(null);
  const [resetPwValue,  setResetPwValue]  = useState('');
  const [resetPwError,  setResetPwError]  = useState('');
  const [resetPwSaved,  setResetPwSaved]  = useState(false);
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPinError, setResetPinError] = useState('');
  const [resetPinSaved, setResetPinSaved] = useState(false);

  const deleteMember = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setActiveAction(null);
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: ({ userId, role }) => api.put(`/users/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setActiveAction(null);
    },
  });

  const resetMemberPw = useMutation({
    mutationFn: ({ userId, newPassword }) => api.post('/auth/reset-password', { userId, newPassword }),
    onSuccess: () => {
      setResetPwSaved(true);
      setResetPwValue('');
      setResetPwError('');
      setTimeout(() => { setResetPwSaved(false); setActiveAction(null); }, 2000);
    },
    onError: (err) => setResetPwError(err.response?.data?.error || 'Failed to reset password'),
  });

  function handleResetPw(memberId) {
    setResetPwError('');
    if (!resetPwValue.trim()) { setResetPwError('Enter a new password'); return; }
    resetMemberPw.mutate({ userId: memberId, newPassword: resetPwValue });
  }

  const resetMemberPin = useMutation({
    mutationFn: ({ userId, newPin }) => api.post('/auth/reset-pin', { userId, newPin }),
    onSuccess: () => {
      setResetPinSaved(true);
      setResetPinValue('');
      setResetPinError('');
      setTimeout(() => { setResetPinSaved(false); setActiveAction(null); }, 2000);
    },
    onError: (err) => setResetPinError(err.response?.data?.error || 'Failed to reset PIN'),
  });

  function handleResetPin(memberId) {
    setResetPinError('');
    if (!/^\d{6}$/.test(resetPinValue)) { setResetPinError('PIN must be exactly 6 digits'); return; }
    resetMemberPin.mutate({ userId: memberId, newPin: resetPinValue });
  }

  // ── New-member form state ────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm]     = useState(false);
  const [newName, setNewName]             = useState('');
  const [newUsername, setNewUsername]     = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [newRole, setNewRole]             = useState('member');
  const [createdUser, setCreatedUser]     = useState(null); // holds result after creation
  const [createError, setCreateError]     = useState('');
  const [copiedField, setCopiedField]     = useState('');

  const { data: members = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: user?.role === 'admin',
  });

  // ── Space join requests — gated on space-level admin (per-space, e.g. the
  // user who created the current space), not the global household `user.role`.
  // Someone can be admin of a space they created without being a global admin.
  const { currentSpaceId, currentSpace } = useSpaceStore();
  const isSpaceAdmin = currentSpace?.my_role === 'admin';

  const { data: joinRequests = [] } = useQuery({
    queryKey: ['spaces', currentSpaceId, 'join-requests'],
    queryFn: () => api.get(`/spaces/${currentSpaceId}/join-requests`).then(r => r.data),
    enabled: isSpaceAdmin && !!currentSpaceId,
  });

  const decideJoinRequest = useMutation({
    mutationFn: ({ requestId, decision }) => api.post(`/spaces/${currentSpaceId}/join-requests/${requestId}/${decision}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', currentSpaceId, 'join-requests'] });
      qc.invalidateQueries({ queryKey: ['spaces', currentSpaceId, 'members'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // ── Space members — space-admin manages membership/role for the current
  // space specifically (distinct from the global Members panel above, which
  // manages every household user's global account).
  const { data: spaceMembers = [] } = useQuery({
    queryKey: ['spaces', currentSpaceId, 'members'],
    queryFn: () => api.get(`/spaces/${currentSpaceId}/members`).then(r => r.data),
    enabled: isSpaceAdmin && !!currentSpaceId,
  });

  const changeSpaceMemberRole = useMutation({
    mutationFn: ({ userId, role }) => api.put(`/spaces/${currentSpaceId}/members/${userId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces', currentSpaceId, 'members'] }),
  });

  const removeSpaceMember = useMutation({
    mutationFn: (userId) => api.delete(`/spaces/${currentSpaceId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces', currentSpaceId, 'members'] }),
  });

  const createMember = useMutation({
    mutationFn: (data) => api.post('/users', data),
    onSuccess: ({ data: created }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreatedUser({ ...created, plainPassword: newPassword });
      setNewName(''); setNewUsername(''); setNewPassword(''); setNewRole('member');
      setCreateError('');
    },
    onError: (err) => {
      setCreateError(err.response?.data?.error || 'Failed to create user');
    },
  });

  function handleCreateMember(e) {
    e.preventDefault();
    setCreateError('');
    if (!newName.trim() || !newUsername.trim() || !newPassword.trim()) {
      setCreateError('All fields are required');
      return;
    }
    createMember.mutate({ display_name: newName.trim(), username: newUsername.trim(), password: newPassword, role: newRole });
  }

  function copyToClipboard(text, field) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    });
  }

  function resetAddForm() {
    setShowAddForm(false);
    setCreatedUser(null);
    setCreateError('');
    setNewName(''); setNewUsername(''); setNewPassword(''); setNewRole('member');
  }

  const update = useMutation({
    mutationFn: (data) => api.put(`/users/${user.id}`, data),
    onSuccess: ({ data: updated }) => {
      useAuthStore.getState().setUser({ ...user, ...updated }, null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ── AI Configurations ─────────────────────────────────────────────────────
  const location = useLocation();
  const aiSectionRef = useRef(null);

  const PROVIDER_PRESETS = {
    Ollama:     'http://localhost:11434',
    'LM Studio': 'http://localhost:1234',
    OpenRouter: 'https://openrouter.ai/api/v1',
    LiteRT:     'http://127.0.0.1:9379',
    Custom:     '',
  };

  const DEFAULT_FORM = {
    name: '', provider: 'Ollama',
    base_url: 'http://localhost:11434', api_key: '', model: 'llama3',
    temperature: 0.7, max_tokens: 2048, context_window: 4096,
    top_p: 1.0, frequency_penalty: 0.0, presence_penalty: 0.0,
  };

  const [showBackupModal, setShowBackupModal] = useState(false);

  const [showForm,       setShowForm]       = useState(false);
  const [editingId,      setEditingId]      = useState(null);
  const [form,           setForm]           = useState(DEFAULT_FORM);
  const [configSaved,    setConfigSaved]    = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading,  setModelsLoading]  = useState(false);
  const [modelsError,    setModelsError]    = useState(null);
  const [llmTestResult,  setLlmTestResult]  = useState(null);
  const [llmTesting,     setLlmTesting]     = useState(false);
  const [showAdvanced,   setShowAdvanced]   = useState(false);

  const setF = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const { data: llmConfigs = [] } = useQuery({
    queryKey: ['llm-configurations'],
    queryFn: () => api.get('/admin/llm-configurations').then(r => r.data),
    enabled: user?.role === 'admin',
  });

  useEffect(() => {
    if (location.hash === '#ai-settings' && aiSectionRef.current) {
      setTimeout(() => aiSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [location.hash]);

  const saveConfig = useMutation({
    mutationFn: () => editingId
      ? api.put(`/admin/llm-configurations/${editingId}`, form)
      : api.post('/admin/llm-configurations', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llm-configurations'] });
      setConfigSaved(true);
      setTimeout(() => { setConfigSaved(false); setShowForm(false); }, 1200);
    },
  });

  const deleteConfig = useMutation({
    mutationFn: (id) => api.delete(`/admin/llm-configurations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llm-configurations'] });
      setShowForm(false);
      setEditingId(null);
    },
  });

  const activateConfig = useMutation({
    mutationFn: (id) => api.post(`/admin/llm-configurations/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-configurations'] }),
  });

  function detectProvider(url = '') {
    if (url.includes('localhost:11434'))   return 'Ollama';
    if (url.includes('localhost:1234'))    return 'LM Studio';
    if (url.includes('openrouter.ai'))     return 'OpenRouter';
    if (url.includes('127.0.0.1:9379'))    return 'LiteRT';
    return 'Custom';
  }

  function openNewForm() {
    setForm({ ...DEFAULT_FORM });
    setEditingId(null);
    setShowForm(true);
    setAvailableModels([]);
    setModelsError(null);
    setLlmTestResult(null);
    setConfigSaved(false);
    setShowAdvanced(false);
  }

  function openEditForm(cfg) {
    setForm({
      name:              cfg.name,
      provider:          cfg.provider || detectProvider(cfg.base_url),
      base_url:          cfg.base_url,
      api_key:           cfg.api_key || '',
      model:             cfg.model,
      temperature:       cfg.temperature  ?? 0.7,
      max_tokens:        cfg.max_tokens   ?? 2048,
      context_window:    cfg.context_window ?? 4096,
      top_p:             cfg.top_p        ?? 1.0,
      frequency_penalty: cfg.frequency_penalty ?? 0.0,
      presence_penalty:  cfg.presence_penalty  ?? 0.0,
    });
    setEditingId(cfg.id);
    setShowForm(true);
    setAvailableModels([]);
    setModelsError(null);
    setLlmTestResult(null);
    setConfigSaved(false);
    setShowAdvanced(false);
  }

  async function handleLoadModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const params = new URLSearchParams();
      if (form.base_url.trim()) params.set('base_url', form.base_url.trim());
      if (form.api_key.trim())  params.set('api_key',  form.api_key.trim());
      const { data } = await api.get(`/admin/llm-models?${params}`);
      setAvailableModels(data.models || []);
      if (!data.models?.length) setModelsError('No models found on this server.');
    } catch (err) {
      setModelsError(err.response?.data?.error || err.message);
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleLlmTest() {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const { data } = await api.get('/admin/llm-test');
      setLlmTestResult({ ok: true, message: `Connected — ${data.model}` });
    } catch (err) {
      setLlmTestResult({ ok: false, message: err.response?.data?.error || err.message });
    } finally {
      setLlmTesting(false);
    }
  }

  const PALETTES = [
    { id: 'terracotta', name: 'Terra',    primary: '#a63418', surface: '#f9f9f9' },
    { id: 'ocean',      name: 'Ocean',    primary: '#1565c0', surface: '#ffffff' }, // f5f8ff
    { id: 'gray',       name: 'Gray',     primary: '#37352f', surface: '#fbfbfa' },
    { id: 'mono',       name: 'Mono',     primary: '#000000', surface: '#ffffff' },
    { id: 'smoke',      name: 'Smoke',    primary: '#334155', surface: '#f8fafc' },
  ];

  return (
    <div className="w-full space-y-6">
      <h1 className="text-headline-lg text-on-background">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">

        {/* ── Col 1: Profile · Appearance · Weather ── */}
        <div className="space-y-6">

      {/* Profile */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">account_circle</span>
          <h2 className="text-headline-md text-on-background">Profile</h2>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-white text-title-lg font-bold"
              style={{ backgroundColor: user?.avatar_colour || '#6366f1' }}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : (user?.display_name || '?').slice(0, 1).toUpperCase()
              }
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition disabled:opacity-60"
              title="Upload photo"
            >
              {avatarUploading
                ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              }
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="text-body-md text-on-surface font-medium">{user?.display_name}</p>
            <p className="text-label-sm text-on-surface-variant">@{user?.username}</p>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="mt-1.5 text-label-sm text-primary hover:underline disabled:opacity-50"
            >
              {avatarUploading ? 'Uploading…' : 'Change photo'}
            </button>
            {avatarError && <p className="text-label-sm text-error mt-1">{avatarError}</p>}
          </div>
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-1.5">Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1.5">Nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Optional — shown instead of your name in the app"
            className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
          />
        </div>
        <button
          onClick={() => update.mutate({ display_name: displayName, nickname: nickname.trim() || null })}
          className="px-5 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition flex items-center gap-2"
        >
          {saved && <span className="material-symbols-outlined text-[16px]">check</span>}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </section>

      {/* Appearance */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">palette</span>
          <h2 className="text-headline-md text-on-background">Appearance</h2>
        </div>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-3">Theme</label>
          <div className="flex gap-3">
            {['light', 'dark', 'system'].map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-3 rounded-full text-label-md font-bold capitalize transition border ${
                  theme === t
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-3">Default Mode</label>
          <div className="flex gap-3">
            {[
              { value: 'desktop', icon: 'desktop_windows' },
              { value: 'tablet',  icon: 'tablet_mac' },
              { value: 'phone',   icon: 'smartphone' },
            ].map(({ value, icon }) => (
              <button
                key={value}
                onClick={() => { setMode(value); window.location.reload(); }}
                className={`flex-1 py-3 rounded-full text-label-md font-bold capitalize transition border flex items-center justify-center gap-1.5 ${
                  mode === value
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-3">Color Palette</label>
          <div className="flex gap-2">
            {PALETTES.map(p => (
              <button
                key={p.id}
                onClick={() => setColorPalette(p.id)}
                title={p.name}
                className={`flex-1 flex flex-col items-center gap-2 py-3 px-1 rounded-2xl transition border ${
                  colorPalette === p.id
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full shadow-soft flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.surface} 50%)` }}
                />
                <span className={`text-label-sm font-bold ${
                  colorPalette === p.id ? 'text-primary' : 'text-on-surface-variant'
                }`}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Weather */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">partly_cloudy_day</span>
          <h2 className="text-headline-md text-on-background">Weather</h2>
        </div>

        {/* Temperature unit */}
        <div>
          <label className="block text-label-md text-on-surface-variant mb-3">Temperature Unit</label>
          <div className="flex gap-3">
            {[
              { value: 'F', label: '°F — Fahrenheit' },
              { value: 'C', label: '°C — Celsius' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTempUnit(value)}
                className={`flex-1 py-3 rounded-full text-label-md font-bold transition border ${
                  tempUnit === value
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh frequency */}
        <div>
          <label className="block text-label-md text-on-surface-variant mb-3">Refresh Frequency</label>
          <div className="flex gap-2">
            {[
              { mins: 5,  label: '5 min'  },
              { mins: 10, label: '10 min' },
              { mins: 15, label: '15 min' },
              { mins: 30, label: '30 min' },
              { mins: 60, label: '1 hour' },
            ].map(({ mins, label }) => (
              <button
                key={mins}
                onClick={() => setWeatherRefreshMins(mins)}
                className={`flex-1 py-2.5 rounded-full text-label-md font-bold transition border ${
                  weatherRefreshMins === mins
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="pt-1 border-t border-outline-variant/20 space-y-3">
          <div>
            <p className="text-label-md text-on-surface-variant mb-1">Location</p>
            <p className="text-body-md text-on-surface-variant">
              Weather uses your browser location automatically. If access is blocked, enter a zip or postal code below as a fallback.
            </p>
          </div>

          {/* Zip code input */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-on-surface-variant/60 text-[20px]">pin_drop</span>
              <input
                type="text"
                value={zipInput}
                onChange={(e) => { setZipInput(e.target.value); setZipSaved(false); }}
                placeholder="Zip / postal code (e.g. 10001)"
                className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder-on-surface-variant/50"
              />
            </div>
            <button
              onClick={() => {
                setZipCode(zipInput.trim());
                qc.invalidateQueries({ queryKey: ['weather-coords'] });
                qc.invalidateQueries({ queryKey: ['weather'] });
                setZipSaved(true);
                setTimeout(() => setZipSaved(false), 2000);
              }}
              disabled={!zipInput.trim() || zipInput.trim() === zipCode}
              className="h-12 px-5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40 flex items-center gap-2"
            >
              {zipSaved && <span className="material-symbols-outlined text-[16px]">check</span>}
              {zipSaved ? 'Saved!' : 'Save'}
            </button>
          </div>

          {/* Reset cached coords */}
          <button
            disabled={detecting}
            onClick={async () => {
              setDetecting(true);
              setDetectStatus(null);
              localStorage.removeItem('weather_coords');
              const fresh = await new Promise((resolve) => {
                if (!navigator.geolocation) return resolve(null);
                navigator.geolocation.getCurrentPosition(
                  ({ coords: c }) => resolve({ lat: c.latitude, lon: c.longitude }),
                  () => resolve(null),
                  { timeout: 12_000, enableHighAccuracy: false, maximumAge: 0 },
                );
              });
              if (fresh) localStorage.setItem('weather_coords', JSON.stringify(fresh));
              qc.invalidateQueries({ queryKey: ['weather-coords'] });
              qc.invalidateQueries({ queryKey: ['weather'] });
              setDetecting(false);
              setDetectStatus(fresh ? 'ok' : 'fail');
              setTimeout(() => setDetectStatus(null), 3000);
            }}
            className="flex items-center gap-2 px-5 py-2.5 border border-outline-variant text-on-surface-variant rounded-full text-label-md font-bold hover:bg-surface-container transition disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${detecting ? 'animate-spin' : ''}`}>
              {detecting ? 'progress_activity' : detectStatus === 'ok' ? 'check' : detectStatus === 'fail' ? 'location_off' : 'my_location'}
            </span>
            {detecting ? 'Detecting…' : detectStatus === 'ok' ? 'Location Updated' : detectStatus === 'fail' ? 'Location Unavailable' : 'Re-detect Location'}
          </button>
        </div>
      </section>

      {/* Motion */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">motion_photos_off</span>
          <h2 className="text-headline-md text-on-background">Motion</h2>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-body-md font-semibold text-on-surface">Reduce Motion</p>
            <p className="text-label-sm text-on-surface-variant">Turns off all decorative animation below at once.</p>
          </div>
          <div
            role="switch"
            aria-checked={lowMotion}
            onClick={() => setLowMotion(!lowMotion)}
            className={`w-10 h-6 rounded-full transition-colors flex items-center flex-shrink-0 cursor-pointer ${lowMotion ? 'bg-primary' : 'bg-outline-variant'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${lowMotion ? 'translate-x-4' : ''}`} />
          </div>
        </div>

        <div className={`space-y-3 pt-1 border-t border-outline-variant/20 ${lowMotion ? 'opacity-40 pointer-events-none' : ''}`}>
          {[
            { key: 'celebrations', label: 'Task & habit celebrations' },
            { key: 'weather',      label: 'Weather icon animations' },
            { key: 'jiggle',       label: 'Widget edit-mode jiggle' },
            { key: 'alarmRing',    label: 'Alarm ring shake' },
            { key: 'breathing',    label: 'Breathing circle pulse' },
          ].map(({ key, label }) => {
            const on = motionPrefs[key] !== false;
            return (
              <div key={key} className="flex items-center justify-between gap-4 pt-2 first:pt-0">
                <p className="text-body-md text-on-surface">{label}</p>
                <div
                  role="switch"
                  aria-checked={on}
                  onClick={() => setMotionPref(key, !on)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center flex-shrink-0 cursor-pointer ${on ? 'bg-primary' : 'bg-outline-variant'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${on ? 'translate-x-4' : ''}`} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

        </div>{/* ── end col 1 ── */}

        {/* ── Col 2: Account · All Members (global admin) · Space Members · Join Requests (space admin) ── */}
        <div className="space-y-6">

      {/* Account */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">manage_accounts</span>
          <h2 className="text-headline-md text-on-background">Account</h2>
        </div>

        {/* Role (read-only) — admin/member is per-space, not a single household-wide role */}
        <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl">
          <span className="material-symbols-outlined text-on-surface-variant/60 text-[20px]">shield_person</span>
          <div>
            <p className="text-label-sm text-on-surface-variant">
              Role{currentSpace?.name ? ` in ${currentSpace.name}` : ''}
            </p>
            <p className="text-body-md text-on-surface font-medium capitalize">
              {currentSpace?.my_role || user?.role}
            </p>
          </div>
        </div>

        {/* Username */}
        <div className="space-y-2">
          <label className="block text-label-md text-on-surface-variant">Username</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">alternate_email</span>
              <input
                type="text"
                value={acctUsername}
                onChange={e => { setAcctUsername(e.target.value.toLowerCase().replace(/\s/g, '')); setAcctUsernameError(''); }}
                autoCapitalize="none"
                className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full"
              />
            </div>
            <button
              onClick={handleSaveUsername}
              disabled={updateUsername.isPending || acctUsername.trim() === user?.username}
              className="h-12 px-5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40 flex items-center gap-2"
            >
              {acctUsernameSaved
                ? <><span className="material-symbols-outlined text-[16px]">check</span>Saved</>
                : updateUsername.isPending ? 'Saving…' : 'Save'
              }
            </button>
          </div>
          {acctUsernameError && (
            <p className="text-label-sm text-error px-2">{acctUsernameError}</p>
          )}
        </div>

        {/* Change Password */}
        <details className="group pt-1 border-t border-outline-variant/20">
          <summary className="flex items-center gap-1.5 text-label-md text-on-surface-variant font-bold tracking-wider hover:text-primary transition cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">
              chevron_right
            </span>
            Change Password
          </summary>
          <form onSubmit={handleSavePassword} className="space-y-3 pt-4">
          {pwError && (
            <p className="text-label-sm text-error bg-error-container px-4 py-2.5 rounded-xl">{pwError}</p>
          )}
          {pwSaved && (
            <p className="text-label-sm text-primary bg-primary/10 px-4 py-2.5 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Password updated successfully
            </p>
          )}

          {[
            { value: currentPw, set: setCurrentPw, placeholder: 'Current password',  icon: 'lock' },
            { value: newPw,     set: setNewPw,     placeholder: 'New password',       icon: 'key'  },
            { value: confirmPw, set: setConfirmPw, placeholder: 'Confirm new password', icon: 'key_vertical' },
          ].map(({ value, set, placeholder, icon }) => (
            <div key={placeholder} className="flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">{icon}</span>
              <input
                type="password"
                value={value}
                onChange={e => { set(e.target.value); setPwError(''); }}
                placeholder={placeholder}
                className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder:text-on-surface-variant/50"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={updatePassword.isPending || !currentPw || !newPw || !confirmPw}
            className="w-full py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {updatePassword.isPending
              ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Updating…</>
              : 'Update Password'
            }
          </button>
          </form>
        </details>

        {/* Change PIN */}
        <details className="group pt-1 border-t border-outline-variant/20">
          <summary className="flex items-center gap-1.5 text-label-md text-on-surface-variant font-bold tracking-wider hover:text-primary transition cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">
              chevron_right
            </span>
            Change PIN
          </summary>
          <form onSubmit={handleSavePin} className="space-y-3 pt-4">
          <p className="text-label-sm text-on-surface-variant -mt-1">A quick 6-digit way to unlock paperr without typing your password.</p>

          {pinError && (
            <p className="text-label-sm text-error bg-error-container px-4 py-2.5 rounded-xl">{pinError}</p>
          )}
          {pinSaved && (
            <p className="text-label-sm text-primary bg-primary/10 px-4 py-2.5 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              PIN updated successfully
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              placeholder="New PIN"
              className="bg-surface-container rounded-full px-4 h-12 text-body-md text-on-surface border-none focus:ring-2 focus:ring-primary/20 w-full font-mono tracking-widest text-center placeholder:text-on-surface-variant/50"
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              placeholder="Confirm PIN"
              className="bg-surface-container rounded-full px-4 h-12 text-body-md text-on-surface border-none focus:ring-2 focus:ring-primary/20 w-full font-mono tracking-widest text-center placeholder:text-on-surface-variant/50"
            />
          </div>

          <button
            type="submit"
            disabled={updatePin.isPending || pin.length !== 6 || confirmPin.length !== 6}
            className="w-full py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {updatePin.isPending
              ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Updating…</>
              : 'Update PIN'
            }
          </button>
          </form>
        </details>

        {/* Sign out */}
        <div className="pt-1 border-t border-outline-variant/20">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 border border-error text-error rounded-full text-label-md font-bold hover:bg-error-container transition"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Sign Out
          </button>
        </div>
      </section>

      {user?.role === 'admin' && (
      <>

      {/* Members */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">group</span>
              <h2 className="text-headline-md text-on-background">All Members</h2>
            </div>
            {!showAddForm && (
              <button
                onClick={() => { setShowAddForm(true); setCreatedUser(null); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition"
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                Add Member
              </button>
            )}
          </div>

          {/* Member list */}
          <ul className="space-y-2">
            {members.map(m => {
              const isSelf      = m.id === user.id;
              const isActive    = activeAction?.id === m.id;
              const isReset     = isActive && activeAction.type === 'reset';
              const isResetPin  = isActive && activeAction.type === 'resetpin';
              const isDel       = isActive && activeAction.type === 'delete';
              const isRole      = isActive && activeAction.type === 'role';

              return (
                <li key={m.id} className="rounded-xl bg-surface-container overflow-hidden">

                  {/* ── Main row ── */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-label-md font-bold flex-shrink-0"
                      style={{ backgroundColor: m.avatar_colour || '#6366f1' }}
                    >
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt={m.display_name} className="w-full h-full object-cover" />
                        : m.display_name.slice(0, 1).toUpperCase()
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-body-md text-on-surface font-medium truncate">
                        {m.display_name}
                        {isSelf && <span className="ml-2 text-label-sm text-on-surface-variant font-normal">(you)</span>}
                      </p>
                      <p className="text-label-sm text-on-surface-variant">@{m.username}</p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-label-sm font-bold flex-shrink-0 ${
                      m.role === 'admin' ? 'bg-primary/10 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {m.role}
                    </span>

                    {/* Action buttons — hidden for self */}
                    {!isSelf && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          title="Change role"
                          onClick={() => setActiveAction(isRole ? null : { id: m.id, type: 'role' })}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                            isRole
                              ? 'bg-primary text-on-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">shield_person</span>
                        </button>
                        <button
                          title="Reset password"
                          onClick={() => {
                            setActiveAction(isReset ? null : { id: m.id, type: 'reset' });
                            setResetPwValue(''); setResetPwError(''); setResetPwSaved(false);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                            isReset
                              ? 'bg-primary text-on-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">key</span>
                        </button>
                        <button
                          title="Reset PIN"
                          onClick={() => {
                            setActiveAction(isResetPin ? null : { id: m.id, type: 'resetpin' });
                            setResetPinValue(''); setResetPinError(''); setResetPinSaved(false);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                            isResetPin
                              ? 'bg-primary text-on-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">dialpad</span>
                        </button>
                        <button
                          title="Remove member"
                          onClick={() => setActiveAction(isDel ? null : { id: m.id, type: 'delete' })}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                            isDel
                              ? 'bg-error text-white'
                              : 'text-on-surface-variant hover:bg-error-container hover:text-error'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">person_remove</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Change role panel ── */}
                  {isRole && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-label-md text-on-surface-variant font-bold tracking-wider">
                        Change Role for {m.display_name}
                      </p>
                      <div className="flex gap-3">
                        {[
                          { value: 'member', label: '👤 Member' },
                          { value: 'admin',  label: '⚡ Admin'  },
                        ].map(r => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => updateMemberRole.mutate({ userId: m.id, role: r.value })}
                            disabled={updateMemberRole.isPending || m.role === r.value}
                            className={`flex-1 py-2.5 rounded-full text-label-md font-bold transition border disabled:opacity-60 ${
                              m.role === r.value
                                ? 'bg-primary text-on-primary border-primary'
                                : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Reset password panel ── */}
                  {isReset && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-label-md text-on-surface-variant font-bold tracking-wider">
                        Reset Password for {m.display_name}
                      </p>
                      {resetPwError && <p className="text-label-sm text-error">{resetPwError}</p>}
                      {resetPwSaved && (
                        <p className="text-label-sm text-primary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Password reset
                        </p>
                      )}
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-surface-container-high rounded-full px-4 h-11 focus-within:ring-2 focus-within:ring-primary/20">
                          <span className="material-symbols-outlined text-on-surface-variant/50 text-[18px]">key</span>
                          <input
                            type="text"
                            value={resetPwValue}
                            onChange={e => { setResetPwValue(e.target.value); setResetPwError(''); }}
                            placeholder="New password"
                            className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder:text-on-surface-variant/50 font-mono"
                          />
                        </div>
                        <button
                          onClick={() => handleResetPw(m.id)}
                          disabled={resetMemberPw.isPending || !resetPwValue.trim()}
                          className="h-11 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40"
                        >
                          {resetMemberPw.isPending ? 'Saving…' : 'Reset'}
                        </button>
                        <button
                          onClick={() => setActiveAction(null)}
                          className="h-11 px-4 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Reset PIN panel ── */}
                  {isResetPin && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-label-md text-on-surface-variant font-bold tracking-wider">
                        Reset PIN for {m.display_name}
                      </p>
                      {resetPinError && <p className="text-label-sm text-error">{resetPinError}</p>}
                      {resetPinSaved && (
                        <p className="text-label-sm text-primary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          PIN reset
                        </p>
                      )}
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-surface-container-high rounded-full px-4 h-11 focus-within:ring-2 focus-within:ring-primary/20">
                          <span className="material-symbols-outlined text-on-surface-variant/50 text-[18px]">dialpad</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={6}
                            value={resetPinValue}
                            onChange={e => { setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 6)); setResetPinError(''); }}
                            placeholder="New 6-digit PIN"
                            className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder:text-on-surface-variant/50 font-mono tracking-widest"
                          />
                        </div>
                        <button
                          onClick={() => handleResetPin(m.id)}
                          disabled={resetMemberPin.isPending || resetPinValue.length !== 6}
                          className="h-11 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40"
                        >
                          {resetMemberPin.isPending ? 'Saving…' : 'Reset'}
                        </button>
                        <button
                          onClick={() => setActiveAction(null)}
                          className="h-11 px-4 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Delete confirm panel ── */}
                  {isDel && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-body-md text-on-surface">
                        Remove <span className="font-bold">{m.display_name}</span> from the household?
                        Their tasks will be kept but they won't be able to log in.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteMember.mutate(m.id)}
                          disabled={deleteMember.isPending}
                          className="h-10 px-5 rounded-full bg-error text-white text-label-md font-bold hover:bg-error/90 transition disabled:opacity-40 flex items-center gap-2"
                        >
                          {deleteMember.isPending
                            ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            : <span className="material-symbols-outlined text-[16px]">person_remove</span>
                          }
                          {deleteMember.isPending ? 'Removing…' : 'Yes, Remove'}
                        </button>
                        <button
                          onClick={() => setActiveAction(null)}
                          className="h-10 px-5 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                </li>
              );
            })}
          </ul>

          {/* Add member form */}
          {showAddForm && !createdUser && (
            <form onSubmit={handleCreateMember} className="space-y-4 pt-2 border-t border-outline-variant/20">
              <h3 className="text-label-md font-bold text-on-surface-variant tracking-wider">New Member</h3>

              {createError && (
                <p className="text-label-md text-error bg-error-container px-4 py-2.5 rounded-xl">{createError}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Display name */}
                <div className="col-span-2 flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">badge</span>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Name"
                    className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder-on-surface-variant/50"
                  />
                </div>

                {/* Username */}
                <div className="col-span-2 flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">alternate_email</span>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="Username (no spaces)"
                    autoCapitalize="none"
                    className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder-on-surface-variant/50"
                  />
                </div>

                {/* Temp password */}
                <div className="col-span-2 flex items-center gap-2 bg-surface-container rounded-full px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">key</span>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Temporary password"
                    className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder-on-surface-variant/50 font-mono"
                  />
                </div>

                {/* Role selector */}
                <div className="col-span-2">
                  <p className="text-label-md text-on-surface-variant mb-2">Role</p>
                  <div className="flex gap-3">
                    {[
                      { value: 'member', label: '👤 Member' },
                      { value: 'admin',  label: '⚡ Admin'  },
                    ].map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setNewRole(r.value)}
                        className={`flex-1 py-2.5 rounded-full text-label-md font-bold transition border ${
                          newRole === r.value
                            ? 'bg-primary text-on-primary border-primary'
                            : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {newRole === 'admin' && (
                    <p className="text-label-sm text-on-surface-variant mt-2 px-1">
                      Admins can manage users, view audit logs, and change app settings.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={createMember.isPending}
                  className="flex-1 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createMember.isPending
                    ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]">person_add</span>
                  }
                  {createMember.isPending ? 'Creating…' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="px-5 py-2.5 border border-outline-variant text-on-surface-variant rounded-full text-label-md font-bold hover:bg-surface-container transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Success — show credentials to share */}
          {createdUser && (
            <div className="pt-2 border-t border-outline-variant/20 space-y-4">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined text-[20px] text-primary">check_circle</span>
                <p className="text-body-md font-medium">
                  Account created for <span className="text-primary font-bold">{createdUser.display_name}</span>
                </p>
              </div>

              <div className="bg-surface-container rounded-xl p-4 space-y-3">
                <p className="text-label-md text-on-surface-variant tracking-wider font-bold">Share These Credentials</p>

                {/* Username row */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-label-sm text-on-surface-variant">Username</p>
                    <p className="text-body-md text-on-surface font-mono">{createdUser.username}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(createdUser.username, 'username')}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container-high transition"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedField === 'username' ? 'check' : 'content_copy'}
                    </span>
                    {copiedField === 'username' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="h-px bg-outline-variant/20" />

                {/* Password row */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-label-sm text-on-surface-variant">Temporary Password</p>
                    <p className="text-body-md text-on-surface font-mono">{createdUser.plainPassword}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(createdUser.plainPassword, 'password')}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container-high transition"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedField === 'password' ? 'check' : 'content_copy'}
                    </span>
                    {copiedField === 'password' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="h-px bg-outline-variant/20" />

                {/* Role */}
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant/60 text-[16px]">shield_person</span>
                  <p className="text-label-sm text-on-surface-variant">
                    Role: <span className="text-on-surface font-bold capitalize">{createdUser.role}</span>
                  </p>
                </div>
              </div>

              <p className="text-label-sm text-on-surface-variant px-1">
                Make sure to share the password securely — it won't be shown again.
              </p>

              <button
                onClick={() => { setCreatedUser(null); setShowAddForm(false); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                Done
              </button>
            </div>
          )}
      </section>

      </>
      )}

      {isSpaceAdmin && (
      <>

            {/* Space Members — membership/role within the current space only */}
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">groups</span>
                <h2 className="text-headline-md text-on-background">
                  {currentSpace?.name ? `${currentSpace.name} Members` : 'Space Members'}
                </h2>
              </div>

              <ul className="space-y-2">
                {spaceMembers.map(m => {
                  const isSelf = m.id === user.id;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container">
                      <div
                        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-label-md font-bold flex-shrink-0"
                        style={{ backgroundColor: m.avatar_colour || '#6366f1' }}
                      >
                        {m.avatar_url
                          ? <img src={m.avatar_url} alt={m.display_name} className="w-full h-full object-cover" />
                          : m.display_name.slice(0, 1).toUpperCase()
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-md text-on-surface font-medium truncate">
                          {m.display_name}
                          {isSelf && <span className="ml-2 text-label-sm text-on-surface-variant font-normal">(you)</span>}
                        </p>
                        <p className="text-label-sm text-on-surface-variant">@{m.username}</p>
                      </div>
                      {isSelf ? (
                        <span className="px-2.5 py-1 rounded-full text-label-sm font-bold bg-primary/10 text-primary flex-shrink-0 capitalize">
                          {m.role}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => changeSpaceMemberRole.mutate({ userId: m.id, role: m.role === 'admin' ? 'member' : 'admin' })}
                            disabled={changeSpaceMemberRole.isPending}
                            title={m.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                            className={`px-2.5 py-1 rounded-full text-label-sm font-bold flex-shrink-0 capitalize transition disabled:opacity-40 ${
                              m.role === 'admin' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                            }`}
                          >
                            {m.role}
                          </button>
                          <button
                            title="Remove from space"
                            onClick={() => removeSpaceMember.mutate(m.id)}
                            disabled={removeSpaceMember.isPending}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-error transition disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined text-[18px]">person_remove</span>
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Join Requests */}
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">how_to_reg</span>
                <h2 className="text-headline-md text-on-background">Join Requests</h2>
                {joinRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-label-sm font-bold bg-primary/10 text-primary">
                    {joinRequests.length}
                  </span>
                )}
              </div>

              {joinRequests.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No pending requests.</p>
              ) : (
              <ul className="space-y-2">
                {joinRequests.map(r => {
                  const isDeciding = decideJoinRequest.isPending && decideJoinRequest.variables?.requestId === r.id;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container">
                      <div
                        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-label-md font-bold flex-shrink-0"
                        style={{ backgroundColor: r.avatar_colour || '#6366f1' }}
                      >
                        {r.avatar_url
                          ? <img src={r.avatar_url} alt={r.display_name} className="w-full h-full object-cover" />
                          : r.display_name.slice(0, 1).toUpperCase()
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-md text-on-surface font-medium truncate">{r.display_name}</p>
                        <p className="text-label-sm text-on-surface-variant">@{r.username}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => decideJoinRequest.mutate({ requestId: r.id, decision: 'approve' })}
                          disabled={decideJoinRequest.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          {isDeciding && decideJoinRequest.variables?.decision === 'approve' ? 'Approving…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decideJoinRequest.mutate({ requestId: r.id, decision: 'deny' })}
                          disabled={decideJoinRequest.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-sm font-bold border border-outline-variant text-on-surface-variant hover:bg-error-container hover:text-error hover:border-transparent transition disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          {isDeciding && decideJoinRequest.variables?.decision === 'deny' ? 'Denying…' : 'Deny'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              )}
            </section>

      </>
      )}

        </div>{/* ── end col 2 ── */}

        {/* ── Col 3: paperrAi Server · Ai Provider Config · Backups (global admin) ── */}
        {user?.role === 'admin' && (
          <div className="space-y-6">

      {user?.role === 'admin' && (
      <>

      {/* paperrAi Server */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">smart_toy</span>
          <h2 className="text-headline-md text-on-background">paperrAi Server</h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          A local, built-in AI model that runs on this machine and steps in automatically if no other AI provider is reachable.
        </p>
        <AiServerPanel />
      </section>

      {/* dotAi Settings */}
      <section
        id="ai-settings"
        ref={aiSectionRef}
        className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4"
      >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DotIcon size={20} color="currentColor" className="text-primary flex-shrink-0" />
              <h2 className="text-headline-md text-on-background">Ai Provider Config</h2>
            </div>
            <button
              onClick={openNewForm}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Config
            </button>
          </div>

          {/* Config cards */}
          {llmConfigs.length === 0 && (
            <p className="text-body-md text-on-surface-variant text-center py-4">No configurations yet.</p>
          )}
          <div className="space-y-2">
            {llmConfigs.map(cfg => (
              <div
                key={cfg.id}
                className={`rounded-xl border p-4 transition ${
                  cfg.is_active
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${cfg.is_active ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-body-md text-on-surface font-bold">{cfg.name}</p>
                        {!!cfg.is_active && (
                          <span className="text-label-sm text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-full">Active</span>
                        )}
                      </div>
                      <p className="text-label-sm text-on-surface-variant mt-0.5">{cfg.provider || 'Custom'} · <span className="font-mono">{cfg.model}</span></p>
                      <p className="text-label-sm text-on-surface-variant/60 font-mono truncate">{cfg.base_url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!cfg.is_active && (
                      <button
                        onClick={() => activateConfig.mutate(cfg.id)}
                        disabled={activateConfig.isPending}
                        className="px-3 py-1.5 rounded-full border border-outline-variant text-label-sm text-on-surface-variant hover:bg-surface-container font-bold transition disabled:opacity-40"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => openEditForm(cfg)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Test active config */}
          <div className="flex items-center gap-3 pt-1 border-t border-outline-variant/20">
            <button
              onClick={handleLlmTest}
              disabled={llmTesting}
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant rounded-full text-label-md font-bold hover:bg-surface-container transition disabled:opacity-40"
            >
              {llmTesting
                ? <><span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>Testing…</>
                : <><span className="material-symbols-outlined text-[15px]">wifi_tethering</span>Test Active Config</>
              }
            </button>
            {llmTestResult && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-sm font-medium ${
                llmTestResult.ok ? 'bg-primary/10 text-primary' : 'bg-error-container text-error'
              }`}>
                <span className="material-symbols-outlined text-[14px]">
                  {llmTestResult.ok ? 'check_circle' : 'error'}
                </span>
                {llmTestResult.message}
              </div>
            )}
          </div>

          {/* ── Edit / New form ── */}
          {showForm && (
            <div className="border-t border-outline-variant/20 pt-4 space-y-4">
              <p className="text-label-md font-bold text-on-surface-variant tracking-wider">
                {editingId ? 'Edit Configuration' : 'New Configuration'}
              </p>

              {/* Name */}
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setF('name', e.target.value)}
                  placeholder="e.g. Local Llama, Work GPT-4o…"
                  className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Provider preset */}
              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Provider</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.keys(PROVIDER_PRESETS).map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        setF('provider', p);
                        if (PROVIDER_PRESETS[p]) setF('base_url', PROVIDER_PRESETS[p]);
                        setAvailableModels([]);
                      }}
                      className={`px-4 py-2 rounded-full text-label-md font-bold transition border ${
                        form.provider === p
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Base URL</label>
                <input
                  type="text"
                  value={form.base_url}
                  onChange={e => { setF('base_url', e.target.value); setAvailableModels([]); }}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  API Key
                  <span className="ml-2 text-on-surface-variant/60 font-normal normal-case tracking-normal">
                    {form.provider === 'OpenRouter' ? '(required)' : '(optional)'}
                  </span>
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setF('api_key', e.target.value)}
                  placeholder={form.provider === 'OpenRouter' ? 'sk-or-...' : 'Leave blank for local servers'}
                  className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                />
              </div>

              {/* Model */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-label-md text-on-surface-variant">Model</label>
                  <button
                    onClick={handleLoadModels}
                    disabled={modelsLoading || !form.base_url.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-label-sm text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40 font-bold"
                  >
                    {modelsLoading
                      ? <><span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>Loading…</>
                      : <><span className="material-symbols-outlined text-[13px]">refresh</span>Load Models</>
                    }
                  </button>
                </div>
                <input
                  type="text"
                  value={form.model}
                  onChange={e => setF('model', e.target.value)}
                  placeholder="llama3"
                  className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                />
                {modelsError && <p className="text-label-sm text-error mt-1.5 px-1">{modelsError}</p>}
                {availableModels.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {availableModels.map(m => (
                      <button
                        key={m}
                        onClick={() => setF('model', m)}
                        className={`px-3 py-1.5 rounded-full text-label-sm font-bold transition border ${
                          form.model === m
                            ? 'bg-primary text-on-primary border-primary'
                            : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Advanced Settings (Parameters) */}
              <div className="pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-label-md text-on-surface-variant font-bold tracking-wider hover:text-primary transition"
                >
                  <span className={`material-symbols-outlined text-[18px] transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
                    chevron_right
                  </span>
                  Advanced Settings
                </button>

                {showAdvanced && (
                <div className="space-y-4 pt-4">

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-label-md text-on-surface-variant">Temperature</label>
                    <span className="text-label-md font-mono font-bold text-on-surface">{Number(form.temperature).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={form.temperature}
                    onChange={e => setF('temperature', parseFloat(e.target.value))} className="w-full accent-primary" />
                  <p className="text-label-sm text-on-surface-variant/60 mt-0.5">0 = deterministic · 2 = very random</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-label-md text-on-surface-variant">Top P</label>
                    <span className="text-label-md font-mono font-bold text-on-surface">{Number(form.top_p).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={form.top_p}
                    onChange={e => setF('top_p', parseFloat(e.target.value))} className="w-full accent-primary" />
                  <p className="text-label-sm text-on-surface-variant/60 mt-0.5">Nucleus sampling — 1.0 = disabled</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Max Tokens</label>
                    <input type="number" min="64" max="32768" step="64" value={form.max_tokens}
                      onChange={e => setF('max_tokens', parseInt(e.target.value))}
                      className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono" />
                    <p className="text-label-sm text-on-surface-variant/60 mt-0.5">Max response length</p>
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Context Window</label>
                    <input type="number" min="512" max="131072" step="512" value={form.context_window}
                      onChange={e => setF('context_window', parseInt(e.target.value))}
                      className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono" />
                    <p className="text-label-sm text-on-surface-variant/60 mt-0.5">num_ctx (Ollama)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-label-md text-on-surface-variant">Freq. Penalty</label>
                      <span className="text-label-md font-mono font-bold text-on-surface">{Number(form.frequency_penalty).toFixed(2)}</span>
                    </div>
                    <input type="range" min="-2" max="2" step="0.05" value={form.frequency_penalty}
                      onChange={e => setF('frequency_penalty', parseFloat(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-label-md text-on-surface-variant">Pres. Penalty</label>
                      <span className="text-label-md font-mono font-bold text-on-surface">{Number(form.presence_penalty).toFixed(2)}</span>
                    </div>
                    <input type="range" min="-2" max="2" step="0.05" value={form.presence_penalty}
                      onChange={e => setF('presence_penalty', parseFloat(e.target.value))} className="w-full accent-primary" />
                  </div>
                </div>

                </div>
                )}
              </div>

              {/* Form actions */}
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  onClick={() => saveConfig.mutate()}
                  disabled={saveConfig.isPending || !form.name.trim() || !form.model.trim()}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {configSaved
                    ? <><span className="material-symbols-outlined text-[16px]">check</span>Saved!</>
                    : saveConfig.isPending ? 'Saving…'
                    : editingId ? 'Update' : 'Save Configuration'
                  }
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-outline-variant text-on-surface-variant rounded-full text-label-md font-bold hover:bg-surface-container transition"
                >
                  Cancel
                </button>
                {editingId && llmConfigs.length > 1 && (
                  <button
                    onClick={() => deleteConfig.mutate(editingId)}
                    disabled={deleteConfig.isPending}
                    className="ml-auto flex items-center gap-2 px-4 py-2.5 border border-error text-error rounded-full text-label-md font-bold hover:bg-error-container transition disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
      </section>

      {/* Backups */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-card-padding space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">backup</span>
          <h2 className="text-headline-md text-on-background">Backups</h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          Create manual or scheduled backups of the household database, and restore from a previous backup if needed.
        </p>
        <button
          onClick={() => setShowBackupModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition"
        >
          <span className="material-symbols-outlined text-[16px]">backup</span>
          Manage Backups
        </button>
      </section>

      </>
      )}

          </div>
        )}

      </div>{/* ── end grid ── */}

      {showBackupModal && <BackupModal onClose={() => setShowBackupModal(false)} />}
    </div>
  );
}
