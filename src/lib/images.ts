import type { ImageURISource } from 'react-native';

export function cachedImageSource(uri?: string | null): ImageURISource | undefined {
  if (!uri) return undefined;
  return { uri, cache: 'force-cache' };
}
