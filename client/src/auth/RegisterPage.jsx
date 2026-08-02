import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, api } from './AuthContext';
import Logo from '../components/Logo';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [wantsPin, setWantsPin] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (wantsPin) {
      if (!/^\d{6}$/.test(pin)) {
        setError('PIN must be exactly 6 digits');
        return;
      }
      if (pin !== confirmPin) {
        setError('PINs do not match');
        return;
      }
    }

    setLoading(true);
    try {
      const data = await register(displayName, username, password, wantsPin ? pin : undefined);

      if (avatarFile) {
        try {
          const form = new FormData();
          form.append('avatar', avatarFile);
          await api.post(`/users/${data.user.id}/avatar`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // Account creation already succeeded — avatar can be added later from Settings.
        }
      }

      navigate('/browse-spaces');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-low flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" className="mb-3" />
          <p className="text-body-lg font-light tracking-wide text-on-surface-variant">
            Your life on paperr. Private by default.
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-8">
          <h2 className="text-headline-md font-light tracking-wide text-on-background mb-6">
            Create an account
          </h2>

          {error && (
            <div className="bg-error-container text-error rounded-full px-4 py-3 mb-4 text-label-md font-light flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Avatar upload */}
            <div className="flex flex-col items-center mb-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border-2 border-dashed border-outline-variant/40 hover:border-primary/60 transition-colors group"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-on-surface-variant/40 text-[32px]">person</span>
                )}
                <span className="absolute inset-0 bg-inverse-surface/0 group-hover:bg-inverse-surface/20 transition-colors flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">
                    photo_camera
                  </span>
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <p className="text-label-sm text-on-surface-variant mt-2">
                {avatarPreview ? 'Change photo' : 'Add a photo (optional)'}
              </p>
            </div>

            <div>
              <label className="block text-label-md font-light tracking-wide text-on-surface-variant mb-1.5">
                Display name
              </label>
              <div className="relative bg-surface-container rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px]">badge</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50"
                  placeholder="Jane Doe"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-label-md font-light tracking-wide text-on-surface-variant mb-1.5">
                Username
              </label>
              <div className="relative bg-surface-container rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px]">person</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50"
                  placeholder="your username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-label-md font-light tracking-wide text-on-surface-variant mb-1.5">
                Password
              </label>
              <div className="relative bg-surface-container rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px]">lock</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-label-md font-light tracking-wide text-on-surface-variant mb-1.5">
                Confirm password
              </label>
              <div className="relative bg-surface-container rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px]">lock</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            {/* PIN — optional quick sign-in */}
            <div className="bg-surface-container rounded-2xl px-4 py-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-label-md font-light tracking-wide text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">dialpad</span>
                  Set up a PIN for quick sign-in
                </span>
                <input
                  type="checkbox"
                  checked={wantsPin}
                  onChange={(e) => { setWantsPin(e.target.checked); setPin(''); setConfirmPin(''); }}
                  className="w-4 h-4 accent-primary"
                />
              </label>

              {wantsPin && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit PIN"
                    className="w-full px-4 h-11 rounded-full bg-surface-container-high text-body-md text-on-surface placeholder:text-on-surface-variant/50 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Confirm PIN"
                    className="w-full px-4 h-11 rounded-full bg-surface-container-high text-body-md text-on-surface placeholder:text-on-surface-variant/50 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary text-on-primary rounded-full text-label-md font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">person_add</span>
              )}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-label-md text-on-surface-variant mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-label-sm font-light tracking-wide text-on-surface-variant mt-6">
          paperr · Local Network Only
        </p>

      </div>
    </div>
  );
}
