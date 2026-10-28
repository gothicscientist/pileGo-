import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { shareSessionWithExtension } from './extension';
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
      shareSessionWithExtension(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
      shareSessionWithExtension(session);
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
