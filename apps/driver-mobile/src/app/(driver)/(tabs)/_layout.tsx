import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ColorValue, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, createStyles } from '@/design-system';

function TabIcon({
  name,
  focused,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
  color: ColorValue | undefined;
}) {
  return (
    <View style={[styles.icon, focused && styles.activeIcon]}>
      <Ionicons name={name} size={22} color={typeof color === 'string' ? color : undefined} />
    </View>
  );
}

export default function DriverTabsLayout() {
  const { bottom } = useSafeAreaInsets();
  const bottomInset = Math.max(bottom, Platform.OS === 'android' ? 24 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.deepBrown,
        tabBarActiveBackgroundColor: colors.surface,
        tabBarInactiveBackgroundColor: colors.surface,
        tabBarInactiveTintColor: colors.secondary,
        tabBarButton: ({ ref: _ref, ...props }) => (
          <Pressable {...props} android_ripple={{ color: 'transparent' }} />
        ),
        tabBarIconStyle: { width: 56, height: 30 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68 + bottomInset,
          paddingTop: 8,
          paddingBottom: 8 + bottomInset,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          lineHeight: 16,
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="car-sport-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'Rides',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="receipt-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="wallet-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person-circle-outline" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = createStyles(() => ({
  icon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  activeIcon: { backgroundColor: colors.amber },
}));
