import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0F1A',
          borderTopColor: 'rgba(0, 229, 255, 0.15)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: '#00E5FF',
        tabBarInactiveTintColor: '#3A4560',
        tabBarLabelStyle: {
          fontFamily: 'SpaceGrotesk_600SemiBold',
          fontSize: 9,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              backgroundColor: '#0A0F1A',
              borderTopWidth: 1,
              borderTopColor: 'rgba(0, 229, 255, 0.15)',
            }}
          />
        ),
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: t('dashboard'),
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
              }}>
              <Ionicons
                name={focused ? 'grid' : 'grid-outline'}
                size={size}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarLabel: t('tabLibrary'),
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
              }}>
              <Ionicons
                name={focused ? 'book' : 'book-outline'}
                size={size}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          tabBarLabel: t('tabMarket'),
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(0, 255, 157, 0.10)' : 'transparent',
              }}>
              <Ionicons
                name={focused ? 'storefront' : 'storefront-outline'}
                size={size}
                color={focused ? '#00FF9D' : color}
              />
            </View>
          ),
          tabBarActiveTintColor: '#00FF9D',
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarLabel: t('tabMessages'),
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
              }}>
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={size}
                color={focused ? '#A855F7' : color}
              />
            </View>
          ),
          tabBarActiveTintColor: '#A855F7',
        }}
      />
    </Tabs>
  );
}
