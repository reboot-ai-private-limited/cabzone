import React, { useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { Modal, Pressable, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { receiptHtml, type rideReceipt } from '@/services/ride-receipt';
import { colors, spacing, typography, createStyles } from '@/design-system';

export function ReceiptPreview({
  receipt,
  onClose,
}: {
  receipt: ReturnType<typeof rideReceipt>;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const html = useMemo(
    () =>
      receiptHtml(receipt, Asset.fromModule(require('@/assets/brand/cabzone-horizontal.png')).uri),
    [receipt],
  );
  return (
    <Modal visible onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Trip receipt</Text>
          <Pressable style={styles.action} onPress={onClose} accessibilityRole="button">
            <Text style={styles.label}>Close</Text>
          </Pressable>
        </View>
        <iframe
          ref={frame}
          title="Cabzone trip receipt"
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
          style={{ flex: 1, width: '100%', minHeight: 0, border: 0, background: '#fff' }}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            onPress={() => {
              frame.current?.contentWindow?.focus();
              frame.current?.contentWindow?.print();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.label}>Print / Save PDF</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={() =>
              void Share.share({
                title: 'Cabzone trip receipt',
                message: `Cabzone trip receipt\n${receipt.date}\n${receipt.pickup} → ${receipt.drop}\n${receipt.amount} · ${receipt.status}\n${receipt.payment}\nReference ${receipt.reference}`,
              }).catch(() =>
                setError('Sharing is unavailable in this browser. Use Print / Save PDF.'),
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.label}>Share summary</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: { ...typography.h2, color: colors.deepBrown },
  action: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  label: { ...typography.bodyBold, color: colors.deepBrown },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  error: { ...typography.caption, color: colors.error, paddingHorizontal: spacing.xl },
}));
