declare global {
  namespace App {
    interface Locals {
      authenticatedUser: import("$lib/server/auth/session").SessionUser | null;
      localImpersonationAvailable: boolean;
      localImpersonation: { adminLogin: string; targetLogin: string } | null;
      user: {
        login: string;
        name: string | null;
        avatarUrl: string | null;
        isAdmin: boolean;
      } | null;
    }
  }
}

export {};
