import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/design-system';

function TabIcon({
  name,
  focused,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
  color: React.ComponentProps<typeof Ionicons>['color'];
}) {
  return (
    <View style={[styles.icon, focused && styles.activeIcon]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

export default function RiderTabsLayout() {
  const { bottom } = useSafeAreaInsets();
  const bottomInset = Math.max(bottom, Platform.OS === 'android' ? 24 : 0);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.deepBrown,
        tabBarActiveBackgroundColor: colors.white,
        tabBarInactiveBackgroundColor: colors.white,
        tabBarInactiveTintColor: colors.secondary,
        tabBarButton: ({ ref: _ref, ...props }) => (
          <Pressable {...props} android_ripple={{ color: 'transparent' }} />
        ),
        tabBarIconStyle: { width: 56, height: 30 },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68 + bottomInset,
          paddingBottom: 8 + bottomInset,
          paddingTop: 8,
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
        name="intercity"
        options={{
          title: 'Intercity',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="trail-sign-outline" focused={focused} color={color} />
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
  icon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  activeIcon: { backgroundColor: colors.amber },
});
