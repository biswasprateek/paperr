import React, { useState, useRef } from 'react';
import { api } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import AppsSetupStep from '../components/AppsSetupStep';

const STEPS = ['Your Space', 'Admin Account', 'Set Up Apps'];

const SPACE_TYPES = [
  { value: 'family', icon: '🏠', label: 'Family', description: 'For households and personal use' },
  { value: 'team',   icon: '💼', label: 'Team',   description: 'For work groups and organisations' },
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [spaceName, setSpaceName] = useState('');
  const [spaceType, setSpaceType] = useState('family');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarInputRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleAvatarSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  const defaultSpaceName = spaceType === 'team' ? 'My Team' : 'Our Home';

  const handleSetup = async () => {
    setError('');
    if (pin || confirmPin) {
      if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits'); return; }
      if (pin !== confirmPin) { setError('PINs do not match'); return; }
    }
    setLoading(true);
    try {
      await api.post('/auth/setup', {
        householdName: spaceName.trim() || defaultSpaceName,
        spaceType,
        adminDisplayName,
        adminUsername,
        adminPassword,
        pin: pin || undefined,
      });
      const data = await login(adminUsername, adminPassword);
      if (avatarFile && data?.user?.id) {
        try {
          const form = new FormData();
          form.append('avatar', avatarFile);
          const { data: updated } = await api.post(`/users/${data.user.id}/avatar`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          useAuthStore.getState().setUser({ ...data.user, ...updated }, null);
        } catch {
          // Non-fatal — setup already succeeded; the photo can be added later from Settings.
        }
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" className="mb-3" />
          <p className="text-body-lg font-light tracking-wide text-on-surface-variant">
            Your life on paperr. Private by default.
          </p>
          <p className="text-headline-md text-on-background mt-3">Let's make paperr yours.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-label-sm ${i === step ? 'text-primary font-bold' : i < step ? 'text-on-surface-variant' : 'text-on-surface-variant/40'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-label-sm font-bold ${i === step ? 'bg-primary text-on-primary' : i < step ? 'bg-surface-variant text-on-surface-variant' : 'bg-surface-container text-on-surface-variant/40'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                {s}
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-outline-variant/30 max-w-8" />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-heavy border border-outline-variant/20 p-8">
          {error && (
            <div className="bg-error-container text-error rounded-lg p-3 mb-4 text-label-md flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-headline-md text-on-background">Create your first space</h2>
                <p className="text-body-md text-on-surface-variant mt-1">Choose a type and give it a name.</p>
              </div>

              {/* Type selector */}
              <div className="grid grid-cols-2 gap-3">
                {SPACE_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSpaceType(t.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-center ${
                      spaceType === t.value
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/40 hover:border-outline-variant'
                    }`}
                  >
                    <span className="text-3xl">{t.icon}</span>
                    <span className="text-label-md font-semibold text-on-surface">{t.label}</span>
                    <span className="text-label-sm text-on-surface-variant">{t.description}</span>
                  </button>
                ))}
              </div>

              {/* Name input */}
              <input
                type="text"
                value={spaceName}
                onChange={e => setSpaceName(e.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder={defaultSpaceName}
              />

              <button
                onClick={() => setStep(1)}
                className="w-full bg-primary text-on-primary rounded-full py-3 text-label-md font-bold tracking-wider hover:bg-primary/90 transition"
              >
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-headline-md text-on-background">Create admin account</h2>
                <p className="text-body-md text-on-surface-variant mt-1">This will be the space admin.</p>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-surface-container text-on-surface-variant/40">
                    {avatarPreview
                      ? <img src={avatarPreview} alt="avatar preview" className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined text-[28px]">person</span>
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition"
                    title="Add a photo"
                  >
                    <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                </div>
                <div>
                  <p className="text-label-md text-on-surface font-medium">Profile photo</p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-label-sm text-primary hover:underline"
                  >
                    {avatarPreview ? 'Change photo' : 'Add a photo (optional)'}
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={adminDisplayName}
                onChange={e => setAdminDisplayName(e.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Your name (e.g. Alex)"
              />
              <input
                type="text"
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Username (e.g. alex)"
              />
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Password (min. 8 characters)"
              />

              {/* PIN */}
              <div className="pt-2 border-t border-outline-variant/20 space-y-2">
                <div>
                  <p className="text-label-md text-on-surface font-medium">
                    Set a 6-digit PIN <span className="text-on-surface-variant font-normal">(optional)</span>
                  </p>
                  <p className="text-label-sm text-on-surface-variant mt-0.5">
                    A quick way to unlock paperr without typing your password. You can add or change this anytime in Settings.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono tracking-widest text-center"
                    placeholder="PIN"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={confirmPin}
                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono tracking-widest text-center"
                    placeholder="Confirm"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="flex-1 border border-outline-variant rounded-full py-3 text-label-md font-bold text-on-surface-variant hover:bg-surface-container transition"
                >
                  Back
                </button>
                <button
                  onClick={handleSetup}
                  disabled={!adminDisplayName || !adminUsername || adminPassword.length < 8 || loading}
                  className="flex-1 bg-primary text-on-primary rounded-full py-3 text-label-md font-bold tracking-wider hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
                  {loading ? 'Setting up...' : 'Finish Setup'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <AppsSetupStep
              mode="initial"
              doneLabel="Finish Setup"
              onDone={() => { onComplete(); navigate('/'); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
