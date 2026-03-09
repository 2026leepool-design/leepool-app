import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReactNode } from 'react';

const CYBER_BG = '#0A0F1A';

type KeyboardWrapperProps = {
  children: ReactNode;
  /** When false, uses View instead of ScrollView (e.g. for chat with FlatList) */
  useScroll?: boolean;
  /** Extra contentContainerStyle for ScrollView */
  contentContainerStyle?: ViewStyle;
  /** SafeArea edges */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Renders inside SafeAreaView but outside ScrollView (e.g. Modals) */
  extraChildren?: ReactNode;
};

export function KeyboardWrapper({
  children,
  useScroll = true,
  contentContainerStyle,
  edges = ['top', 'bottom'],
  extraChildren,
}: KeyboardWrapperProps) {
  const content = useScroll ? (
    <ScrollView
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces={false}
      style={{ backgroundColor: CYBER_BG }}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, backgroundColor: CYBER_BG }, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: CYBER_BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: CYBER_BG }} edges={edges}>
        {content}
        {extraChildren}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
