import React from 'react';

// Small circular avatar — image if present, else coloured initials.
export default function UserAvatar({ user, size = 'w-8 h-8' }) {
  const displayLabel = user.nickname || user.display_name;
  const initials = displayLabel
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={displayLabel}
        className={`${size} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white text-label-sm font-bold`}
      style={{ backgroundColor: user.avatar_colour || '#6366f1' }}
    >
      {initials}
    </div>
  );
}
