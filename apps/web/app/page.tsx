'use client';

import { useEffect, useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type AuthMeResponse = {
  isAuthenticated: boolean;
  user?: {
    name?: string;
    email?: string;
  };
};

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  function getAuthorizationHeaders(token: string): HeadersInit {
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`
    };
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem('accessToken') ?? '';
    setAccessToken(storedToken);

    async function loadAuthState(): Promise<void> {
      if (!storedToken) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: getAuthorizationHeaders(storedToken)
        });
        const data = (await response.json()) as AuthMeResponse;
        if (!response.ok) {
          setIsAuthenticated(false);
          return;
        }
        setIsAuthenticated(Boolean(data.isAuthenticated));
      } catch {
        setIsAuthenticated(false);
      }
    }

    void loadAuthState();
  }, []);

  function handleLoginRedirect(): void {
    window.location.href = `${API_BASE_URL}/auth/login`;
  }

  async function handleLogout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthorizationHeaders(accessToken)
      });
    } finally {
      window.localStorage.removeItem('accessToken');
      setIsAuthenticated(false);
      window.location.reload();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-8">
      <h1 className="mb-2 text-3xl font-semibold text-slate-900">Smartify</h1>
      <p className="mb-6 text-slate-600">Local-first music intelligence for your Spotify library.</p>
      <div className="flex gap-3">
        {!isAuthenticated ? (
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={handleLoginRedirect}
            type="button"
          >
            Login with Spotify
          </button>
        ) : (
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => {
              void handleLogout();
            }}
            type="button"
          >
            Logout
          </button>
        )}
        <a
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          href="/dashboard"
        >
          Go to Dashboard
        </a>
      </div>
    </main>
  );
}
