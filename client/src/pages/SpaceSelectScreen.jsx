import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSpaceStore } from '../store/spaceStore';
import { useAuthStore } from '../store/authStore';
import { useAuth } from '../auth/AuthContext';
import CreateSpaceModal from './CreateSpaceModal';
import Logo from '../components/Logo';

export default function SpaceSelectScreen() {
  const { spaces, switchSpace } = useSpaceStore();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);

  // Auto-select if only one space — skipped while the create modal is open so a
  // just-created first space doesn't yank the user to '/' before they see its
  // apps setup step; handleSpaceCreated below does that navigation itself once
  // that step finishes.
  useEffect(() => {
    if (spaces.length === 1 && !showCreate) {
      switchSpace(spaces[0].id);
      navigate('/', { replace: true });
    }
  }, [spaces, showCreate]);

  const handleSelect = (space) => {
    switchSpace(space.id);
    queryClient.clear();
    navigate('/', { replace: true });
  };

  const handleSpaceCreated = (space) => {
    switchSpace(space.id);
    queryClient.clear();
    setShowCreate(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <Logo size="md" className="mb-6" />
          {user && (
            <p className="text-body-md text-on-surface-variant">
              Welcome back, <span className="text-on-surface font-medium">{user.display_name}</span>
            </p>
          )}
          <h1 className="text-headline-md text-on-surface font-semibold mt-1">Choose a space</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">Select the space you want to work in</p>
        </div>

        {/* Space cards */}
        {spaces.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {spaces.map(space => (
              <div
                key={space.id}
                className="flex items-center gap-4 p-5 bg-surface-container rounded-2xl border border-outline-variant/20 hover:border-primary/40 hover:bg-primary/5 transition-all group"
              >
                <button
                  onClick={() => handleSelect(space)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                >
                  <span className="text-4xl flex-shrink-0">{space.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-title-md font-semibold text-on-surface truncate">{space.name}</p>
                    <p className="text-body-sm text-on-surface-variant capitalize">{space.type}</p>
                    {space.member_count != null && (
                      <p className="text-label-sm text-on-surface-variant/60 mt-0.5">
                        {space.member_count} {space.member_count === 1 ? 'member' : 'members'}
                      </p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-primary transition-colors">
                    chevron_right
                  </span>
                </button>
                <button
                  onClick={() => setEditingSpace(space)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant/40 hover:text-on-surface transition-colors flex-shrink-0"
                  aria-label="Edit space"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>
            ))}

            {/* Create new space card */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-4 p-5 bg-surface-container rounded-2xl border border-dashed border-outline-variant/40 hover:border-primary/60 hover:bg-primary/5 transition-all text-left group"
            >
              <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">add</span>
              </span>
              <div>
                <p className="text-title-sm font-medium text-on-surface">Create new space</p>
                <p className="text-body-sm text-on-surface-variant">Family or Team</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 mb-6 py-10">
            <span className="text-5xl">🏠</span>
            <p className="text-body-md text-on-surface-variant text-center">
              You are not part of any space yet.<br />Create one to get started.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full font-medium text-body-md hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Create your first space
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-center items-center gap-6">
          <button
            onClick={() => navigate('/browse-spaces')}
            className="text-label-md text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">explore</span>
            Browse spaces to join
          </button>
          <button
            onClick={logout}
            className="text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreated={handleSpaceCreated}
        />
      )}

      {editingSpace && (
        <CreateSpaceModal
          space={editingSpace}
          onClose={() => setEditingSpace(null)}
          onUpdated={() => setEditingSpace(null)}
          onDeleted={() => setEditingSpace(null)}
        />
      )}
    </div>
  );
}
