import { useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { AuthContext, type BillingStatus, getLevel } from './AuthContext';
import {
  clearLocalAccessToken,
  getLocalAccessToken,
  isLocalApiEnabled,
  localApiJson,
  loginLocal,
  LocalAuthResponse,
  LocalAuthUser,
  LocalProfile,
  registerLocal,
  setLocalAccessToken,
} from '@/lib/localApi';

const ensurePermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
};

const LOCAL_SESSION_KEY = 'cadam_local_session';

function toLocalSession(auth: LocalAuthResponse): Session {
  return {
    access_token: auth.access_token,
    token_type: auth.token_type,
    expires_in: 60 * 60 * 24 * 7,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    refresh_token: '',
    user: toSupabaseUser(auth.user, auth.profile),
  } as Session;
}

function toSupabaseUser(user: LocalAuthUser, profile?: LocalProfile): User {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.username,
    email_confirmed_at: user.created_at,
    phone: '',
    confirmed_at: user.created_at,
    last_sign_in_at: user.updated_at,
    app_metadata: {},
    user_metadata: {
      username: user.username,
      full_name: profile?.full_name,
    },
    identities: [],
    created_at: user.created_at,
    updated_at: user.updated_at,
    is_anonymous: false,
  } as User;
}

function persistLocalAuth(auth: LocalAuthResponse) {
  const session = toLocalSession(auth);
  setLocalAccessToken(auth.access_token);
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  return session;
}

function readStoredSession() {
  const key = isLocalApiEnabled ? LOCAL_SESSION_KEY : 'session';
  const rawSession = localStorage.getItem(key);
  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession) as Session | null;
  } catch {
    localStorage.removeItem(key);
    if (isLocalApiEnabled) clearLocalAccessToken();
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStoredSession);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const posthogSent = useRef(false);
  const queryClient = useQueryClient();

  // Initialize auth state and set up session listener
  useEffect(() => {
    if (isLocalApiEnabled) {
      const initializeLocalAuth = async () => {
        const token = getLocalAccessToken();
        if (!token) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }

        try {
          const [localUser, localProfile] = await Promise.all([
            localApiJson<LocalAuthUser>('/api/v1/auth/me'),
            localApiJson<LocalProfile>('/api/v1/profile'),
          ]);
          const localSession = {
            access_token: token,
            token_type: 'bearer',
            expires_in: 60 * 60 * 24 * 7,
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
            refresh_token: '',
            user: toSupabaseUser(localUser, localProfile),
          } as Session;
          setSession(localSession);
          setUser(localSession.user);
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(localSession));
        } catch {
          clearLocalAccessToken();
          localStorage.removeItem(LOCAL_SESSION_KEY);
          setSession(null);
          setUser(null);
        } finally {
          setIsLoading(false);
        }
      };

      void initializeLocalAuth();
      return;
    }

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.refreshSession();
        setSession(session);
        localStorage.setItem('session', JSON.stringify(session));
        setUser(session?.user ?? null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      localStorage.setItem('session', JSON.stringify(session));
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/update-password');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Poll billing-status for subscription state + token balances. In the
  // self-hosted build this returns unlimited local credits.
  const { data: billing, isLoading: isBillingLoading } = useQuery({
    queryKey: ['billing', 'status'],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async (): Promise<BillingStatus> => {
      if (isLocalApiEnabled) {
        return localApiJson<BillingStatus>('/api/v1/billing/status');
      }
      const { data, error } = await supabase.functions.invoke('billing-status');
      if (error) throw error;
      return data as BillingStatus;
    },
  });

  // Fetch user's profile data directly (avoiding circular dependency)
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (isLocalApiEnabled) {
        return localApiJson<LocalProfile>('/api/v1/profile');
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id || '')
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Initialize notifications preference once on first render after profile loads
  useEffect(() => {
    if (profile?.notifications_enabled) void ensurePermission();
  }, [profile?.notifications_enabled]);

  // Set up real-time subscription for meshes table to update meshData immediately and notify the user
  useEffect(() => {
    if (!user || isLocalApiEnabled) {
      return;
    }

    // Supabase realtime
    const channel = supabase
      .channel(`mesh-updates-${user.id}`)
      .on(
        'broadcast',
        {
          event: 'mesh-updated',
        },
        async ({ payload }) => {
          if (payload.kind === 'mesh') {
            queryClient.invalidateQueries({
              queryKey: ['meshData', payload.id],
            });
            queryClient.invalidateQueries({ queryKey: ['mesh', payload.id] });
            queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });

            if (
              payload.status === 'success' &&
              profile?.notifications_enabled &&
              !window.location.pathname.includes(
                `/editor/${payload.conversation_id}`,
              )
            ) {
              if (await ensurePermission()) {
                const notification = new Notification('3D model is ready', {
                  body: 'Your generated 3D model has finished. Click to open.',
                  icon: `${import.meta.env.BASE_URL}/Adam-Logo.png`,
                });
                notification.onclick = () => {
                  window.focus();
                  navigate(`/editor/${payload.conversation_id}`);
                  notification.close();
                };
              }
            }
          }

          if (payload.kind === 'preview') {
            queryClient.invalidateQueries({
              queryKey: ['preview', payload.id],
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, navigate, profile?.notifications_enabled]);

  // Track user in PostHog once we have all their data
  useEffect(() => {
    if (
      user &&
      !posthogSent.current &&
      !isBillingLoading &&
      !isProfileLoading
    ) {
      posthog.identify(user.id, {
        email: user.email,
        full_name: profile?.full_name,
        subscription: getLevel(billing),
        has_trialed: billing?.user.hasTrialed ?? false,
      });
      posthogSent.current = true;
    }
  }, [user, isBillingLoading, billing, profile, isProfileLoading]);

  const signIn = async (email: string, password: string) => {
    if (isLocalApiEnabled) {
      const localAuth = await loginLocal(email, password);
      const localSession = persistLocalAuth(localAuth);
      setSession(localSession);
      setUser(localSession.user);
      queryClient.invalidateQueries();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (isLocalApiEnabled) {
      const localAuth = await registerLocal(email, password, name);
      const localSession = persistLocalAuth(localAuth);
      setSession(localSession);
      setUser(localSession.user);
      queryClient.invalidateQueries();
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError) throw signUpError;
  };

  const signOut = async () => {
    if (isLocalApiEnabled) {
      clearLocalAccessToken();
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setSession(null);
      setUser(null);
      queryClient.clear();
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signInWithMagicLink = async (email: string) => {
    if (isLocalApiEnabled) {
      throw new Error('Magic link sign-in is not available in local mode.');
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  };

  const verifyOtp = async (email: string, token: string) => {
    if (isLocalApiEnabled) {
      throw new Error('OTP verification is not available in local mode.');
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    if (isLocalApiEnabled) {
      throw new Error('Password reset email is not available in local mode.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    if (isLocalApiEnabled) {
      throw new Error('Password updates are not implemented in local mode yet.');
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        billing: billing ?? null,
        isLoading:
          isLoading || (!!user && (isBillingLoading || isProfileLoading)),
        signIn,
        signUp,
        signInWithMagicLink,
        verifyOtp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
