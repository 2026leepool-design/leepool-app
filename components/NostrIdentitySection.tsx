import { deleteKeys, generateAndSaveKeys, importNsecKey, loadKeys, type NostrKeys } from '@/utils/nostr';
import {
  clearNostrProfileRemote,
  importNostrKeyAndSealToProfile,
  pushNostrProfileFromLocalKeys,
  restoreNostrFromCloud,
} from '@/utils/nostrProfileSync';
import { getCachedAccountPassword, setCachedAccountPassword } from '@/utils/authPasswordSession';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import QRCode from 'react-native-qrcode-svg';

function truncateNpub(npub: string) {
  if (npub.length <= 28) return npub;
  return `${npub.slice(0, 12)}...${npub.slice(-12)}`;
}

export function NostrIdentitySection() {
  const { t } = useTranslation();

  const [nostrKeys, setNostrKeys] = useState<NostrKeys | null>(null);
  const [nostrLoading, setNostrLoading] = useState(true);
  const [nostrActionLoading, setNostrActionLoading] = useState(false);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [importKeyModalVisible, setImportKeyModalVisible] = useState(false);
  const [importKeyModalNsec, setImportKeyModalNsec] = useState('');
  const [importKeyModalPassword, setImportKeyModalPassword] = useState('');
  const [importKeyModalLoading, setImportKeyModalLoading] = useState(false);
  const [importNsec, setImportNsec] = useState('');
  const [restoreFromCloudVisible, setRestoreFromCloudVisible] = useState(false);
  const [restoreCloudPassword, setRestoreCloudPassword] = useState('');
  const [restoreCloudLoading, setRestoreCloudLoading] = useState(false);
  const [cloudPushVisible, setCloudPushVisible] = useState(false);
  const [cloudPushPassword, setCloudPushPassword] = useState('');
  const [cloudPushLoading, setCloudPushLoading] = useState(false);
  const restorePromptedRef = useRef(false);
  const nostrSwipeableRef = useRef<Swipeable>(null);

  const maybeOfferCloudSyncAfterKeyChange = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const pwd = getCachedAccountPassword();
    if (pwd) {
      try {
        await pushNostrProfileFromLocalKeys(pwd, user.id);
      } catch {
        setCloudPushVisible(true);
      }
    } else {
      setCloudPushVisible(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadNostrKeys() {
        setNostrLoading(true);
        try {
          const keys = await loadKeys();
          if (isMounted) {
            setNostrKeys(keys);
            if (!keys && !restorePromptedRef.current) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user?.id) {
                const { data: prof, error: pErr } = await supabase
                  .from('profiles')
                  .select('encrypted_nsec')
                  .eq('id', user.id)
                  .maybeSingle();
                if (
                  !pErr &&
                  prof &&
                  typeof (prof as { encrypted_nsec?: string }).encrypted_nsec === 'string' &&
                  (prof as { encrypted_nsec: string }).encrypted_nsec.trim()
                ) {
                  restorePromptedRef.current = true;
                  setRestoreFromCloudVisible(true);
                }
              }
            }
          }
        } catch {
          if (isMounted) setNostrKeys(null);
        } finally {
          if (isMounted) setNostrLoading(false);
        }
      }
      loadNostrKeys();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const handleGenerateIdentity = async () => {
    setNostrActionLoading(true);
    try {
      const keys = await generateAndSaveKeys();
      setNostrKeys(keys);
      await maybeOfferCloudSyncAfterKeyChange();
    } catch {
      // silently fail
    } finally {
      setNostrActionLoading(false);
    }
  };

  const handleImportIdentity = async () => {
    const text = importNsec.trim();
    if (!text) {
      const msg = t('fillAllFields');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('error'), msg);
      }
      return;
    }

    setNostrActionLoading(true);
    try {
      const keys = await importNsecKey(text);
      setNostrKeys(keys);
      setImportNsec('');
      await maybeOfferCloudSyncAfterKeyChange();
      if (Platform.OS === 'web') {
        window.alert(t('identityImportedSuccess'));
      } else {
        Alert.alert(t('success'), t('identityImportedSuccess'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('error'), msg);
      }
    } finally {
      setNostrActionLoading(false);
    }
  };

  const handleDeleteIdentity = () => {
    Alert.alert(t('deleteIdentityTitle'), t('deleteIdentityWarning'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('yesDelete'),
        style: 'destructive',
        onPress: async () => {
          setNostrActionLoading(true);
          try {
            await deleteKeys();
            try {
              await clearNostrProfileRemote();
            } catch {
              // optional remote cleanup
            }
            setNostrKeys(null);
          } catch {
            // silently fail
          } finally {
            setNostrActionLoading(false);
          }
        },
      },
    ]);
  };

  const submitRestoreFromCloud = async () => {
    const pwd = restoreCloudPassword.trim();
    if (!pwd) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setRestoreCloudLoading(true);
    try {
      await restoreNostrFromCloud(pwd);
      const keys = await loadKeys();
      setNostrKeys(keys);
      setRestoreFromCloudVisible(false);
      setRestoreCloudPassword('');
      Alert.alert(t('success'), t('nostrCloudSynced'));
    } catch {
      Alert.alert(t('error'), t('nostrSyncDecryptError'));
    } finally {
      setRestoreCloudLoading(false);
    }
  };

  const submitCloudPush = async () => {
    const pwd = cloudPushPassword.trim();
    if (!pwd) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setCloudPushLoading(true);
    try {
      await pushNostrProfileFromLocalKeys(pwd);
      setCachedAccountPassword(pwd);
      setCloudPushVisible(false);
      setCloudPushPassword('');
      Alert.alert(t('success'), t('nostrCloudSynced'));
    } catch {
      Alert.alert(t('error'), t('nostrCloudSyncFailed'));
    } finally {
      setCloudPushLoading(false);
    }
  };

  const submitImportKeyWithSeal = async () => {
    const nsec = importKeyModalNsec.trim();
    const pwd = importKeyModalPassword.trim();
    if (!nsec || !pwd) {
      if (Platform.OS === 'web') {
        window.alert(t('fillAllFields'));
      } else {
        Alert.alert(t('error'), t('fillAllFields'));
      }
      return;
    }
    setImportKeyModalLoading(true);
    try {
      const keys = await importNostrKeyAndSealToProfile(nsec, pwd);
      setNostrKeys(keys);
      setCachedAccountPassword(pwd);
      setImportKeyModalVisible(false);
      setImportKeyModalNsec('');
      setImportKeyModalPassword('');
      nostrSwipeableRef.current?.close();
      if (Platform.OS === 'web') {
        window.alert(t('identityImportedSuccess'));
      } else {
        Alert.alert(t('success'), t('identityImportedSuccess'));
      }
    } catch (err: unknown) {
      console.error(err);
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as Error).message)
          : String(err);
      if (Platform.OS === 'web') {
        window.alert(msg || t('error'));
      } else {
        Alert.alert(t('error'), msg || t('error'));
      }
    } finally {
      setImportKeyModalLoading(false);
    }
  };

  return (
    <>
      <View
        className="rounded-2xl p-5 mb-5"
        style={{
          backgroundColor: '#131B2B',
          borderWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.15)',
        }}>
        {nostrLoading ? (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" color="#00E5FF" />
          </View>
        ) : nostrKeys ? (
          <Swipeable
            ref={nostrSwipeableRef}
            renderRightActions={(_, dragX) => {
              const scale = dragX.interpolate({
                inputRange: [-80, 0],
                outputRange: [1, 0.7],
                extrapolate: 'clamp',
              });
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    nostrSwipeableRef.current?.close();
                    handleDeleteIdentity();
                  }}
                  style={{
                    width: 76,
                    backgroundColor: 'rgba(255, 80, 80, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 80, 80, 0.3)',
                    borderRadius: 16,
                    marginLeft: 8,
                    marginVertical: 4,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                  <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                    <Ionicons name="trash-outline" size={22} color="#FF5050" />
                    <Text
                      style={{
                        color: '#FF5050',
                        fontSize: 9,
                        fontFamily: 'SpaceGrotesk_600SemiBold',
                        marginTop: 4,
                        letterSpacing: 1,
                      }}>
                      DEL
                    </Text>
                  </Animated.View>
                </TouchableOpacity>
              );
            }}
            overshootRight={false}
            friction={2}>
            <View>
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mb-2"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('nostrIdentityLabel')}
              </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={async () => {
                  await Clipboard.setStringAsync(nostrKeys.npub);
                  Alert.alert(t('success'), t('copied'));
                }}>
                <Text
                  className="text-[#00E5FF] text-sm font-mono mb-3"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
                  {truncateNpub(nostrKeys.npub)}
                </Text>
              </TouchableOpacity>
              <View className="flex-row gap-2 flex-wrap">
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setIsQrVisible(true)}
                  className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                  }}>
                  <Ionicons name="qr-code-outline" size={15} color="#00E5FF" />
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}>
                    QR
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setIsExportModalVisible(true)}
                  className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(167, 139, 250, 0.4)',
                  }}>
                  <Ionicons name="lock-closed-outline" size={15} color="#A78BFA" />
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#A78BFA' }}>
                    {t('exportKey')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setImportKeyModalVisible(true)}
                  className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{
                    backgroundColor: 'rgba(232, 121, 249, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(232, 121, 249, 0.45)',
                  }}>
                  <Ionicons name="key-outline" size={15} color="#E879F9" />
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#E879F9' }}>
                    {t('importKey')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Swipeable>
        ) : (
          <>
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest mb-3"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('nostrConnectTitle')}
            </Text>

            <View className="mb-4 gap-3">
              <TextInput
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: '#0A0F1A',
                  borderWidth: 1,
                  borderColor: 'rgba(167, 139, 250, 0.3)',
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: '#A78BFA',
                }}
                placeholderTextColor="#4A5568"
                placeholder={t('nsecPlaceholder')}
                value={importNsec}
                onChangeText={setImportNsec}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleImportIdentity}
                disabled={nostrActionLoading}
                className="rounded-xl py-3 items-center justify-center"
                style={{
                  backgroundColor: 'rgba(167, 139, 250, 0.12)',
                  borderWidth: 1,
                  borderColor: '#A78BFA',
                }}>
                {nostrActionLoading ? (
                  <ActivityIndicator size="small" color="#A78BFA" />
                ) : (
                  <Text
                    className="text-xs tracking-[0.1em]"
                    style={{
                      fontFamily: 'SpaceGrotesk_700Bold',
                      color: '#E879F9',
                    }}>
                    {t('importKey').toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center gap-2 mb-4">
              <View className="flex-1 h-[1px] bg-white/5" />
              <Text className="text-[10px] text-[#4A5568] uppercase tracking-widest">{t('orDivider')}</Text>
              <View className="flex-1 h-[1px] bg-white/5" />
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleGenerateIdentity}
              disabled={nostrActionLoading}
              className="rounded-xl py-4 items-center justify-center"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                borderWidth: 1,
                borderColor: '#00E5FF',
              }}>
              {nostrActionLoading ? (
                <ActivityIndicator size="small" color="#00E5FF" />
              ) : (
                <Text
                  className="text-base tracking-[0.1em]"
                  style={{
                    fontFamily: 'SpaceGrotesk_700Bold',
                    color: '#00E5FF',
                  }}>
                  {t('generateIdentity')}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <Modal
        visible={restoreFromCloudVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!restoreCloudLoading) setRestoreFromCloudVisible(false);
        }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 20,
              padding: 22,
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.25)',
            }}>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                fontSize: 14,
                color: '#00E5FF',
                marginBottom: 8,
                letterSpacing: 1,
              }}>
              {t('restoreNostrFromCloudTitle')}
            </Text>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_400Regular',
                fontSize: 12,
                color: '#8892B0',
                marginBottom: 16,
                lineHeight: 18,
              }}>
              {t('restoreNostrFromCloudHint')}
            </Text>
            <TextInput
              value={restoreCloudPassword}
              onChangeText={setRestoreCloudPassword}
              placeholder={t('passwordPlaceholder')}
              placeholderTextColor="#4A5568"
              secureTextEntry
              autoCapitalize="none"
              editable={!restoreCloudLoading}
              style={{
                backgroundColor: '#070B14',
                borderRadius: 12,
                padding: 14,
                color: '#E2E8F0',
                fontFamily: 'SpaceGrotesk_400Regular',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: 'rgba(74, 85, 104, 0.35)' }}
                disabled={restoreCloudLoading}
                onPress={() => {
                  setRestoreFromCloudVisible(false);
                  setRestoreCloudPassword('');
                }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.2)',
                  borderWidth: 1,
                  borderColor: '#00E5FF',
                }}
                disabled={restoreCloudLoading}
                onPress={() => void submitRestoreFromCloud()}>
                {restoreCloudLoading ? (
                  <ActivityIndicator color="#00E5FF" />
                ) : (
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00E5FF' }}>
                    {t('restoreNostrAction')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cloudPushVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!cloudPushLoading) setCloudPushVisible(false);
        }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 20,
              padding: 22,
              borderWidth: 1,
              borderColor: 'rgba(168, 85, 247, 0.3)',
            }}>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                fontSize: 14,
                color: '#E879F9',
                marginBottom: 8,
                letterSpacing: 1,
              }}>
              {t('cloudPushNostrTitle')}
            </Text>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_400Regular',
                fontSize: 12,
                color: '#8892B0',
                marginBottom: 16,
                lineHeight: 18,
              }}>
              {t('cloudPushNostrHint')}
            </Text>
            <TextInput
              value={cloudPushPassword}
              onChangeText={setCloudPushPassword}
              placeholder={t('passwordPlaceholder')}
              placeholderTextColor="#4A5568"
              secureTextEntry
              autoCapitalize="none"
              editable={!cloudPushLoading}
              style={{
                backgroundColor: '#070B14',
                borderRadius: 12,
                padding: 14,
                color: '#E2E8F0',
                fontFamily: 'SpaceGrotesk_400Regular',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(168, 85, 247, 0.25)',
              }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: 'rgba(74, 85, 104, 0.35)' }}
                disabled={cloudPushLoading}
                onPress={() => {
                  setCloudPushVisible(false);
                  setCloudPushPassword('');
                }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
                  {t('skipCloudSync')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: 'rgba(168, 85, 247, 0.2)',
                  borderWidth: 1,
                  borderColor: '#A855F7',
                }}
                disabled={cloudPushLoading}
                onPress={() => void submitCloudPush()}>
                {cloudPushLoading ? (
                  <ActivityIndicator color="#A855F7" />
                ) : (
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#E879F9' }}>
                    {t('saveToCloud')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={importKeyModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!importKeyModalLoading) {
            setImportKeyModalVisible(false);
            setImportKeyModalNsec('');
            setImportKeyModalPassword('');
          }
        }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 20,
              padding: 22,
              borderWidth: 1,
              borderColor: 'rgba(232, 121, 249, 0.35)',
            }}>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                fontSize: 14,
                color: '#E879F9',
                marginBottom: 8,
                letterSpacing: 1,
              }}>
              {t('importKeyModalTitle')}
            </Text>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_400Regular',
                fontSize: 12,
                color: '#8892B0',
                marginBottom: 16,
                lineHeight: 18,
              }}>
              {t('importKeyModalHint')}
            </Text>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_500Medium',
                fontSize: 11,
                color: '#A78BFA',
                marginBottom: 6,
              }}>
              {t('importKeyModalNsecLabel')}
            </Text>
            <TextInput
              value={importKeyModalNsec}
              onChangeText={setImportKeyModalNsec}
              placeholder={t('nsecPlaceholder')}
              placeholderTextColor="#4A5568"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!importKeyModalLoading}
              style={{
                backgroundColor: '#070B14',
                borderRadius: 12,
                padding: 14,
                color: '#E2E8F0',
                fontFamily: 'SpaceGrotesk_400Regular',
                marginBottom: 14,
                borderWidth: 1,
                borderColor: 'rgba(232, 121, 249, 0.25)',
              }}
            />
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_500Medium',
                fontSize: 11,
                color: '#A78BFA',
                marginBottom: 6,
              }}>
              {t('importKeyModalPasswordLabel')}
            </Text>
            <TextInput
              value={importKeyModalPassword}
              onChangeText={setImportKeyModalPassword}
              placeholder={t('leepoolAccountPasswordPlaceholder')}
              placeholderTextColor="#4A5568"
              secureTextEntry
              autoCapitalize="none"
              editable={!importKeyModalLoading}
              style={{
                backgroundColor: '#070B14',
                borderRadius: 12,
                padding: 14,
                color: '#E2E8F0',
                fontFamily: 'SpaceGrotesk_400Regular',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(232, 121, 249, 0.25)',
              }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: 'rgba(74, 85, 104, 0.35)' }}
                disabled={importKeyModalLoading}
                onPress={() => {
                  setImportKeyModalVisible(false);
                  setImportKeyModalNsec('');
                  setImportKeyModalPassword('');
                }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: 'rgba(232, 121, 249, 0.2)',
                  borderWidth: 1,
                  borderColor: '#E879F9',
                }}
                disabled={importKeyModalLoading}
                onPress={() => void submitImportKeyWithSeal()}>
                {importKeyModalLoading ? (
                  <ActivityIndicator color="#E879F9" />
                ) : (
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#E879F9' }}>
                    {t('importKeyConfirm')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isExportModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsExportModalVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 24,
              padding: 28,
              width: '100%',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.35)',
              shadowColor: '#EF4444',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 12,
            }}>
            <View className="flex-row items-center gap-2 mb-4">
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_700Bold',
                  fontSize: 14,
                  color: '#EF4444',
                  letterSpacing: 1,
                }}>
                {t('exportKeyTitle').toUpperCase()}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.25)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}>
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_500Medium',
                  fontSize: 12,
                  color: '#FCA5A5',
                  lineHeight: 18,
                }}>
                {t('exportKeyWarning')}
              </Text>
            </View>

            <Text
              className="text-[10px] tracking-[0.25em] mb-2"
              style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
              {t('privateKeyLabel').toUpperCase()}
            </Text>
            <View
              style={{
                backgroundColor: '#070B14',
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(167, 139, 250, 0.2)',
              }}>
              <Text
                selectable
                style={{
                  fontFamily: 'SpaceGrotesk_400Regular',
                  fontSize: 11,
                  color: '#A78BFA',
                  letterSpacing: 0.5,
                  lineHeight: 18,
                }}>
                {nostrKeys?.nsec ?? ''}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                if (nostrKeys?.nsec) {
                  await Clipboard.setStringAsync(nostrKeys.nsec);
                  Alert.alert(t('success'), t('nsecCopied'));
                }
              }}
              style={{
                backgroundColor: 'rgba(167, 139, 250, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(167, 139, 250, 0.4)',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
              <Ionicons name="copy-outline" size={15} color="#A78BFA" />
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  fontSize: 12,
                  color: '#A78BFA',
                  letterSpacing: 2,
                }}>
                {t('copy').toUpperCase()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsExportModalVisible(false)}
              style={{
                backgroundColor: 'rgba(74, 85, 104, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(74, 85, 104, 0.35)',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  fontSize: 12,
                  color: '#8892B0',
                  letterSpacing: 2,
                }}>
                {t('close').toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isQrVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsQrVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 24,
              padding: 32,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.25)',
              shadowColor: '#00E5FF',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 12,
            }}>
            <Text
              className="text-[10px] tracking-[0.3em] mb-5"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
              {t('nostrIdentityLabel').toUpperCase()}
            </Text>

            <View
              style={{
                padding: 16,
                backgroundColor: '#0B0E14',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}>
              <QRCode
                value={nostrKeys?.npub || ''}
                size={220}
                color="#00E5FF"
                backgroundColor="#0B0E14"
              />
            </View>

            <Text
              className="text-[11px] mt-4 mb-6"
              style={{
                fontFamily: 'SpaceGrotesk_500Medium',
                color: '#4A5568',
                letterSpacing: 1,
              }}>
              {nostrKeys ? truncateNpub(nostrKeys.npub) : ''}
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsQrVisible(false)}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.4)',
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 40,
              }}>
              <Text
                className="text-sm tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#EF4444' }}>
                {t('close').toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
