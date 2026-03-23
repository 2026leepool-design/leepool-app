import { Stack } from 'expo-router';

export default function BookLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0F1A' },
        animation: 'fade',
      }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen
        name="edit/[id]"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
