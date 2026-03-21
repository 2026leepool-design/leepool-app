import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** Eski /synopsis?id= derin bağlantıları → /book/[id] */
export default function SynopsisRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) {
    return null;
  }
  return <Redirect href={`/book/${id}` as Href} />;
}
