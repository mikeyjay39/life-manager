import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtonConnectProvider } from '@/contexts/ProtonConnectContext';
import { TenantProvider } from '@/lib/tenant/TenantContext';
import {
  TenantThemeProvider,
  useNavigationTheme,
} from '@/lib/tenant/TenantThemeContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationTheme = useNavigationTheme();

  useEffect(() => {
    if (isLoading) return;

    // Public auth routes stay reachable while logged out (login, signup, email flows).
    // Email deep links (verify / reset / forgot) must also stay reachable when a JWT
    // is already stored so ?token= is not dropped before the screen can run.
    const route = segments[0];
    const inAuthGroup = route === '(tabs)' || route === 'modal';
    const isEmailAuthDeepLink =
      route === 'verify-email' ||
      route === 'forgot-password' ||
      route === 'reset-password';

    if (!isAuthenticated && inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && !inAuthGroup && !isEmailAuthDeepLink) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <TenantProvider>
      <TenantThemeProvider>
        <AuthProvider>
          <ProtonConnectProvider>
            <RootLayoutNav />
          </ProtonConnectProvider>
          <StatusBar style="auto" />
        </AuthProvider>
      </TenantThemeProvider>
    </TenantProvider>
  );
}
