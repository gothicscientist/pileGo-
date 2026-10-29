import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setExtensionUser } from './extension';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState({ session: data.session, loading: false });
      setExtensionUser(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
      setExtensionUser(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId needs a signed-in user');
  return session.user.id;
}

/** Accounts that have finished the first-run quiz carry this on their auth profile. */
export function isOnboarded(session: Session | null): boolean {
  return Boolean(session?.user.user_metadata?.onboarded);
}

export async function markOnboarded(): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { onboarded: true } });
  if (error) throw error;
}
