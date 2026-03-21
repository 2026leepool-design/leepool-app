/**
 * Web'de expo-secure-store güvenilir çalışmaz; localStorage kullanılır.
 * iOS/Android'de SecureStore kullanılır.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function isWeb(): boolean {
  return Platform.OS === 'web';
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.error('[platformSecureStorage] setItem', key, e);
      throw e;
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function secureGetItem(key: string): Promise<string | null> {
  if (isWeb()) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      console.error('[platformSecureStorage] getItem', key, e);
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function secureDeleteItem(key: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.error('[platformSecureStorage] removeItem', key, e);
      throw e;
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
