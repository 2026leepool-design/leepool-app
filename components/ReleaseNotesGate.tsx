import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import {
  RELEASE_NOTES_LINES,
  releaseNotesDismissStorageKey,
} from '@/constants/releaseNotes';
import { secureGetItem, secureSetItem } from '@/utils/platformSecureStorage';

export default function ReleaseNotesGate() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '4.0.0';

  const [checking, setChecking] = useState(true);
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = releaseNotesDismissStorageKey(version);
        const skip = await secureGetItem(key);
        if (!cancelled && skip !== '1') {
          setVisible(true);
        }
      } catch {
        if (!cancelled) setVisible(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const handleClose = useCallback(async () => {
    if (dontShowAgain) {
      try {
        await secureSetItem(releaseNotesDismissStorageKey(version), '1');
      } catch {
        // Still hide the sheet; preference just won’t persist
      }
    }
    setVisible(false);
  }, [dontShowAgain, version]);

  if (checking || !visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 justify-center px-5" style={{ backgroundColor: 'rgba(5, 8, 14, 0.88)' }}>
        <View
          className="rounded-3xl overflow-hidden max-h-[78%]"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 255, 157, 0.2)',
            paddingTop: 20,
            paddingHorizontal: 20,
            paddingBottom: Math.max(16, insets.bottom + 12),
          }}>
          <Text
            className="text-[#00FF9D] text-lg tracking-widest mb-1"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('releaseNotesTitle')}
          </Text>
          <Text
            className="text-[#8892B0] text-xs tracking-widest mb-1"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('releaseNotesVersion', { version })}
          </Text>
          <Text
            className="text-[#4A5568] text-[10px] tracking-wide mb-4"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('releaseNotesSubtitle')}
          </Text>

          <ScrollView
            className="mb-5"
            style={{ maxHeight: 320 }}
            showsVerticalScrollIndicator
            indicatorStyle="white">
            {RELEASE_NOTES_LINES.map((line, i) => (
              <View key={i} className="flex-row gap-2 mb-3">
                <Text className="text-[#00E5FF] text-sm mt-0.5" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  •
                </Text>
                <Text
                  className="text-[#E2E8F0] text-sm flex-1 leading-snug"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  {line}
                </Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => setDontShowAgain((v) => !v)}
            className="flex-row items-center gap-3 mb-4 active:opacity-80">
            <View
              className="w-5 h-5 rounded border-2 items-center justify-center"
              style={{
                borderColor: dontShowAgain ? '#00FF9D' : '#4A5568',
                backgroundColor: dontShowAgain ? 'rgba(0, 255, 157, 0.15)' : 'transparent',
              }}>
              {dontShowAgain ? <Ionicons name="checkmark" size={14} color="#00FF9D" /> : null}
            </View>
            <Text className="text-[#8892B0] text-sm flex-1" style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
              {t('releaseNotesDontShowAgain')}
            </Text>
          </Pressable>

          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.88}
            className="rounded-2xl py-3.5 items-center"
            style={{ backgroundColor: '#00FF9D' }}>
            <Text className="text-[#0A0F1A] text-sm tracking-widest" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {t('releaseNotesClose')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
