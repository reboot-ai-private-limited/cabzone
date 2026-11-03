import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ColorValue, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/design-system';

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

export default function RiderTabsLayout() {
  const { bottom } = useSafeAreaInsets();
  const bottomInset = Math.max(bottom, Platform.OS === 'android' ? 12 : 0);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.deepBrown,
        tabBarInactiveTintColor: colors.secondary,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarButton: ({ ref: _ref, ...props }) => (
          <Pressable {...props} android_ripple={{ color: 'transparent' }} />
        ),
        tabBarIconStyle: { width: 56, height: 30 },
        tabBarStyle: {
          backgroundColor: '#FAF8F5',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          height: 60 + bottomInset,
          paddingBottom: 4 + bottomInset,
          paddingTop: 4,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          lineHeight: 14,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="car-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="intercity"
        options={{
          title: 'Intercity',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="swap-horizontal-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="receipt-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
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

const styles = StyleSheet.create({
  icon: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activeIcon: { backgroundColor: '#FDE68A' },
});
