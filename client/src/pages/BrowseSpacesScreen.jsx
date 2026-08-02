import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useSpaceStore } from '../store/spaceStore';
import Logo from '../components/Logo';
import CreateSpaceModal from './CreateSpaceModal';

// Shown both to signed-out visitors (from the login screen) and to signed-in
// users who want to join a space they don't yet belong to.
export default function BrowseSpacesScreen() {
  const { user } = useAuthStore();
  const { spaces: mySpaces, switchSpace } = useSpaceStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [requestedId, setRequestedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ['spaces', 'discoverable'],
    queryFn: () => api.get('/spaces/discoverable').then(r => r.data),
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: ['spaces', 'join-requests', 'mine'],
    queryFn: () => api.get('/spaces/join-requests/mine').then(r => r.data),
    enabled: !!user,
  });

  const requestToJoin = useMutation({
    mutationFn: (spaceId) => api.post(`/spaces/${spaceId}/join-requests`),
    onSuccess: (_res, spaceId) => {
      setRequestedId(spaceId);
      qc.invalidateQueries({ queryKey: ['spaces', 'join-requests', 'mine'] });
    },
  });

  const myRoleBySpace = useMemo(() => {
    const map = {};
    for (const s of mySpaces) map[s.id] = s.my_role;
    return map;
  }, [mySpaces]);

  const latestRequestBySpace = useMemo(() => {
    const map = {};
    for (const r of myRequests) {
      if (!map[r.space_id]) map[r.space_id] = r; // already ordered newest-first
    }
    return map;
  }, [myRequests]);

  function handleRequestToJoin(spaceId) {
    if (!user) {
      navigate('/register');
      return;
    }
    requestToJoin.mutate(spaceId);
  }

  function handleCreateClick() {
    if (!user) {
      navigate('/register');
      return;
    }
    setShowCreate(true);
  }

  function handleSpaceCreated(space) {
    switchSpace(space.id);
    qc.clear();
    setShowCreate(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface-container-low flex flex-col items-center p-6">
      <div className="w-full max-w-2xl">

        <div className="flex flex-col items-center mb-10 mt-6">
          <Logo size="md" className="mb-3" />
          <h1 className="text-headline-md text-on-background font-light tracking-wide mt-2">Available spaces</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">Find a space and request to join it</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : spaces.length === 0 ? (
          <p className="text-center text-body-md text-on-surface-variant py-16">No spaces to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {spaces.map(space => {
              const myRole = myRoleBySpace[space.id];
              const isMember = myRole != null;
              const request = latestRequestBySpace[space.id];
              const justRequested = requestedId === space.id;
              const isPending = isMember ? false : (justRequested || request?.status === 'pending');

              return (
                <div
                  key={space.id}
                  className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/20"
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

                  {isMember ? (
                    <span className="px-3 py-1.5 rounded-full text-label-sm font-bold bg-surface-container text-on-surface-variant flex-shrink-0 capitalize">
                      {myRole}
                    </span>
                  ) : isPending ? (
                    <span className="px-3 py-1.5 rounded-full text-label-sm font-bold bg-primary/10 text-primary flex-shrink-0">
                      Requested
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRequestToJoin(space.id)}
                      disabled={requestToJoin.isPending}
                      className="px-4 py-1.5 rounded-full text-label-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-60 flex-shrink-0"
                    >
                      Request to join
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-center mb-6">
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-3 px-5 py-3 bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/40 hover:border-primary/60 hover:bg-primary/5 transition-all text-left group"
          >
            <span className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">add</span>
            </span>
            <div>
              <p className="text-title-sm font-medium text-on-surface">Create new space</p>
              <p className="text-body-sm text-on-surface-variant">Family or Team</p>
            </div>
          </button>
        </div>

        <div className="flex justify-center gap-6 mt-4">
          {user ? (
            <button
              onClick={() => navigate('/select-space')}
              className="text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Back to my spaces
            </button>
          ) : (
            <>
              <Link to="/login" className="text-label-md text-on-surface-variant hover:text-on-surface transition-colors">
                Sign in
              </Link>
              <Link to="/register" className="text-label-md text-primary font-bold hover:underline">
                Create account
              </Link>
            </>
          )}
        </div>

      </div>

      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreated={handleSpaceCreated}
        />
      )}
    </div>
  );
}
