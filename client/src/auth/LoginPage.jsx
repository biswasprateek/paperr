import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Logo from '../components/Logo';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('password'); // 'password' | 'pin'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef(null);

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setPassword('');
    setPin('');
    setError('');
  }

  useEffect(() => {
    if (mode === 'pin') pinInputRef.current?.focus();
  }, [mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  async function submitPin(value) {
    if (!username.trim()) {
      setError('Enter your username first');
      setPin('');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username, undefined, value);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function setPinValue(next) {
    const digits = next.replace(/\D/g, '').slice(0, 6);
    setError('');
    setPin(digits);
    if (digits.length === 6) submitPin(digits);
  }

  function handlePinDigit(d) {
    if (loading || pin.length >= 6) return;
    setPinValue(pin + d);
  }

  function handleBackspace() {
    if (loading) return;
    setPinValue(pin.slice(0, -1));
  }

  return (
    <div className="min-h-screen bg-surface-container-low flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" className="mb-3" />
          <p className="text-body-lg font-light tracking-wide text-on-surface-variant">
            Your life on paperr. Private by default.
          </p>
        </div>

        {/* Login card */}
        <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-8">
          <h2 className="text-headline-md font-light tracking-wide text-on-background mb-6">
            Welcome back
          </h2>

          {/* Mode toggle */}
          <div className="flex gap-1 mb-6 bg-surface-container rounded-full p-1">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={`flex-1 py-2 rounded-full text-label-md font-bold transition ${
                mode === 'password' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => switchMode('pin')}
              className={`flex-1 py-2 rounded-full text-label-md font-bold transition ${
                mode === 'pin' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              PIN
            </button>
          </div>

          {error && (
            <div className="bg-error-container text-error rounded-full px-4 py-3 mb-4 text-label-md font-light flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {/* Username — shared by both modes */}
          <div className="mb-4">
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

          {mode === 'password' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-primary text-on-primary rounded-full text-label-md font-bold tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">login</span>
                )}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-label-md font-light tracking-wide text-on-surface-variant mb-3 text-center">
                  Enter your PIN
                </label>
                <div
                  className="relative flex justify-center gap-3 cursor-text"
                  onClick={() => pinInputRef.current?.focus()}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                        i < pin.length ? 'bg-primary border-primary' : 'border-outline-variant bg-transparent'
                      }`}
                    />
                  ))}
                  <input
                    ref={pinInputRef}
                    type="tel"
                    inputMode="numeric"
                    pattern="\d*"
                    autoComplete="one-time-code"
                    value={pin}
                    onChange={(e) => setPinValue(e.target.value)}
                    disabled={loading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                    aria-label="PIN"
                  />
                </div>
              </div>

              {/* On-screen keypad */}
              <div className="grid grid-cols-3 gap-3">
                {KEYPAD.map((k, i) => {
                  if (k === '') return <div key={i} />;
                  if (k === 'back') {
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={handleBackspace}
                        disabled={loading || pin.length === 0}
                        className="h-14 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[22px]">backspace</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePinDigit(k)}
                      disabled={loading}
                      className="h-14 rounded-2xl bg-surface-container text-headline-md font-light text-on-surface hover:bg-surface-container-high active:scale-95 transition disabled:opacity-40"
                    >
                      {k}
                    </button>
                  );
                })}
              </div>

              {loading && (
                <p className="text-center text-label-md text-on-surface-variant flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                  Signing in...
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-5 border-t border-outline-variant/20">
            <Link
              to="/register"
              className="text-label-md text-primary font-bold hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Create account
            </Link>
            <Link
              to="/browse-spaces"
              className="text-label-md text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">explore</span>
              Browse spaces
            </Link>
          </div>
        </div>

        <p className="text-center text-label-sm font-light tracking-wide text-on-surface-variant mt-6">
          paperr · Local Network Only
        </p>

      </div>
    </div>
  );
}
