import { useState, useCallback } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/utils/supabase';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [defaultLightningWallet, setDefaultLightningWallet] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadProfile() {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!isMounted || !user) return;
          setEmail(user.email ?? '');
          setDisplayName(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '');
          const ln = user.user_metadata?.default_lightning_address;
          setDefaultLightningWallet(typeof ln === 'string' ? ln : '');
        } catch {
          // silently fail
        } finally {
          if (isMounted) setLoading(false);
        }
      }
      loadProfile();
      return () => { isMounted = false; };
    }, [])
  );

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim(),
          default_lightning_address: defaultLightningWallet.trim(),
        },
      });
      if (error) throw error;
      Alert.alert(t('success'), t('profileUpdated'));
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t('error'), t('passwordTooShort'));
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert(t('success'), t('passwordUpdated'));
    } catch (err: any) {
      Alert.alert(t('error'), err.message ?? String(err));
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00E5FF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0F1A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3 border-b"
          style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#00E5FF" />
          </TouchableOpacity>
          <Text
            className="text-[#00E5FF] text-sm tracking-widest flex-1"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('profileTitle').toUpperCase()}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ── Account Info ── */}
          <SectionCard title={t('accountInfo')} icon="person-outline" color="#00E5FF">
            <FieldLabel>{t('emailPlaceholder')}</FieldLabel>
            <View
              className="rounded-xl px-4 py-3 mb-4"
              style={{
                backgroundColor: '#0A0F1A',
                borderWidth: 1,
                borderColor: 'rgba(136, 146, 176, 0.15)',
              }}>
              <Text
                className="text-[#4A5568] text-sm"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {email}
              </Text>
            </View>

            <FieldLabel>{t('displayName')}</FieldLabel>
            <CyberInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t('displayNamePlaceholder')}
              accent="#00E5FF"
            />

            <FieldLabel>{t('defaultLightningWallet')}</FieldLabel>
            <CyberInput
              value={defaultLightningWallet}
              onChangeText={setDefaultLightningWallet}
              placeholder={t('defaultLightningWalletPlaceholder')}
              accent="#00E5FF"
            />
            <Text
              className="text-[#5A6578] text-[10px] mb-4 leading-4"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('defaultLightningWalletHint')}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSaveProfile}
              disabled={saving}
              className="rounded-2xl py-4 items-center mt-0"
              style={{
                backgroundColor: saving ? 'rgba(0, 229, 255, 0.5)' : 'rgba(0, 229, 255, 0.15)',
                borderWidth: 1,
                borderColor: '#00E5FF',
              }}>
              {saving ? (
                <ActivityIndicator size="small" color="#00E5FF" />
              ) : (
                <Text
                  className="text-[#00E5FF] text-sm tracking-widest"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {t('saveProfile').toUpperCase()}
                </Text>
              )}
            </TouchableOpacity>
          </SectionCard>

          {/* ── Change Password ── */}
          <SectionCard title={t('changePassword')} icon="lock-closed-outline" color="#A855F7">
            <FieldLabel>{t('newPassword')}</FieldLabel>
            <CyberInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('newPasswordPlaceholder')}
              secureTextEntry
              accent="#A855F7"
            />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleChangePassword}
              disabled={changingPassword}
              className="rounded-2xl py-4 items-center mt-4"
              style={{
                backgroundColor: changingPassword ? 'rgba(168, 85, 247, 0.5)' : 'rgba(168, 85, 247, 0.15)',
                borderWidth: 1,
                borderColor: '#A855F7',
              }}>
              {changingPassword ? (
                <ActivityIndicator size="small" color="#A855F7" />
              ) : (
                <Text
                  className="text-[#E879F9] text-sm tracking-widest"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {t('updatePassword').toUpperCase()}
                </Text>
              )}
            </TouchableOpacity>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function SectionCard({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-2xl p-5 mb-5"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: `${color}22`,
      }}>
      <View className="flex-row items-center gap-2 mb-4">
        <Ionicons name={icon} size={14} color={color} />
        <Text
          className="text-[10px] tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_700Bold', color }}>
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
      style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
      {String(children)}
    </Text>
  );
}

function CyberInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  accent = '#00E5FF',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
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
      autoCapitalize="none"
      autoCorrect={false}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="rounded-xl px-4 py-3 mb-4 text-sm"
      style={{
        backgroundColor: '#0A0F1A',
        borderWidth: 1,
        borderColor: focused ? accent : 'rgba(136, 146, 176, 0.2)',
        fontFamily: 'SpaceGrotesk_400Regular',
        color: '#E2E8F0',
      }}
    />
  );
}
