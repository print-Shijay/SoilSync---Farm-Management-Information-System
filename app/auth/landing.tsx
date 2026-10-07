import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  StatusBar,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width - insets.left - insets.right, 480);
  const horizontalPadding = Math.max(16, Math.min(28, (contentWidth - 280) / 4));
  const compact = height - insets.top - insets.bottom < 700;
  const headingSize = Math.max(22, Math.min(24, contentWidth / 16));

  return (
    <ImageBackground
      source={require('../../assets/loading-background.png')}
      style={styles.fullBackground}
      resizeMode="cover">
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.75)']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Keep the card at the bottom when it fits; scroll on short screens or with larger text. */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.bottomCardContainer,
              {
                paddingHorizontal: horizontalPadding,
                paddingBottom: Math.max(compact ? 24 : 32, insets.bottom + 16),
                paddingTop: compact ? 24 : 32,
              },
            ]}>
            {/* Brand Name */}
            <Text style={styles.brandName}>SOILSYNC</Text>

            {/* Main Heading */}
            <Text
              style={[styles.mainHeading, { fontSize: headingSize, lineHeight: headingSize + 8 }]}>
              Your AI-Powered Organic Farming Companion
            </Text>

            {/* Subtext */}
            <Text style={[styles.subtext, { marginBottom: compact ? 20 : 26 }]}>
              Organize your farm workflow and track daily operations in one seamless app.
            </Text>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.85}
              accessibilityRole="button">
              <Text style={styles.actionButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fullBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  bottomCardContainer: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(251, 248, 244, 0.97)',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    shadowColor: '#1C120C',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  brandName: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
    color: '#8C4522',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 10,
  },
  mainHeading: {
    fontWeight: '900',
    color: '#1C120C',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: '#8C7C70',
    textAlign: 'center',
    lineHeight: 21,
  },
  actionButton: {
    width: '100%',
    backgroundColor: '#8C4522',
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
