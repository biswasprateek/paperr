import { useEffect, useState } from 'react';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';

const RELEASE_NOTES_URL = 'https://github.com/biswasprateek/paperr/blob/main/RELEASE_NOTES.md';
const DISMISS_KEY = 'paperr:dismissed-update';

// App-level driver mounted once (mirrors <CelebrationEngine/>) — reads the
// git check the server already ran once at boot and nudges toward the
// release notes when this install is behind. Dismissing sticks per commit
// SHA in localStorage, so it doesn't nag again until the next update lands.
// Admin-only: only an admin can act on an update (Settings → Updates), so
// only an admin is told one exists. Same gate as /api/admin/update/cached.
export default function UpdateToast() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/admin/update/cached').then(({ data }) => setInfo(data)).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin || !info?.updateAvailable || dismissed || localStorage.getItem(DISMISS_KEY) === info.latest) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[110] max-w-xs bg-surface-container-lowest border border-outline-variant/20 shadow-heavy rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">system_update_alt</span>
          <p className="text-label-md font-bold text-on-background">Update available</p>
        </div>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, info.latest); setDismissed(true); }}
          className="text-on-surface-variant hover:text-on-background"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <p className="text-body-sm text-on-surface-variant">{info.message}</p>
      <a
        href={RELEASE_NOTES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-label-sm font-bold text-primary hover:underline"
      >
        Release notes
        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
      </a>
    </div>
  );
}
