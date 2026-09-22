export const load = async ({ locals }) => {
  return {
    user: locals.user,
    localImpersonationAvailable: locals.localImpersonationAvailable,
    localImpersonation: locals.localImpersonation,
  };
};
