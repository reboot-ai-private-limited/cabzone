import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { colors, spacing, typography, createStyles } from '@/design-system';
import { receiptHtml, type rideReceipt } from '@/services/ride-receipt';

export function ReceiptPreview({
  receipt,
  onClose,
}: {
  receipt: ReturnType<typeof rideReceipt>;
  onClose: () => void;
}) {
  const html = receiptHtml(receipt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);

  const exportReceipt = async (share: boolean) => {
    if (exporting.current) return;
    exporting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (share && Platform.OS !== 'web') {
        if (!(await Sharing.isAvailableAsync()))
          throw new Error('File sharing is unavailable on this device. Use Save PDF instead.');
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Share Cabzone receipt',
        });
      } else await Print.printAsync({ html });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export the receipt. Please retry.');
    } finally {
      exporting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Trip receipt</Text>
          <Pressable
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close receipt"
          >
            <Text style={styles.actionText}>Close</Text>
          </Pressable>
        </View>
        <WebView
          source={{ html }}
          originWhitelist={['about:blank', 'data:*']}
          javaScriptEnabled={false}
          onShouldStartLoadWithRequest={({ url }) =>
            url === 'about:blank' || url.startsWith('data:')
          }
          style={styles.container}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            disabled={busy}
            onPress={() => void exportReceipt(false)}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
          >
            <Text style={styles.actionText}>Save PDF</Text>
          </Pressable>
          <Pressable
            style={[styles.action, styles.primary]}
            disabled={busy}
            onPress={() => void exportReceipt(true)}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
          >
            {busy ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.actionText}>Share receipt</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = createStyles(() => ({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  title: { ...typography.h2, color: colors.deepBrown },
  close: { minHeight: 48, paddingHorizontal: spacing.md, justifyContent: 'center' },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  action: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: { backgroundColor: colors.amber, borderColor: colors.amber },
  actionText: { ...typography.bodyBold, color: colors.deepBrown },
  error: { ...typography.caption, color: colors.error, paddingHorizontal: spacing.xl },
}));
