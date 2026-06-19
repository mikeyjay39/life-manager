import { BlurView } from 'expo-blur';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

const DESTRUCTIVE_COLOR = '#ff3b30';
const BLUR_INTENSITY = 40;

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRequestClose?: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  onRequestClose,
}: ConfirmDialogProps) {
  const palette = useColorPalette();
  const colorScheme = useColorScheme() ?? 'light';
  const handleRequestClose = onRequestClose ?? onCancel;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        blurRoot: {
          flex: 1,
        },
        dimOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        centered: {
          ...StyleSheet.absoluteFillObject,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        },
        card: {
          backgroundColor: palette.background,
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 340,
          gap: 16,
        },
        message: {
          opacity: 0.8,
        },
        actions: {
          flexDirection: 'row',
          gap: 12,
          marginTop: 8,
        },
        cancelButton: {
          flex: 1,
          borderRadius: 8,
          padding: 12,
          alignItems: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.icon,
        },
        confirmButton: {
          flex: 1,
          borderRadius: 8,
          padding: 12,
          alignItems: 'center',
          backgroundColor: destructive ? DESTRUCTIVE_COLOR : palette.tint,
        },
        cancelLabel: {
          color: palette.text,
          fontSize: 16,
          fontWeight: '600',
        },
        confirmLabel: {
          color: destructive ? '#fff' : palette.onTint,
          fontSize: 16,
          fontWeight: '600',
        },
      }),
    [palette, destructive]
  );

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={handleRequestClose}
      accessibilityViewIsModal
    >
      <BlurView intensity={BLUR_INTENSITY} tint={colorScheme} style={styles.blurRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
        />
        <View style={styles.dimOverlay} pointerEvents="none" />
        <View style={styles.centered} pointerEvents="box-none">
          <View style={styles.card} pointerEvents="auto">
            <ThemedText type="title">{title}</ThemedText>
            <ThemedText style={styles.message}>{message}</ThemedText>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
                accessibilityLabel={cancelLabel}
                accessibilityRole="button"
              >
                <Text style={styles.cancelLabel}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={onConfirm}
                accessibilityLabel={confirmLabel}
                accessibilityRole="button"
              >
                <Text style={styles.confirmLabel}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}
