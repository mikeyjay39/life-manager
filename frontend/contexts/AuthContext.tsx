import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_BASE_URL } from '@/constants/config';
import { getStoredToken, setStoredToken, clearStoredToken } from '@/lib/auth/storage';

type AuthContextType = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

type LoginResult = {
  success: boolean;
  error?: string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreToken = async () => {
      try {
        const storedToken = await getStoredToken();
        if (storedToken) {
          setToken(storedToken);
        }
      } catch (error) {
        console.error('Failed to restore token:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreToken();
  }, []);

  const login = async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid username or password',
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: 'Server error. Please try again later.',
        };
      }

      const data = await response.json();
      const newToken = data.token;

      await setStoredToken(newToken);
      setToken(newToken);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Could not connect to server. Please check your connection.',
      };
    }
  };

  const logout = async () => {
    try {
      await clearStoredToken();
      setToken(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value: AuthContextType = {
    token,
    isAuthenticated: !!token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
