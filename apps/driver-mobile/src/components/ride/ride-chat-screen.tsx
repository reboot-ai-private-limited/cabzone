import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  RIDE_CHAT_MAX_LENGTH,
  RIDE_CHAT_QUICK_REPLIES,
  type RideChatMessageDto,
} from '@cabzone/contracts';
import { rideChatApi } from '@/services/api';
import {
  contactInitials,
  isChatAccessError,
  mergeChatMessages,
  newChatMessageId,
} from '@/services/ride-chat';
import { colors, createStyles } from '@/design-system';

type Pending = { key: string; text: string; failed: boolean };

export interface RideChatScreenProps {
  token: string;
  rideId: string;
  role: 'RIDER' | 'DRIVER';
  revision: number;
  name: string;
  connected?: boolean | undefined;
  rideClosed?: boolean | undefined;
  onOpen?: (() => void) | undefined;
  onCall?: (() => void) | undefined;
}

export function RideChatScreen({
  token,
  rideId,
  role,
  revision,
  name,
  connected = true,
  rideClosed = false,
  onOpen,
  onCall,
}: RideChatScreenProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<RideChatMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(rideClosed);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(!rideClosed);
  const focused = useRef(false);
  const loadingRef = useRef(false);
  const resyncQueued = useRef(false);
  const sendingRef = useRef(false);
  const cursor = useRef<number | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const markClosed = useCallback(() => {
    setClosed(true);
    setMessages([]);
    setPending(null);
    setDraft('');
    setHasOlder(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (rideClosed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      markClosed();
    }
  }, [rideClosed, markClosed]);

  const reportError = useCallback(
    (err: unknown) => {
      if (!focused.current) return;
      if (isChatAccessError(err)) {
        markClosed();
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load messages. Try again.');
    },
    [markClosed],
  );

  const sync = useCallback(async () => {
    if (!focused.current || rideClosed) return;
    if (loadingRef.current) {
      resyncQueued.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      do {
        resyncQueued.current = false;
        let more = true;
        while (more && focused.current) {
          const first = cursor.current === null;
          const page = await rideChatApi.list(
            token,
            rideId,
            first ? {} : { after: cursor.current! },
          );
          if (!focused.current) return;
          setMessages((prev) => mergeChatMessages(prev, page.messages));
          setPending((p) =>
            p && page.messages.some((m) => m.senderRole === role && m.clientMessageId === p.key)
              ? null
              : p,
          );
          if (first) setHasOlder(page.hasMore);
          cursor.current = page.messages.at(-1)?.sequence ?? cursor.current ?? 0;
          more = !first && page.hasMore;
        }
      } while (resyncQueued.current && focused.current);
      if (focused.current) {
        setError(null);
        onOpenRef.current?.();
      }
    } catch (err) {
      reportError(err);
    } finally {
      loadingRef.current = false;
      if (focused.current) setLoading(false);
    }
  }, [token, rideId, role, rideClosed, reportError]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      onOpenRef.current?.();
      void sync();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void sync();
      });
      return () => {
        focused.current = false;
        resyncQueued.current = false;
        subscription.remove();
      };
    }, [sync]),
  );

  useEffect(() => {
    if (focused.current) void sync();
  }, [revision, connected, sync]);

  useEffect(() => {
    if (connected || closed) return;
    const timer = setInterval(() => {
      if (focused.current && AppState.currentState === 'active') void sync();
    }, 15_000);
    return () => clearInterval(timer);
  }, [connected, closed, sync]);

  const loadOlder = async () => {
    if (loadingRef.current || closed || !messages.length) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await rideChatApi.list(token, rideId, { before: messages[0]!.sequence });
      if (!focused.current) return;
      setMessages((prev) => mergeChatMessages(prev, page.messages));
      setHasOlder(page.hasMore);
    } catch (err) {
      reportError(err);
    } finally {
      loadingRef.current = false;
      if (focused.current) setLoading(false);
    }
  };

  const submit = async (retry?: Pending) => {
    if (closed || sendingRef.current || (pending && !retry)) return;
    const text = (retry?.text ?? draft).trim();
    if (!text || [...text].length > RIDE_CHAT_MAX_LENGTH) return;
    const item = retry ?? { key: newChatMessageId(), text, failed: false };
    sendingRef.current = true;
    setPending({ ...item, failed: false });
    if (!retry) setDraft('');
    try {
      const message = await rideChatApi.send(token, rideId, item.key, item.text);
      if (!focused.current) return;
      setMessages((prev) => mergeChatMessages(prev, [message]));
      if (cursor.current === null || message.sequence > cursor.current) {
        cursor.current = message.sequence;
      }
      setPending((p) => (p?.key === item.key ? null : p));
      setError(null);
      void sync();
    } catch (err) {
      if (focused.current && !isChatAccessError(err)) {
        setPending((p) => (p?.key === item.key ? { ...p, failed: true } : p));
      }
      reportError(err);
    } finally {
      sendingRef.current = false;
    }
  };

  const trimmedLength = [...draft.trim()].length;
  const valid = trimmedLength > 0 && trimmedLength <= RIDE_CHAT_MAX_LENGTH;
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to ride"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{contactInitials(name)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.subtitle}>Private ride chat · phone numbers are hidden</Text>
        </View>
        {!closed && onCall ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={role === 'RIDER' ? 'Call driver' : 'Call passenger'}
            onPress={onCall}
            style={[styles.iconButton, styles.callButton]}
          >
            <Ionicons name="call" size={19} color={colors.deepBrown} />
          </Pressable>
        ) : null}
      </View>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.banner}>
            <Text style={styles.error}>{error}</Text>
            {!closed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh messages"
                onPress={() => void sync()}
                style={styles.button}
              >
                <Text style={styles.label}>Refresh</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <FlatList
          inverted
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.notice}>
              {loading
                ? 'Loading messages…'
                : closed
                  ? 'Chat is closed for this ride.'
                  : 'Send a short message about your pickup or trip.'}
            </Text>
          }
          ListHeaderComponent={
            pending ? (
              <View style={[styles.bubble, styles.mine]}>
                <Text selectable={false} style={[styles.text, styles.textMine]}>
                  {pending.text}
                </Text>
                <Text style={[styles.time, styles.timeMine]}>
                  {pending.failed ? 'Not sent' : 'Sending…'}
                </Text>
                {pending.failed ? (
                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry message"
                      style={styles.button}
                      onPress={() => void submit(pending)}
                    >
                      <Text style={[styles.label, styles.textMine]}>Retry</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Discard unsent message"
                      style={styles.button}
                      onPress={() => setPending(null)}
                    >
                      <Text style={[styles.label, styles.textMine]}>Discard</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : undefined
          }
          ListFooterComponent={
            hasOlder && !closed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Load earlier messages"
                disabled={loading}
                style={styles.button}
                onPress={() => void loadOlder()}
              >
                <Text style={styles.label}>{loading ? 'Loading…' : 'Load earlier messages'}</Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => {
            const mine = item.senderRole === role;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text selectable={false} style={[styles.text, mine && styles.textMine]}>
                  {item.text}
                </Text>
                <Text style={[styles.time, mine && styles.timeMine]}>
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            );
          }}
        />
        {!closed ? (
          <>
            <View style={styles.quick}>
              {RIDE_CHAT_QUICK_REPLIES[role].map((text) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quick reply: ${text}`}
                  key={text}
                  disabled={!!pending}
                  style={[styles.chip, !!pending && styles.disabled]}
                  onPress={() => setDraft(text)}
                >
                  <Text style={styles.label}>{text}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel="Message, maximum 300 characters"
                placeholder="Message…"
                placeholderTextColor={colors.secondary}
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={1200}
                editable={!pending}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!valid || !!pending}
                onPress={() => void submit()}
                style={[styles.sendButton, (!valid || !!pending) && styles.disabled]}
              >
                <Ionicons name="send" size={18} color={colors.deepBrown} />
              </Pressable>
            </View>
            {trimmedLength > RIDE_CHAT_MAX_LENGTH - 60 ? (
              <Text style={[styles.count, !valid && styles.countOver]}>
                {`${trimmedLength}/${RIDE_CHAT_MAX_LENGTH}`}
              </Text>
            ) : null}
          </>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  page: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButton: { backgroundColor: colors.softAmber },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.deepBrown },
  headerCopy: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.secondary, marginTop: 1 },
  notice: { color: colors.secondary, padding: 14, textAlign: 'center', fontSize: 14 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  error: { flex: 1, color: colors.error, fontSize: 15 },
  list: { paddingHorizontal: 14, paddingVertical: 12, flexGrow: 1 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    marginVertical: 3,
    maxWidth: '82%',
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.deepBrown, borderBottomRightRadius: 6 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  text: { fontSize: 16, lineHeight: 22, color: colors.text },
  textMine: { color: colors.white },
  time: { marginTop: 3, fontSize: 11, color: colors.secondary, alignSelf: 'flex-end' },
  timeMine: { color: colors.softAmber },
  row: { flexDirection: 'row' },
  button: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  label: { color: colors.deepBrown, fontSize: 15, fontWeight: '600' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 6 },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    margin: 12,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingVertical: 10, fontSize: 16, color: colors.text },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  disabled: { opacity: 0.45 },
  count: { textAlign: 'right', marginRight: 20, marginBottom: 6, color: colors.secondary },
  countOver: { color: colors.error },
}));
