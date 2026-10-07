import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface AuthFormLayoutProps {
  children: React.ReactNode;
  title: string;
  showLogos?: boolean;
}

/** Shared, density-independent layout for login and registration. */
export function AuthFormLayout({ children, title, showLogos = false }: AuthFormLayoutProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(width - insets.left - insets.right, 480);
  const horizontalPadding = Math.max(16, Math.min(28, (contentWidth - 280) / 4));
  // Short windows compact decoration and spacing, never the form's readable text.
  const compact = height - insets.top - insets.bottom < 700;
  const verticalPadding = compact ? 16 : 24;
  const titleSize = Math.max(22, Math.min(24, contentWidth / 16));
  const logoSize = compact ? 52 : Math.max(56, Math.min(72, contentWidth / 5));

  return (
    <SafeAreaView style={layoutStyles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        style={layoutStyles.container}
        contentContainerStyle={layoutStyles.scrollContent}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            layoutStyles.hero,
            { paddingHorizontal: horizontalPadding, paddingVertical: verticalPadding },
          ]}>
          {showLogos && (
            <View style={[layoutStyles.logos, { marginBottom: verticalPadding }]}>
              {[
                require('../../assets/images/1.png'),
                require('../../assets/images/2.png'),
                require('../../assets/images/3.png'),
              ].map((source, index) => (
                <Image
                  key={index}
                  source={source}
                  style={{ width: logoSize, height: logoSize }}
                  resizeMode="contain"
                  resizeMethod="resize"
                />
              ))}
            </View>
          )}
          <Text
            style={[layoutStyles.heroTitle, { fontSize: titleSize, lineHeight: titleSize + 8 }]}>
            {title}
          </Text>
        </View>
        <View
          style={[
            layoutStyles.card,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: verticalPadding,
              paddingBottom: Math.max(verticalPadding, insets.bottom + 16),
            },
          ]}>
          {children}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const layoutStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  hero: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  logos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: 'rgba(251, 248, 244, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#1C120C',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
});

// Keep text sizes consistent across screens and leave system font scaling enabled.
// Minimum heights let controls grow with larger accessibility text.
export const authFormStyles = StyleSheet.create({
  sheetTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#1C120C',
    textAlign: 'center',
    marginBottom: 4,
  },
  toggleLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleLinkSubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: '#8C7C70',
    textAlign: 'center',
    flexShrink: 1,
  },
  toggleLinkCognac: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#8C4522' },
  textLinkButton: { minHeight: 44, justifyContent: 'center' },
  formSection: { gap: 12, marginBottom: 14 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(28, 18, 12, 0.08)',
  },
  leftIcon: { marginRight: 10 },
  textInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: '#1C120C',
    paddingVertical: 12,
  },
  passwordInput: { paddingRight: 4 },
  rightIconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#8C7C70',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: { backgroundColor: '#8C4522', borderColor: '#8C4522' },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#8C4522',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(28, 18, 12, 0.08)' },
  dividerText: {
    flexShrink: 1,
    marginHorizontal: 10,
    fontSize: 13,
    lineHeight: 18,
    color: '#8C7C70',
    fontWeight: '600',
    textAlign: 'center',
  },
  googleButton: {
    width: '100%',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28, 18, 12, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleButtonText: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: '#1C120C',
    textAlign: 'center',
  },
  termsLinkText: {
    fontWeight: '700',
    color: '#8C4522',
    textDecorationLine: 'underline',
  },
  googleLegalText: {
    fontSize: 13,
    color: '#8C7C70',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 14,
  },
});
