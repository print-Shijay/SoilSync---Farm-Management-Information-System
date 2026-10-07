import { ImageSourcePropType } from 'react-native';
import { supabase } from './supabase';

/**
 * Interface representing a preset avatar option.
 */
export interface PresetProfileIcon {
  id: string;
  filename: string;
  label: string;
  url: string;
  localSource: ImageSourcePropType;
}

/**
 * Bundled local PNG avatar assets for 100% guaranteed native decoding across all Android & iOS devices.
 */
export const LOCAL_AVATAR_SOURCES: Record<string, ImageSourcePropType> = {
  avatar_1: require('../assets/images/avatars/avatar_1.png'),
  avatar_2: require('../assets/images/avatars/avatar_2.png'),
  avatar_3: require('../assets/images/avatars/avatar_3.png'),
  avatar_4: require('../assets/images/avatars/avatar_4.png'),
  avatar_5: require('../assets/images/avatars/avatar_5.png'),
  avatar_6: require('../assets/images/avatars/avatar_6.png'),
  avatar_7: require('../assets/images/avatars/avatar_7.png'),
  avatar_8: require('../assets/images/avatars/avatar_8.png'),
  avatar_9: require('../assets/images/avatars/avatar_9.png'),
  avatar_10: require('../assets/images/avatars/avatar_10.png'),
  avatar_fallback_pixel: require('../assets/images/avatars/avatar_fallback_pixel.png'),
};

export const PIXEL_FALLBACK_AVATAR: ImageSourcePropType = require('../assets/images/avatars/avatar_fallback_pixel.png');

/**
 * Base Supabase storage URL resolver for the 'profile-icons' bucket.
 */
export function getProfileIconPublicUrl(filename: string): string {
  try {
    const { data } = supabase.storage.from('profile-icons').getPublicUrl(filename);
    if (data?.publicUrl) {
      return data.publicUrl;
    }
  } catch (err) {
    console.warn('[ProfileIcons] getPublicUrl error:', err);
  }

  const rawSupabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    (supabase as any)?.supabaseUrl ||
    'https://lhliufagsrbkdpmfltiw.supabase.co';
  const baseUrl = rawSupabaseUrl.replace(/\/+$/, '');
  return `${baseUrl}/storage/v1/object/public/profile-icons/${filename}`;
}

/**
 * 10 Preset Profile Icons with Supabase Cloud URLs (for DB storage)
 * and bundled local PNGs (for 100% guaranteed, instant rendering).
 */
export const PRESET_PROFILE_ICONS: PresetProfileIcon[] = [
  {
    id: 'avatar_1',
    filename: 'avatar_1.webp',
    label: 'Avatar 1',
    url: getProfileIconPublicUrl('avatar_1.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_1'],
  },
  {
    id: 'avatar_2',
    filename: 'avatar_2.webp',
    label: 'Avatar 2',
    url: getProfileIconPublicUrl('avatar_2.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_2'],
  },
  {
    id: 'avatar_3',
    filename: 'avatar_3.webp',
    label: 'Avatar 3',
    url: getProfileIconPublicUrl('avatar_3.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_3'],
  },
  {
    id: 'avatar_4',
    filename: 'avatar_4.webp',
    label: 'Avatar 4',
    url: getProfileIconPublicUrl('avatar_4.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_4'],
  },
  {
    id: 'avatar_5',
    filename: 'avatar_5.webp',
    label: 'Avatar 5',
    url: getProfileIconPublicUrl('avatar_5.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_5'],
  },
  {
    id: 'avatar_6',
    filename: 'avatar_6.webp',
    label: 'Avatar 6',
    url: getProfileIconPublicUrl('avatar_6.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_6'],
  },
  {
    id: 'avatar_7',
    filename: 'avatar_7.webp',
    label: 'Avatar 7',
    url: getProfileIconPublicUrl('avatar_7.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_7'],
  },
  {
    id: 'avatar_8',
    filename: 'avatar_8.webp',
    label: 'Avatar 8',
    url: getProfileIconPublicUrl('avatar_8.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_8'],
  },
  {
    id: 'avatar_9',
    filename: 'avatar_9.webp',
    label: 'Avatar 9',
    url: getProfileIconPublicUrl('avatar_9.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_9'],
  },
  {
    id: 'avatar_10',
    filename: 'avatar_10.webp',
    label: 'Avatar 10',
    url: getProfileIconPublicUrl('avatar_10.webp'),
    localSource: LOCAL_AVATAR_SOURCES['avatar_10'],
  },
];

/**
 * Resolves the active avatar URL for database storage and cross-device sync.
 */
export function resolveUserAvatarUrl(
  profileIconUrl?: string | null,
  avatarUrl?: string | null
): string {
  if (profileIconUrl && profileIconUrl.trim().length > 0) {
    return profileIconUrl;
  }
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return avatarUrl;
  }
  return PRESET_PROFILE_ICONS[0].url;
}

/**
 * Resolves the Image source (either bundled local PNG or remote URI object)
 * for 100% reliable rendering on React Native.
 */
export function getAvatarImageSource(
  profileIconUrl?: string | null,
  avatarUrl?: string | null
): ImageSourcePropType {
  const active = (profileIconUrl || '').trim();
  if (active) {
    const cleanFilename = active.split('?')[0].split('/').pop() || '';
    for (let i = 1; i <= 10; i++) {
      const key = `avatar_${i}`;
      if (
        cleanFilename === `${key}.webp` ||
        cleanFilename === `${key}.png` ||
        cleanFilename === key ||
        active === getProfileIconPublicUrl(`${key}.webp`)
      ) {
        return LOCAL_AVATAR_SOURCES[key];
      }
    }
    // Remote custom URL
    return { uri: active };
  }

  // Fallback to Google avatar if available
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return { uri: avatarUrl };
  }

  return PIXEL_FALLBACK_AVATAR;
}

