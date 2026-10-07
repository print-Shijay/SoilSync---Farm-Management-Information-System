import { Vibration, Platform } from 'react-native';

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'buttonPress'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Triggers safe tactile feedback via React Native's built-in Vibration API.
 * Guaranteed to never crash even on devices without a vibrator or if permissions are restricted.
 */
export function triggerHaptic(type: HapticType = 'selection', isEnabled = true): void {
  if (!isEnabled) return;

  try {
    switch (type) {
      case 'selection':
      case 'light':
        // Quick subtle tap
        Vibration.vibrate(Platform.OS === 'android' ? 12 : 15);
        break;

      case 'buttonPress':
      case 'medium':
      case 'success':
        // Noticeable confirmation pulse
        Vibration.vibrate(Platform.OS === 'android' ? 28 : 30);
        break;

      case 'heavy':
        // Strong pulse for important field actions
        Vibration.vibrate(Platform.OS === 'android' ? 45 : 50);
        break;

      case 'warning':
        // Two short pulses
        Vibration.vibrate([0, 35, 60, 35]);
        break;

      case 'error':
        // Urgent distinct pattern
        Vibration.vibrate([0, 50, 60, 50, 60, 75]);
        break;

      default:
        Vibration.vibrate(20);
        break;
    }
  } catch {
    // Fail silently so UI execution is never interrupted
  }
}
