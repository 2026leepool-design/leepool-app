import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

const PICKER_OPTS = {
  allowsEditing: true as const,
  quality: 0.5,
  base64: true,
};

export async function pickCoverFromCamera(
  onPermissionDenied: () => void
): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    onPermissionDenied();
    return null;
  }
  const result = await ImagePicker.launchCameraAsync(PICKER_OPTS);
  if (result.canceled || !result.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${result.assets[0].base64}`;
}

export async function pickCoverFromGallery(
  onPermissionDenied: () => void
): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    onPermissionDenied();
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTS);
  if (result.canceled || !result.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${result.assets[0].base64}`;
}

export function showCoverPickerAlert(
  t: (k: string) => string,
  onCamera: () => void,
  onGallery: () => void
) {
  Alert.alert(t('photoOptions'), '', [
    { text: t('cancel'), style: 'cancel' },
    { text: t('takePhoto'), onPress: onCamera },
    { text: t('chooseGallery'), onPress: onGallery },
  ]);
}
