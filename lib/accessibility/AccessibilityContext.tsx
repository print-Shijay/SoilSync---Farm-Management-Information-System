import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerHaptic as runHaptic, HapticType } from './haptics';

export type TextSizeOption = 'standard' | 'large' | 'extra-large';

export interface AccessibilitySettings {
  textSize: TextSizeOption;
  highContrast: boolean;
  colorblindSafe: boolean;
  gloveMode: boolean;
  hapticFeedback: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  textSize: 'standard',
  highContrast: false,
  colorblindSafe: false,
  gloveMode: false,
  hapticFeedback: true,
  reduceMotion: false,
};

const STORAGE_KEY = '@soilsync_accessibility_settings';

export interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  fontScale: number;
  isHighContrast: boolean;
  isColorblindSafe: boolean;
  isGloveMode: boolean;
  isHapticsEnabled: boolean;
  isReduceMotion: boolean;
  setTextSize: (size: TextSizeOption) => Promise<void>;
  setHighContrast: (enabled: boolean) => Promise<void>;
  setColorblindSafe: (enabled: boolean) => Promise<void>;
  setGloveMode: (enabled: boolean) => Promise<void>;
  setHapticFeedback: (enabled: boolean) => Promise<void>;
  setReduceMotion: (enabled: boolean) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  triggerHaptic: (type?: HapticType) => void;
}

const DEFAULT_CONTEXT_VALUE: AccessibilityContextValue = {
  settings: DEFAULT_ACCESSIBILITY_SETTINGS,
  fontScale: 1.0,
  isHighContrast: false,
  isColorblindSafe: false,
  isGloveMode: false,
  isHapticsEnabled: true,
  isReduceMotion: false,
  setTextSize: async () => {},
  setHighContrast: async () => {},
  setColorblindSafe: async () => {},
  setGloveMode: async () => {},
  setHapticFeedback: async () => {},
  setReduceMotion: async () => {},
  resetToDefaults: async () => {},
  triggerHaptic: () => {},
};

const AccessibilityContext = createContext<AccessibilityContextValue>(DEFAULT_CONTEXT_VALUE);

const FONT_SCALE_MAP: Record<TextSizeOption, number> = {
  standard: 1.0,
  large: 1.2,
  'extra-large': 1.38,
};

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY_SETTINGS);

  // Hydrate settings from AsyncStorage on app launch
  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      } catch (err) {
        // Safe fallback: Keep default settings if storage fails
        console.warn('Failed to load accessibility settings, falling back to defaults:', err);
      }
    }

    void loadSettings();
  }, []);

  const saveSettings = useCallback(async (newSettings: AccessibilitySettings) => {
    try {
      setSettings(newSettings);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (err) {
      console.warn('Failed to persist accessibility settings:', err);
    }
  }, []);

  const triggerHaptic = useCallback(
    (type: HapticType = 'selection') => {
      runHaptic(type, settings.hapticFeedback);
    },
    [settings.hapticFeedback]
  );

  const setTextSize = useCallback(
    async (textSize: TextSizeOption) => {
      triggerHaptic('selection');
      await saveSettings({ ...settings, textSize });
    },
    [settings, saveSettings, triggerHaptic]
  );

  const setHighContrast = useCallback(
    async (highContrast: boolean) => {
      triggerHaptic('selection');
      await saveSettings({ ...settings, highContrast });
    },
    [settings, saveSettings, triggerHaptic]
  );

  const setColorblindSafe = useCallback(
    async (colorblindSafe: boolean) => {
      triggerHaptic('selection');
      await saveSettings({ ...settings, colorblindSafe });
    },
    [settings, saveSettings, triggerHaptic]
  );

  const setGloveMode = useCallback(
    async (gloveMode: boolean) => {
      triggerHaptic('selection');
      await saveSettings({ ...settings, gloveMode });
    },
    [settings, saveSettings, triggerHaptic]
  );

  const setHapticFeedback = useCallback(
    async (hapticFeedback: boolean) => {
      // Give a tactile pulse when enabling so the farmer feels it immediately
      if (hapticFeedback) {
        runHaptic('medium', true);
      }
      await saveSettings({ ...settings, hapticFeedback });
    },
    [settings, saveSettings]
  );

  const setReduceMotion = useCallback(
    async (reduceMotion: boolean) => {
      triggerHaptic('selection');
      await saveSettings({ ...settings, reduceMotion });
    },
    [settings, saveSettings, triggerHaptic]
  );

  const resetToDefaults = useCallback(async () => {
    triggerHaptic('medium');
    await saveSettings(DEFAULT_ACCESSIBILITY_SETTINGS);
  }, [saveSettings, triggerHaptic]);

  const fontScale = useMemo(() => FONT_SCALE_MAP[settings.textSize] || 1.0, [settings.textSize]);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      settings,
      fontScale,
      isHighContrast: settings.highContrast,
      isColorblindSafe: settings.colorblindSafe,
      isGloveMode: settings.gloveMode,
      isHapticsEnabled: settings.hapticFeedback,
      isReduceMotion: settings.reduceMotion,
      setTextSize,
      setHighContrast,
      setColorblindSafe,
      setGloveMode,
      setHapticFeedback,
      setReduceMotion,
      resetToDefaults,
      triggerHaptic,
    }),
    [
      settings,
      fontScale,
      setTextSize,
      setHighContrast,
      setColorblindSafe,
      setGloveMode,
      setHapticFeedback,
      setReduceMotion,
      resetToDefaults,
      triggerHaptic,
    ]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
};

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  return context || DEFAULT_CONTEXT_VALUE;
}
