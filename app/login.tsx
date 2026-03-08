import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { generateAndSaveKeys, importNsecKey } from '@/utils/nostr';

type Tab = 'classic' | 'web3';

function CyberInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  accent = '#00E5FF',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  accent?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#3A4560"
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? 'none'}
      autoCorrect={false}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        backgroundColor: '#0D1525',
        borderWidth: 1,
        borderColor: focused ? accent : 'rgba(136, 146, 176, 0.2)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#E2E8F0',
        fontFamily: 'SpaceGrotesk_400Regular',
        fontSize: 14,
        shadowColor: focused ? accent : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: focused ? 0.4 : 0,
        shadowRadius: 8,
        elevation: focused ? 4 : 0,
      }}
    />
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('classic');

  // Classic
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classicLoading, setClassicLoading] = useState(false);

  // Web3
  const [nsecInput, setNsecInput] = useState('');
  const [web3Loading, setWeb3Loading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const navigateIn = () => router.replace('/(tabs)/dashboard');

  // ─── Supabase Login ─────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setClassicLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigateIn();
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setClassicLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setClassicLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      Alert.alert(t('success'), t('signUpSuccess'));
      navigateIn();
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setClassicLoading(false);
    }
  };

  // ─── Nostr Import ────────────────────────────────────────────────────────────
  const handleImportNsec = async () => {
    if (!nsecInput.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setWeb3Loading(true);
    try {
      await importNsecKey(nsecInput.trim());
      navigateIn();
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setWeb3Loading(false);
    }
  };

  // ─── Nostr Generate ──────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      await generateAndSaveKeys();
      navigateIn();
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setGenerateLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0F1A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ── Logo ── */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                backgroundColor: 'rgba(0, 229, 255, 0.10)',
                borderWidth: 1,
                borderColor: '#00E5FF',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                shadowColor: '#00E5FF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 20,
                elevation: 8,
              }}>
              <Text style={{ fontSize: 36 }}>📚</Text>
            </View>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                fontSize: 26,
                letterSpacing: 8,
                color: '#00E5FF',
                textShadowColor: 'rgba(0, 229, 255, 0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 12,
              }}>
              LEEPOOL
            </Text>
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_400Regular',
                fontSize: 10,
                letterSpacing: 4,
                color: '#4A5568',
                marginTop: 4,
              }}>
              {t('management')}
            </Text>
          </View>

          {/* ── Tab Switcher ── */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#131B2B',
              borderRadius: 14,
              padding: 4,
              marginBottom: 28,
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.1)',
            }}>
            {(['classic', 'web3'] as Tab[]).map((t_) => {
              const active = tab === t_;
              const label = t_ === 'classic' ? t('tabClassic') : 'Web3';
              return (
                <TouchableOpacity
                  key={t_}
                  onPress={() => setTab(t_)}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: active ? 'rgba(0, 229, 255, 0.18)' : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? '#00E5FF' : 'transparent',
                  }}>
                  <Text
                    style={{
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      fontSize: 12,
                      letterSpacing: 2,
                      color: active ? '#00E5FF' : '#4A5568',
                    }}>
                    {label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ─────────── CLASSIC TAB ─────────── */}
          {tab === 'classic' && (
            <View style={{ gap: 14 }}>
              <CyberInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('emailPlaceholder')}
                keyboardType="email-address"
              />
              <CyberInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('passwordPlaceholder')}
                secureTextEntry
              />

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSignIn}
                disabled={classicLoading}
                style={{
                  backgroundColor: '#00E5FF',
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 6,
                  opacity: classicLoading ? 0.7 : 1,
                }}>
                {classicLoading ? (
                  <ActivityIndicator size="small" color="#0A0F1A" />
                ) : (
                  <Text
                    style={{
                      fontFamily: 'SpaceGrotesk_700Bold',
                      fontSize: 13,
                      letterSpacing: 3,
                      color: '#0A0F1A',
                    }}>
                    {t('signIn').toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSignUp}
                disabled={classicLoading}
                style={{
                  backgroundColor: 'transparent',
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.35)',
                }}>
                <Text
                  style={{
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    fontSize: 13,
                    letterSpacing: 3,
                    color: '#00E5FF',
                  }}>
                  {t('signUp').toUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─────────── WEB3 TAB ─────────── */}
          {tab === 'web3' && (
            <View style={{ gap: 14 }}>
              {/* nsec import */}
              <View
                style={{
                  backgroundColor: '#131B2B',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(168, 85, 247, 0.2)',
                  gap: 12,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ionicons name="key-outline" size={16} color="#A855F7" />
                  <Text
                    style={{
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      fontSize: 10,
                      letterSpacing: 3,
                      color: '#A855F7',
                    }}>
                    {t('importNsec').toUpperCase()}
                  </Text>
                </View>
                <CyberInput
                  value={nsecInput}
                  onChangeText={setNsecInput}
                  placeholder="nsec1..."
                  accent="#A855F7"
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleImportNsec}
                  disabled={web3Loading}
                  style={{
                    backgroundColor: 'rgba(168, 85, 247, 0.18)',
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#A855F7',
                    opacity: web3Loading ? 0.7 : 1,
                  }}>
                  {web3Loading ? (
                    <ActivityIndicator size="small" color="#A855F7" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: 'SpaceGrotesk_700Bold',
                        fontSize: 12,
                        letterSpacing: 3,
                        color: '#E879F9',
                      }}>
                      {t('importKey').toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0, 229, 255, 0.12)' }} />
                <Text
                  style={{
                    fontFamily: 'SpaceGrotesk_400Regular',
                    fontSize: 10,
                    letterSpacing: 2,
                    color: '#4A5568',
                  }}>
                  {t('orDivider')}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0, 229, 255, 0.12)' }} />
              </View>

              {/* Generate anonymous identity */}
              <View
                style={{
                  backgroundColor: '#131B2B',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.15)',
                  gap: 12,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Ionicons name="flash-outline" size={16} color="#00E5FF" />
                  <Text
                    style={{
                      fontFamily: 'SpaceGrotesk_400Regular',
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#8892B0',
                    }}>
                    {t('anonymousHint')}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleGenerate}
                  disabled={generateLoading}
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.12)',
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#00E5FF',
                    opacity: generateLoading ? 0.7 : 1,
                  }}>
                  {generateLoading ? (
                    <ActivityIndicator size="small" color="#00E5FF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: 'SpaceGrotesk_700Bold',
                        fontSize: 12,
                        letterSpacing: 3,
                        color: '#00E5FF',
                      }}>
                      {t('generateIdentity').toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
