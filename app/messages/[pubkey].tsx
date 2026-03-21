import { useLocalSearchParams } from 'expo-router';
import { P2PChatView } from '@/components/P2PChatView';

export default function MessagesThreadScreen() {
  const { pubkey } = useLocalSearchParams<{ pubkey: string }>();
  const raw = typeof pubkey === 'string' ? pubkey : '';
  const peerNpub = raw ? decodeURIComponent(raw) : '';
  return <P2PChatView peerNpub={peerNpub} />;
}
