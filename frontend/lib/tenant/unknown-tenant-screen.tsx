import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type UnknownTenantScreenProps = {
  hostname?: string;
};

export function UnknownTenantScreen({ hostname }: UnknownTenantScreenProps) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Unknown tenant
        </ThemedText>
        <ThemedText style={styles.message}>
          {hostname
            ? `No tenant is configured for "${hostname}".`
            : 'This app build is not configured for a known tenant.'}
        </ThemedText>
        <ThemedText style={styles.hint}>
          Check the hostname mapping in the tenant registry or set EXPO_PUBLIC_TENANT for native
          builds.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    opacity: 0.85,
  },
  hint: {
    textAlign: 'center',
    opacity: 0.65,
    fontSize: 14,
  },
});
