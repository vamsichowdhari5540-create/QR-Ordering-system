// Where each staff role lands after login, and where it gets bounced back to
// if it ends up on a screen that isn't its own.
export function roleHome(role) {
  if (role === 'SERVER') return '/server';
  if (role === 'KITCHEN') return '/kitchen';
  return '/admin/dashboard';
}
