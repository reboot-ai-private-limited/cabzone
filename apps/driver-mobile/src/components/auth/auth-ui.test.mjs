import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function screen(file, exported) {
  const values = [];
  const calls = [];
  let cursor = 0;
  const auth = {
    phone: '',
    otpCooldown: 0,
    error: null,
    clearError: () => {
      auth.error = null;
    },
    sendOtp: async (phone) => {
      calls.push(['send', phone]);
      return true;
    },
    verifyOtp: async (otp) => {
      calls.push(['verify', otp]);
      return true;
    },
  };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [
        values[index],
        (next) => {
          values[index] = typeof next === 'function' ? next(values[index]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useEffect() {},
    useCallback: (fn) => fn,
  };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    require: (name) => {
      if (/\.(png|webp)$/.test(name)) return name;
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          ...Object.fromEntries(
            [
              'View',
              'Text',
              'Image',
              'TextInput',
              'Pressable',
              'ScrollView',
              'KeyboardAvoidingView',
              'ActivityIndicator',
            ].map((type) => [type, type]),
          ),
          Platform: { OS: 'android' },
          StyleSheet: { create: (styles) => styles },
        };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
      if (name === 'expo-router')
        return {
          useFocusEffect() {},
          useRouter: () => ({ navigate: (route) => calls.push(['navigate', route]) }),
        };
      if (name === '@/context/auth-context') return { useAuth: () => auth };
      if (name === '@/design-system')
        return { colors: { white: '#FFFFFF', amber: '#FBBF24', deepBrown: '#3A2414' } };
      if (name.includes('use-reduced-motion')) return { useReducedMotion: () => true };
      if (name === './blob-background') return { BlobBackground: 'BlobBackground' };
      if (name === './entry-step') return { EntryStep: 'EntryStep' };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const props = {
    onBack: () => calls.push(['back']),
    onContinue: () => calls.push(['continue']),
    onSuccess: () => calls.push(['success']),
  };
  return {
    auth,
    calls,
    props,
    render() {
      cursor = 0;
      return module.exports[exported](props);
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
const label = (tree, text) => find(tree, (node) => node.props.accessibilityLabel === text);
const flush = () => new Promise(setImmediate);

async function sendCode(s) {
  label(s.render(), 'Mobile number, 10 digits').props.onChangeText('9876543210');
  label(s.render(), 'Send code').props.onPress();
  await flush();
}

test('welcome uses one phone action without a scrolling page', () => {
  const s = screen('./entry-step.tsx', 'EntryStep');
  const tree = s.render();
  assert.equal(
    find(tree, (node) => node.type === 'ScrollView'),
    null,
  );
  label(tree, 'Continue with your phone number').props.onPress();
  assert.deepEqual(s.calls, [['continue']]);
});

test('welcome opens the existing phone route', () => {
  const s = screen('./auth-screen.tsx', 'AuthScreen');
  s.render().props.onContinue();
  assert.deepEqual(s.calls, [['navigate', '/(auth)/phone']]);
});

test('phone input validates Indian numbers and advances after a successful send', async () => {
  const s = screen('./signup-step.tsx', 'SignupStep');
  label(s.render(), 'Mobile number, 10 digits').props.onChangeText('1234567890');
  assert.equal(label(s.render(), 'Send code').props.disabled, true);
  await sendCode(s);
  assert.deepEqual(s.calls, [['send', '9876543210']]);
  assert.ok(label(s.render(), 'Verification code, 6 digits'));
  label(s.render(), 'Change mobile number').props.onPress();
  assert.equal(label(s.render(), 'Mobile number, 10 digits').props.value, '9876543210');
  label(s.render(), 'Back to welcome').props.onPress();
  assert.deepEqual(s.calls.at(-1), ['back']);
});

test('sending the same request twice shares the pending UI action', async () => {
  const s = screen('./signup-step.tsx', 'SignupStep');
  let resolveSend;
  s.auth.sendOtp = (phone) => {
    s.calls.push(['send', phone]);
    return new Promise((resolve) => {
      resolveSend = resolve;
    });
  };
  label(s.render(), 'Mobile number, 10 digits').props.onChangeText('9876543210');
  const submit = label(s.render(), 'Send code');
  submit.props.onPress();
  submit.props.onPress();
  assert.equal(s.calls.length, 1);
  assert.equal(label(s.render(), 'Sending code').props.disabled, true);
  resolveSend(true);
  await flush();
  assert.ok(label(s.render(), 'Verification code, 6 digits'));
});

test('resend respects the server cooldown and verification stays single-flight', async () => {
  const s = screen('./signup-step.tsx', 'SignupStep');
  await sendCode(s);
  s.auth.otpCooldown = 37;
  const resend = label(s.render(), 'Resend code');
  assert.equal(resend.props.disabled, true);
  resend.props.onPress();
  assert.equal(s.calls.length, 1);
  s.auth.otpCooldown = 0;
  label(s.render(), 'Resend code').props.onPress();
  await flush();
  assert.equal(s.calls.filter(([action]) => action === 'send').length, 2);

  let resolveVerify;
  s.auth.verifyOtp = (code) => {
    s.calls.push(['verify', code]);
    return new Promise((resolve) => {
      resolveVerify = resolve;
    });
  };
  const input = label(s.render(), 'Verification code, 6 digits');
  input.props.onChangeText('123456');
  input.props.onChangeText('123456');
  assert.equal(s.calls.filter(([action]) => action === 'verify').length, 1);
  assert.equal(label(s.render(), 'Verifying code').props.disabled, true);
  resolveVerify(true);
  await flush();
  assert.deepEqual(s.calls.at(-1), ['success']);
});

test('failed code delivery keeps the number form available and displays the error', async () => {
  const s = screen('./signup-step.tsx', 'SignupStep');
  s.auth.sendOtp = async () => {
    s.auth.error = 'Please try again shortly.';
    return false;
  };
  await sendCode(s);
  assert.equal(label(s.render(), 'Verification code, 6 digits'), null);
  assert.ok(find(s.render(), (node) => node.props.accessibilityRole === 'alert'));
  assert.equal(label(s.render(), 'Send code').props.disabled, false);
});
