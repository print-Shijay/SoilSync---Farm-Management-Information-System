import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { powersync } from '../powersync';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
}

/**
 * Real-time network and offline status hook.
 * Combines native device network probe, AppState transitions,
 * periodic checks, and PowerSync socket status.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function evaluateNetwork() {
      try {
        const netState = await Network.getNetworkStateAsync();
        const online = Boolean(netState.isConnected && netState.isInternetReachable !== false);
        if (isMounted) {
          setIsOnline(online);
        }
      } catch {
        // Retain current state if probe fails
      }
    }

    // Initial probe
    void evaluateNetwork();

    // Fast polling every 3.5s to respond quickly to Airplane Mode or Wi-Fi loss
    const intervalId = setInterval(evaluateNetwork, 3500);

    // Re-check whenever app comes into foreground
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void evaluateNetwork();
      }
    });

    // React to PowerSync connectivity events
    const disposePowerSync = powersync.registerListener({
      statusChanged: (status) => {
        if (!isMounted) return;
        if (status.connected) {
          setIsOnline(true);
        } else {
          void evaluateNetwork();
        }
      },
    });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      appStateSub.remove();
      disposePowerSync();
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
  };
}
