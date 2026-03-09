import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

type BarcodeScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onScan: (isbn: string) => void;
};

export function BarcodeScannerModal({ visible, onClose, onScan }: BarcodeScannerModalProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const processed = useRef(false);

  const handleBarcodeScanned = useCallback(
    ({ data }: { type: string; data: string }) => {
      if (processed.current || !data?.trim()) return;
      processed.current = true;
      onClose();
      setScanned(true);
      onScan(data.trim());
    },
    [onClose, onScan]
  );

  const handleOpen = useCallback(async () => {
    processed.current = false;
    setScanned(false);
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(t('error'), t('cameraPermission'), [{ text: t('cancel') }]);
        onClose();
      }
    }
  }, [permission, requestPermission, onClose, t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={handleOpen}
      onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'ean13', 'ean8'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />
            <View
              className="absolute left-0 right-0 bottom-0 px-4 py-6"
              style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
              <View className="flex-row items-center justify-center gap-2 mb-3">
                <Ionicons name="barcode-outline" size={20} color="#00E5FF" />
                <Text
                  className="text-[#00E5FF] text-xs tracking-widest"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('scanBarcode').toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: '#00E5FF' }}
                onPress={onClose}>
                <Text
                  className="text-[#00E5FF] text-sm"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons name="camera-outline" size={64} color="#4A5568" />
            <Text
              className="text-[#8892B0] text-sm text-center mt-4"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('cameraPermission')}
            </Text>
            <TouchableOpacity
              onPress={() => requestPermission()}
              className="mt-4 rounded-xl py-3 px-6"
              style={{ backgroundColor: '#00E5FF' }}>
              <Text
                className="text-[#0A0F1A] text-sm"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {t('confirm')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} className="mt-4">
              <Text className="text-[#8892B0] text-xs" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
