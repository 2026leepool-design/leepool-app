import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Shared LeePool medallion so the intro animation and login header stay identical. */
export function LeePoolMedallion({ size, radius = 18, style }: Props) {
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }, style]}>
      <Image
        source={require('../assets/images/android-icon-foreground.png')}
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
});
