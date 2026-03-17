import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Expo Go'da mıyız kontrolünü en tepeye, global bir değişkene alıyoruz
const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

// Bildirim dinleyicisini SADECE Expo Go'da DEĞİLSEK başlatıyoruz!
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

  try {
    // 1. Kesin Expo Go Kontrolü
    if (isExpoGo) {
      console.log('Expo Go Tespit Edildi: Push Notification testleri için APK kullanın.');
      return null;
    }

    // 2. Fiziksel Cihaz Kontrolü
    if (!Device.isDevice) {
      console.log('Push Notifications sadece fiziksel cihazlarda çalışır.');
      return null;
    }

    // 3. Android İçin Özel Kanal
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00E5FF', 
      });
    }

    // 4. İzin Kontrolü
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Sistem Uyarı: Kullanıcı bildirim iznini reddetti.');
      return null;
    }

    // 5. Token Alma (EAS Project ID ile)
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('Uyarı: Project ID bulunamadı. eas.json yapılandırmanızı kontrol edin.');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    token = tokenData.data;

  } catch (error) {
    console.error('Push Token üretilirken Matrix bir hata ile karşılaştı:', error);
  }

  return token;
}