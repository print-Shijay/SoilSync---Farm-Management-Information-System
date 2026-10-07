import React from 'react';
import { View, Text, Image } from 'react-native';
import { Sprout, Leaf, Trees, Flower, Sparkles } from 'lucide-react-native';
import { getCropImageSource } from '../lib/cropIcons';
import { type Crop } from '../lib/crop-planner';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CropAvatarProps {
  crop?: Crop | null;
  cropName?: string | null;
  cropType?: string | null;
  isCustom?: boolean;
  size?: AvatarSize;
  className?: string;
  showPartnerBadge?: boolean;
}

const SIZE_CONFIG: Record<
  AvatarSize,
  {
    containerSize: number;
    iconSize: number;
    badgeSize: number;
    badgeOffset: number;
    textClass: string;
    borderRadius: number;
  }
> = {
  xs: { containerSize: 24, iconSize: 13, badgeSize: 10, badgeOffset: -2, textClass: 'text-[9px]', borderRadius: 12 },
  sm: { containerSize: 32, iconSize: 17, badgeSize: 12, badgeOffset: -2, textClass: 'text-xs', borderRadius: 16 },
  md: { containerSize: 40, iconSize: 22, badgeSize: 14, badgeOffset: -2, textClass: 'text-sm', borderRadius: 20 },
  lg: { containerSize: 48, iconSize: 26, badgeSize: 16, badgeOffset: -1, textClass: 'text-base', borderRadius: 24 },
  xl: { containerSize: 64, iconSize: 34, badgeSize: 20, badgeOffset: 0, textClass: 'text-lg', borderRadius: 32 },
};

export default function CropAvatar({
  crop,
  cropName,
  cropType,
  isCustom,
  size = 'md',
  className = '',
  showPartnerBadge = true,
}: CropAvatarProps) {
  const resolvedName = crop?.crop || cropName || 'Unknown Crop';
  const resolvedType = (crop?.type || cropType || '').toLowerCase();
  const isPartnerCrop = isCustom ?? crop?.is_custom ?? false;
  const imageSource = getCropImageSource(resolvedName);

  const config = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  // Determine fallback icon & theme color based on crop category
  const renderFallbackIcon = () => {
    const iconColor = isPartnerCrop ? '#8C4522' : '#8C7C70';
    const normalizedName = resolvedName.toLowerCase();

    if (resolvedType.includes('leaf') || normalizedName.includes('lettuce') || normalizedName.includes('pechay') || normalizedName.includes('kangkong')) {
      return <Leaf size={config.iconSize} color={iconColor} strokeWidth={2.2} />;
    }
    if (resolvedType.includes('fruit') || resolvedType.includes('flower') || normalizedName.includes('tomato') || normalizedName.includes('cucumber')) {
      return <Flower size={config.iconSize} color={isPartnerCrop ? '#8C4522' : '#8C7C70'} strokeWidth={2.2} />;
    }
    if (resolvedType.includes('herb') || normalizedName.includes('basil') || normalizedName.includes('mint') || normalizedName.includes('rosemary')) {
      return <Sparkles size={config.iconSize} color={isPartnerCrop ? '#8C4522' : '#8C7C70'} strokeWidth={2.2} />;
    }
    if (resolvedType.includes('tree') || resolvedType.includes('perennial')) {
      return <Trees size={config.iconSize} color={iconColor} strokeWidth={2.2} />;
    }

    return <Sprout size={config.iconSize} color={iconColor} strokeWidth={2.3} />;
  };

  return (
    <View
      style={{ width: config.containerSize, height: config.containerSize }}
      className={`relative items-center justify-center ${className}`}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={{
            width: config.containerSize,
            height: config.containerSize,
            borderRadius: config.borderRadius,
          }}
          className="border border-taupe/20 bg-champagne"
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: config.containerSize,
            height: config.containerSize,
            borderRadius: config.borderRadius,
          }}
          className={`items-center justify-center border shadow-xs ${
            isPartnerCrop
              ? 'border-cognac/40 bg-champagne'
              : 'border-taupe/30 bg-champagne/80'
          }`}>
          {renderFallbackIcon()}
        </View>
      )}

      {/* Partner Custom Badge */}
      {isPartnerCrop && showPartnerBadge && (
        <View
          style={{
            position: 'absolute',
            bottom: config.badgeOffset,
            right: config.badgeOffset,
            width: config.badgeSize,
            height: config.badgeSize,
            borderRadius: config.badgeSize / 2,
          }}
          className="items-center justify-center border border-white bg-cognac shadow-xs">
          <Text style={{ fontSize: config.badgeSize * 0.6 }} className="font-bold text-white leading-none">
            ★
          </Text>
        </View>
      )}
    </View>
  );
}
