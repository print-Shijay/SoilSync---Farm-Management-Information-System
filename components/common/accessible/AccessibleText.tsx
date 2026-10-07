import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useAccessibility } from '../../../lib/accessibility';

export interface AccessibleTextProps extends TextProps {
  /** Base font size before scaling. Defaults to 14 if not inferred from style */
  baseFontSize?: number;
  /** Optional override to disable scaling for this specific element */
  disableScale?: boolean;
}

/**
 * AccessibleText is a drop-in replacement for React Native Text.
 * It automatically applies the farmer's chosen font scaling (Standard: 1.0x, Large: 1.15x, Extra Large: 1.30x)
 * and boosts contrast when Outdoor High-Contrast Mode is enabled.
 * If fontScale is 1.0 (default), it renders identically to standard Text.
 */
export const AccessibleText: React.FC<AccessibleTextProps> = ({
  children,
  style,
  baseFontSize,
  disableScale = false,
  ...props
}) => {
  const { fontScale, isHighContrast } = useAccessibility();

  // If scaling is disabled or at standard default (1.0x) and no high-contrast boost needed, pass through cleanly
  if (disableScale && !isHighContrast) {
    return (
      <Text style={style} {...props}>
        {children}
      </Text>
    );
  }

  // Flatten incoming style to inspect existing fontSize
  const flatStyle = StyleSheet.flatten(style) || {};
  const currentFontSize = baseFontSize ?? flatStyle.fontSize ?? 14;
  const currentLineHeight = flatStyle.lineHeight ?? Math.round(currentFontSize * 1.35);

  const scaledFontSize = disableScale ? currentFontSize : Math.round(currentFontSize * fontScale);
  const scaledLineHeight = disableScale ? currentLineHeight : Math.round(currentLineHeight * fontScale);

  const dynamicStyle = {
    ...flatStyle,
    fontSize: scaledFontSize,
    lineHeight: scaledLineHeight,
    ...(isHighContrast && !flatStyle.color ? { color: '#000000' } : {}),
  };

  return (
    <Text style={dynamicStyle} {...props}>
      {children}
    </Text>
  );
};
