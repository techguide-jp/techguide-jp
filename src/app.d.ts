declare global {
  namespace App {
    interface Locals {
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
