import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  BackHandler,
  RefreshControl,
  Linking,
  Animated,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Svg, { Rect, Text as SvgText, Circle, Line } from 'react-native-svg';
import base64 from 'base64-js';
import jpeg from 'jpeg-js';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal } from '../../../components/common/AppModal';
import { router, useFocusEffect } from 'expo-router';
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from 'react-native-bluetooth-classic';
import {
  Bluetooth,
  Zap,
  Leaf,
  AlertTriangle,
  Sparkles,
  Info,
  X,
  Droplets,
  ExternalLink,
} from '../../../components/Icons';
import { BackButton } from '../../../components/common/BackButton';
import { useAccessibility } from '../../../lib/accessibility';
import { StatusIndicator } from '../../../components/common/accessible';
import {
  generateSoilAdvisory,
  getNutrientDetail,
  NutrientDetail,
  SoilAdvisory,
  SOIL_BENCHMARKS_GUIDE,
} from '../../../lib/npk-advisory';

// ---- Types ----

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SensorReading {
  nitrogen: number;
  phosphorous: number;
  potassium: number;
  samples: number;
  receivedAt: number;
}

const ESP32_NAME_HINT = 'SoilSync_ESP32';
const CONNECT_TIMEOUT_MS = 8000;

/**
 * Splits text into wrapped lines for SVG text rendering (since SvgText does not auto-wrap).
 */
function wrapSvgText(text: string, maxCharsPerLine: number = 50): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export default function NPKSensorScreen() {
  useKeepAwake();
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();

  // Connection & Device State
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[]>([]);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [isMoistureTipDismissed, setIsMoistureTipDismissed] = useState(false);

  // Live Sensor Reading State
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  // References
  const dataSubscription = useRef<BluetoothEventSubscription | null>(null);
  const disconnectSubscription = useRef<BluetoothEventSubscription | null>(null);
  const simulationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackPollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const rxBuffer = useRef<string>('');
  const lastPacketTimeRef = useRef<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRingOpacity = useRef(new Animated.Value(0)).current;
  const lastTargetDevice = useRef<BluetoothDevice | null>(null);
  const isUserDisconnect = useRef<boolean>(false);
  const hasAutoConnected = useRef<boolean>(false);
  const svgRef = useRef<any>(null);

  // Decoupled Callback Refs
  const connectToDeviceRef = useRef<((device: BluetoothDevice) => Promise<void>) | null>(null);
  const handleUnexpectedDisconnectRef = useRef<((device: BluetoothDevice) => void) | null>(null);

  // Heartbeat pulse animation (100% native driver, 0 React re-renders)
  const triggerVisualPulse = useCallback(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.35,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(pulseRingOpacity, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(pulseRingOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [pulseAnim, pulseRingOpacity]);

  // Timer for "Updated Xs ago" (Stable single timer, zero interval churn)
  useEffect(() => {
    timerInterval.current = setInterval(() => {
      if (lastPacketTimeRef.current) {
        setSecondsAgo(Math.floor((Date.now() - lastPacketTimeRef.current) / 1000));
      } else {
        setSecondsAgo(0);
      }
    }, 1000);

    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      dataSubscription.current?.remove();
      disconnectSubscription.current?.remove();
      if (simulationInterval.current) clearInterval(simulationInterval.current);
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
    };
  }, []);

  // Active reading: directly available when reading is received from sensor or simulation
  const activeReading: SensorReading | null =
    status === 'connected' ? reading : null;

  // Short farmer soil advice (Memoized so consecutive readings don't recalculate unless values change)
  const soilAdvisory: SoilAdvisory = useMemo(() => {
    return activeReading
      ? generateSoilAdvisory(activeReading.nitrogen, activeReading.phosphorous, activeReading.potassium)
      : generateSoilAdvisory(0, 0, 0);
  }, [activeReading]);

  // Pre-calculate wrapped lines for SVG screenshot export (Memoized to prevent string splitting on every packet)
  const svgExplanationLines = useMemo(() => wrapSvgText(soilAdvisory.explanation, 50), [soilAdvisory.explanation]);
  const svgAction1Lines = useMemo(() => wrapSvgText(soilAdvisory.actions[0] || 'Keep soil evenly moist.', 46), [soilAdvisory.actions]);
  const svgAction2Lines = useMemo(() => wrapSvgText(soilAdvisory.actions[1] || 'Apply organic compost as needed.', 46), [soilAdvisory.actions]);
  const svgAction1Start = 608 + svgExplanationLines.length * 24 + 14;
  const svgAction2Start = svgAction1Start + svgAction1Lines.length * 21 + 10;

  // ---- Simulation / Demo Handler ----

  const toggleSimulation = useCallback(() => {
    triggerHaptic('medium');
    if (isSimulating) {
      if (simulationInterval.current) clearInterval(simulationInterval.current);
      setIsSimulating(false);
      setStatus('disconnected');
      setReading(null);
      setLastPacketTime(null);
    } else {
      if (connectedDevice) {
        isUserDisconnect.current = true;
        connectedDevice.disconnect().catch(() => {});
        setConnectedDevice(null);
      }

      setIsSimulating(true);
      setStatus('connected');
      setErrorMessage(null);
      const now = Date.now();
      lastPacketTimeRef.current = now;
      setLastPacketTime(now);

      triggerHaptic('success');
      setReading({
        nitrogen: 78,
        phosphorous: 38,
        potassium: 145,
        samples: 1,
        receivedAt: now,
      });

      let count = 1;
      simulationInterval.current = setInterval(() => {
        count += 1;
        const tickTime = Date.now();
        lastPacketTimeRef.current = tickTime;
        setLastPacketTime(tickTime);
        triggerVisualPulse();

        setReading((prev) => {
          const nBase = prev?.nitrogen ?? 78;
          const pBase = prev?.phosphorous ?? 38;
          const kBase = prev?.potassium ?? 145;

          return {
            nitrogen: Math.min(200, Math.max(15, Math.round(nBase + (Math.random() * 4 - 2)))),
            phosphorous: Math.min(100, Math.max(10, Math.round(pBase + (Math.random() * 2 - 1)))),
            potassium: Math.min(250, Math.max(25, Math.round(kBase + (Math.random() * 4 - 2)))),
            samples: count,
            receivedAt: tickTime,
          };
        });
      }, 1000);
    }
  }, [isSimulating, connectedDevice, triggerHaptic, triggerVisualPulse]);

  // ---- Permissions ----

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
      return (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted'
      );
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === 'granted';
    }
  }, []);

  // ---- Stream Parser ----

  const handleStreamChunk = useCallback(
    (input: any) => {
      const chunk = typeof input === 'string' ? input : (input?.data ?? '');
      if (!chunk || typeof chunk !== 'string') return;
      rxBuffer.current += chunk;

      // Keep buffer bounded in case of corrupted transmissions
      if (rxBuffer.current.length > 8192) {
        rxBuffer.current = rxBuffer.current.slice(-2048);
      }

      // Extract and parse all complete JSON objects {...} from buffer
      let searchPos = 0;
      while (true) {
        const startIdx = rxBuffer.current.indexOf('{', searchPos);
        if (startIdx === -1) {
          // If no opening brace remains, clear any noise/whitespace
          rxBuffer.current = '';
          break;
        }

        const endIdx = rxBuffer.current.indexOf('}', startIdx);
        if (endIdx === -1) {
          // Opening brace found, but waiting for remaining chunk with closing brace
          if (startIdx > 0) {
            rxBuffer.current = rxBuffer.current.slice(startIdx);
          }
          break;
        }

        const candidate = rxBuffer.current.slice(startIdx, endIdx + 1);
        try {
          const parsed = JSON.parse(candidate);

          const parseVal = (val: any): number | null => {
            if (typeof val === 'number' && !isNaN(val)) return val;
            if (typeof val === 'string' && val.trim() !== '') {
              const num = Number(val);
              return isNaN(num) ? null : num;
            }
            return null;
          };

          const n = parseVal(parsed.nitrogen ?? parsed.N ?? parsed.n);
          const p = parseVal(parsed.phosphorous ?? parsed.phosphorus ?? parsed.P ?? parsed.p);
          const k = parseVal(parsed.potassium ?? parsed.K ?? parsed.k);

          if (n !== null && p !== null && k !== null) {
            const now = Date.now();
            lastPacketTimeRef.current = now;
            setLastPacketTime(now);
            triggerVisualPulse();

            setReading({
              nitrogen: n,
              phosphorous: p,
              potassium: k,
              samples: parseVal(parsed.samples ?? parsed.sample ?? parsed.telemetryCount ?? parsed.count) ?? 1,
              receivedAt: now,
            });
            setErrorMessage(null);
          }

          // Advance buffer past this successfully parsed JSON object
          rxBuffer.current = rxBuffer.current.slice(endIdx + 1);
          searchPos = 0;
        } catch {
          // Candidate wasn't valid JSON, advance search position
          searchPos = startIdx + 1;
        }
      }
    },
    [triggerVisualPulse]
  );

  // ---- Connect to Sensor Device ----

  const connectToDevice = useCallback(
    async (device: BluetoothDevice) => {
      try {
        if (isSimulating) {
          if (simulationInterval.current) clearInterval(simulationInterval.current);
          setIsSimulating(false);
        }

        setStatus('connecting');
        setErrorMessage(null);
        rxBuffer.current = '';
        lastTargetDevice.current = device;
        isUserDisconnect.current = false;

        dataSubscription.current?.remove();
        disconnectSubscription.current?.remove();

        try {
          const isConn = await device.isConnected();
          if (isConn) await device.disconnect();
        } catch {
          // Socket clean
        }

        const connectPromise = device.connect({ delimiter: '\n', charset: 'utf-8' });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Sensor did not respond. Make sure it is turned on and close to your phone.')),
            CONNECT_TIMEOUT_MS
          )
        );

        await Promise.race([connectPromise, timeoutPromise]);

        setConnectedDevice(device);
        setStatus('connected');
        setShowDeviceList(false);
        setLastPacketTime(null);
        triggerHaptic('success');

        dataSubscription.current = device.onDataReceived((event: any) => {
          handleStreamChunk(event?.data ?? event);
        });

        // Smart fallback polling: dormant when streaming normally, only probes if stalled > 2.5s
        if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
        fallbackPollInterval.current = setInterval(async () => {
          try {
            // Dormant check: if fresh packet arrived within last 2.5s, skip JNI bridge calls
            if (Date.now() - (lastPacketTimeRef.current ?? 0) < 2500) {
              return;
            }
            const isConn = await device.isConnected();
            if (isConn) {
              const avail = await device.available();
              if (avail > 0) {
                const polled = await device.read();
                if (polled) {
                  handleStreamChunk(polled);
                }
              }
            }
          } catch {
            // Passive catch
          }
        }, 1500);

        disconnectSubscription.current = RNBluetoothClassic.onDeviceDisconnected((event) => {
          if (event.device.address === device.address) {
            handleUnexpectedDisconnectRef.current?.(device);
          }
        });
      } catch (err: any) {
        if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
        setStatus('disconnected');
        setConnectedDevice(null);
        triggerHaptic('warning');
        setErrorMessage(err?.message || 'Could not connect to sensor. Check power and try again.');
      }
    },
    [isSimulating, triggerHaptic, handleStreamChunk]
  );

  // ---- Unexpected Disconnect Handler ----

  const handleUnexpectedDisconnect = useCallback(
    (device: BluetoothDevice) => {
      if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
      dataSubscription.current?.remove();
      disconnectSubscription.current?.remove();
      rxBuffer.current = '';

      if (isUserDisconnect.current) {
        setStatus('disconnected');
        setConnectedDevice(null);
        setLastPacketTime(null);
        setReading(null);
        return;
      }

      triggerHaptic('warning');
      setStatus('reconnecting');
      setErrorMessage('Lost connection to sensor. Trying to reconnect...');

      setTimeout(() => {
        if (lastTargetDevice.current && !isUserDisconnect.current) {
          connectToDeviceRef.current?.(device);
        }
      }, 3000);
    },
    [triggerHaptic]
  );

  // Sync decoupled refs
  useEffect(() => {
    connectToDeviceRef.current = connectToDevice;
    handleUnexpectedDisconnectRef.current = handleUnexpectedDisconnect;
  }, [connectToDevice, handleUnexpectedDisconnect]);

  // ---- Disconnect ----

  const handleDisconnect = useCallback(async () => {
    triggerHaptic('selection');
    isUserDisconnect.current = true;

    try {
      if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
      if (isSimulating) {
        if (simulationInterval.current) clearInterval(simulationInterval.current);
        setIsSimulating(false);
      }
      if (connectedDevice) {
        await connectedDevice.disconnect();
      }
    } finally {
      if (fallbackPollInterval.current) clearInterval(fallbackPollInterval.current);
      setStatus('disconnected');
      setConnectedDevice(null);
      setLastPacketTime(null);
      setReading(null);
      setErrorMessage(null);
      rxBuffer.current = '';
    }
  }, [connectedDevice, isSimulating, triggerHaptic]);

  // ---- Connect Button Tap ----

  const handleConnectPress = useCallback(async () => {
    triggerHaptic('buttonPress');
    setErrorMessage(null);

    const hasPerm = await requestPermissions();
    if (!hasPerm) {
      setErrorMessage('Please allow Bluetooth permissions to connect to your soil sensor.');
      return;
    }

    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        const requested = await RNBluetoothClassic.requestBluetoothEnabled();
        if (!requested) {
          setErrorMessage('Please turn on Bluetooth to connect.');
          return;
        }
      }
    } catch {
      setErrorMessage('Bluetooth is turned off on your phone.');
      return;
    }

    setStatus('connecting');

    try {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      setPairedDevices(bonded);

      const esp32 = bonded.find((d) => d.name?.includes(ESP32_NAME_HINT));
      if (esp32) {
        await connectToDevice(esp32);
      } else {
        setStatus('disconnected');
        setShowDeviceList(true);
      }
    } catch (err: any) {
      setStatus('disconnected');
      setErrorMessage(err?.message || 'Could not scan for sensor.');
    }
  }, [connectToDevice, requestPermissions, triggerHaptic]);

  // ---- Order Sensor Redirection ----

  const handleOrderSensor = useCallback(async () => {
    triggerHaptic('buttonPress');
    const url = 'https://www.soilsync.app/';
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Cannot Open Webpage', 'Please visit https://www.soilsync.app/ in your browser.');
    }
  }, [triggerHaptic]);

  // Auto-connect attempt on mount
  useEffect(() => {
    let isMounted = true;
    if (hasAutoConnected.current) return;
    hasAutoConnected.current = true;

    (async () => {
      try {
        if (!RNBluetoothClassic || typeof RNBluetoothClassic.isBluetoothEnabled !== 'function') return;
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        if (enabled && isMounted) {
          const bonded = await RNBluetoothClassic.getBondedDevices();
          if (isMounted) setPairedDevices(bonded);
          const esp32 = bonded.find((d) => d.name?.includes(ESP32_NAME_HINT));
          if (esp32 && isMounted) {
            connectToDevice(esp32);
          }
        }
      } catch {
        // Silent catch
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [connectToDevice]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    triggerHaptic('selection');
    setErrorMessage(null);

    try {
      if (isSimulating) {
        toggleSimulation();
        return;
      }
      const bonded = await RNBluetoothClassic.getBondedDevices();
      setPairedDevices(bonded);
      const esp32 = bonded.find((d) => d.name?.includes(ESP32_NAME_HINT));
      if (esp32) {
        await connectToDevice(esp32);
      } else {
        setShowDeviceList(true);
      }
    } catch {
      setErrorMessage('Could not refresh sensor.');
    } finally {
      setIsRefreshing(false);
    }
  }, [connectToDevice, isSimulating, toggleSimulation, triggerHaptic]);

  // Android Settings Opener
  const openBluetoothSettings = () => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => {
        Alert.alert('Settings', 'Please open phone Settings > Bluetooth and pair with SoilSync_ESP32.');
      });
    }
  };

  // Back Button Navigation
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showDeviceList) {
          setShowDeviceList(false);
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        } else {
          router.replace('/(tabs)');
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [showDeviceList])
  );

  // ---- Pure Image Screenshot / Share Action (No PDF) ----

  const handleScreenshotShare = async () => {
    if (!activeReading) return;
    triggerHaptic('success');
    setIsSharing(true);
    // Allow React 100ms to mount off-screen SVG card on-demand
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      let imageBase64: string | null = null;

      // 1. Primary: Capture native PNG image from rendered SVG element
      if (svgRef.current && typeof svgRef.current.toDataURL === 'function') {
        try {
          imageBase64 = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('timeout')), 1500);
            svgRef.current.toDataURL((data: string) => {
              clearTimeout(timeout);
              if (data && data.length > 100) {
                resolve(data);
              } else {
                reject(new Error('empty'));
              }
            });
          });
        } catch {
          imageBase64 = null;
        }
      }

      // 2. Prepare file path (guaranteed image only: .png or .jpg)
      let fileUri = '';
      if (imageBase64) {
        const filename = `soilsync_npk_${Date.now()}.png`;
        fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, imageBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // Guaranteed Fallback: Generate real JPEG image via jpeg-js
        const width = 600;
        const height = 800;
        const frameData = new Uint8Array(width * height * 4);
        frameData.fill(255); // White background

        // Cognac brand header (#8C4522)
        for (let y = 0; y < 110; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            frameData[idx] = 140;     // R
            frameData[idx + 1] = 69;  // G
            frameData[idx + 2] = 34;  // B
            frameData[idx + 3] = 255; // A
          }
        }

        const jpegData = jpeg.encode({ data: frameData, width, height }, 90);
        const base64Str = base64.fromByteArray(jpegData.data);
        const filename = `soilsync_npk_${Date.now()}.jpg`;
        fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64Str, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // 3. Share as pure image file
      const mimeType = fileUri.endsWith('.png') ? 'image/png' : 'image/jpeg';
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: 'Share Soil Test Image',
          UTI: fileUri.endsWith('.png') ? 'public.png' : 'public.jpeg',
        });
      } else {
        Alert.alert(
          'Screenshot Ready',
          'Image saved to app storage. You can also press Power + Volume Down on your phone.'
        );
      }
    } catch {
      Alert.alert(
        'Screenshot Tip',
        'Press Power + Volume Down on your phone to capture this screen as an image.'
      );
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-champagne"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          colors={['#8C4522']}
          tintColor="#8C4522"
        />
      }>
      <View className="flex-1 pt-14 pb-12">
        {/* Header Navigation with Warm Cognac Accents */}
        <View className="flex-row items-center justify-between px-5 py-2">
          <BackButton />

          <View className="items-center">
            <Text
              style={{ fontSize: 20 * fontScale }}
              className={`font-black ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
              Soil NPK Sensor
            </Text>
            <Text className="text-[11px] font-bold text-cognac tracking-wider uppercase">
              Live Soil Reading
            </Text>
          </View>

          {/* Clean Demo Mode Switch */}
          <Pressable
            onPress={toggleSimulation}
            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border active:scale-95 ${
              isSimulating
                ? 'bg-cognac border-cognac shadow-sm'
                : 'bg-white border-cognac/30'
            }`}>
            <Zap color={isSimulating ? '#ffffff' : '#8C4522'} size={14} />
            <Text
              className={`text-xs font-bold ${
                isSimulating ? 'text-white' : 'text-cognac'
              }`}>
              {isSimulating ? 'Demo Active' : 'Demo'}
            </Text>
          </Pressable>
        </View>

        {/* Main Sheet Container */}
        <View
          className={`mt-4 min-h-screen rounded-t-[32px] border-x border-t border-cognac/15 p-5 ${
            isHighContrast ? 'bg-white border-black/35' : 'bg-white/95'
          }`}>
          {/* Connection Status Bar with Cognac Accents */}
          {status === 'connected' ? (
            <View className="gap-2.5">
              <View className="flex-row items-center justify-between rounded-2xl bg-white p-3.5 border border-cognac/30 shadow-xs">
                <View className="flex-row items-center gap-2.5">
                  <View className="relative items-center justify-center">
                    <Animated.View
                      style={{ transform: [{ scale: pulseAnim }] }}
                      className="h-3 w-3 rounded-full bg-emerald-500"
                    />
                    <Animated.View
                      style={{
                        transform: [{ scale: pulseAnim }],
                        opacity: pulseRingOpacity,
                      }}
                      className="absolute h-5 w-5 rounded-full bg-emerald-400/30"
                    />
                  </View>
                  <View>
                    <Text className="text-xs font-black text-espresso">
                      {isSimulating ? 'Virtual Sensor (Demo)' : 'SoilSync Sensor • Connected'}
                    </Text>
                    <Text className="text-[11px] font-semibold text-cognac">
                      {lastPacketTime
                        ? secondsAgo <= 1
                          ? 'Reading live • Updated just now'
                          : `Reading live • ${secondsAgo}s ago`
                        : 'Connected • Awaiting live telemetry...'}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleDisconnect}
                  className="rounded-xl border border-cognac/30 bg-cognac/5 px-3 py-1.5 active:bg-cognac/15">
                  <Text className="text-xs font-bold text-cognac">Disconnect</Text>
                </Pressable>
              </View>

              {/* Dismissable Soil Moisture Recommendation Banner (Can be X'd out) */}
              {!isMoistureTipDismissed ? (
                <View className="flex-row items-center justify-between rounded-2xl bg-[#FBF7F2] p-3 border border-cognac/25">
                  <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                    <View className="h-7 w-7 items-center justify-center rounded-xl bg-cognac/10 shrink-0 border border-cognac/20">
                      <Droplets size={15} color="#8C4522" />
                    </View>
                    <Text
                      style={{ fontSize: 12 * fontScale }}
                      className="flex-1 text-espresso font-semibold leading-4">
                      <Text className="font-black text-cognac">Tip: </Text>
                      Water dry soil lightly before testing. Dry soil can lead to 0 result.
                    </Text>
                  </View>

                  <Pressable
                    hitSlop={10}
                    onPress={() => {
                      triggerHaptic('selection');
                      setIsMoistureTipDismissed(true);
                    }}
                    accessibilityLabel="Dismiss moisture recommendation"
                    className="h-6 w-6 items-center justify-center rounded-full bg-champagne active:bg-taupe/20 shrink-0">
                    <X size={13} color="#8C4522" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : status === 'connecting' || status === 'reconnecting' ? (
            <View className="flex-row items-center justify-between rounded-2xl bg-amber-50 p-3.5 border border-amber-300">
              <View className="flex-row items-center gap-2.5">
                <ActivityIndicator size="small" color="#d97706" />
                <Text className="text-xs font-bold text-amber-900">
                  {status === 'reconnecting' ? 'Reconnecting to sensor...' : 'Connecting to sensor...'}
                </Text>
              </View>
              <Pressable onPress={() => setStatus('disconnected')}>
                <Text className="text-xs font-bold text-amber-800 underline">Cancel</Text>
              </Pressable>
            </View>
          ) : (
            /* Disconnected: Clear, Single Primary CTA with Rich Cognac */
            <View className="rounded-3xl bg-white p-6 border-2 border-cognac/20 shadow-sm items-center">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-cognac/10 border border-cognac/20 mb-3">
                <Bluetooth color="#8C4522" size={28} />
              </View>
              <Text className="text-lg font-black text-espresso">
                Connect Soil Sensor
              </Text>
              <Text className="mt-1 text-xs text-taupe text-center leading-4 px-3">
                Turn on your sensor and make sure the 3 metal prongs are in moist soil.
              </Text>

              {/* Single Clear Primary CTA in Solid Cognac */}
              <Pressable
                onPress={handleConnectPress}
                className={`mt-5 w-full flex-row items-center justify-center gap-2.5 rounded-2xl bg-cognac shadow-md shadow-cognac/30 active:bg-[#733619] active:scale-98 ${
                  isGloveMode ? 'py-4 min-h-[54px]' : 'py-3.5'
                }`}>
                <Bluetooth color="#ffffff" size={18} />
                <Text className="text-sm font-bold text-white tracking-wide">Connect Sensor</Text>
              </Pressable>

              {/* Subtle secondary link */}
              <Pressable onPress={toggleSimulation} className="mt-3.5 py-1">
                <Text className="text-xs font-bold text-cognac underline">
                  Or test with Demo Mode
                </Text>
              </Pressable>

              {/* Order NPK Sensor Button (Redirects to https://www.soilsync.app/) */}
              <View className="mt-4 w-full pt-4 border-t border-cognac/15 items-center justify-center">
                <Text className="text-xs text-taupe font-medium text-center">
                  Don&apos;t have a SoilSync sensor yet?
                </Text>
                <Pressable
                  onPress={handleOrderSensor}
                  style={{
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className={`mt-2.5 rounded-2xl border-2 border-cognac/30 bg-cognac/5 active:bg-cognac/15 ${
                    isGloveMode ? 'py-4 min-h-[52px]' : 'py-3.5'
                  }`}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <ExternalLink size={16} color="#8C4522" style={{ marginRight: 8 }} />
                    <Text
                      style={{
                        fontSize: 13 * fontScale,
                        color: '#8C4522',
                        fontWeight: '800',
                        textAlign: 'center',
                        letterSpacing: 0.2,
                      }}>
                      Order NPK Sensor
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {/* Simple Error Notice */}
          {errorMessage ? (
            <View className="mt-3.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <AlertTriangle size={16} color="#be123c" />
                <Text className="text-xs font-semibold text-rose-800 flex-1">
                  {errorMessage}
                </Text>
              </View>
              <Pressable
                onPress={handleConnectPress}
                className="rounded-lg bg-rose-600 px-3 py-1.5 active:bg-rose-700">
                <Text className="text-xs font-bold text-white">Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Awaiting first live telemetry stream */}
          {status === 'connected' && !activeReading ? (
            <View className="mt-6 rounded-2xl bg-white p-6 border border-cognac/25 shadow-xs items-center justify-center">
              <ActivityIndicator size="large" color="#8C4522" />
              <Text className="mt-3 text-sm font-black text-espresso">
                Awaiting Sensor Telemetry...
              </Text>
              <Text className="mt-1 text-xs text-taupe text-center">
                Connected to SoilSync_ESP32. Receiving live soil data stream...
              </Text>
            </View>
          ) : null}

          {/* Live Sensor Metrics Display */}
          {activeReading ? (
            <View className="mt-5 gap-3.5">
              {/* Header row with Ideal Standards Trigger */}
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                  Live Nutrients
                </Text>
                <Pressable
                  onPress={() => setShowStandardsModal(true)}
                  className="flex-row items-center gap-1.5 rounded-full bg-cognac/10 px-2.5 py-1 border border-cognac/25 active:bg-cognac/20">
                  <Info size={12} color="#8C4522" />
                  <Text className="text-xs font-bold text-cognac">Ideal Standards</Text>
                </Pressable>
              </View>

              {/* Nitrogen Card */}
              <SimpleNutrientCard
                symbol="N"
                name="Nitrogen"
                detail={getNutrientDetail('N', activeReading.nitrogen)}
              />

              {/* Phosphorous Card */}
              <SimpleNutrientCard
                symbol="P"
                name="Phosphorous"
                detail={getNutrientDetail('P', activeReading.phosphorous)}
              />

              {/* Potassium Card */}
              <SimpleNutrientCard
                symbol="K"
                name="Potassium"
                detail={getNutrientDetail('K', activeReading.potassium)}
              />

              {/* Short Soil Advice Card (With Real Padding & Cognac Color) */}
              <View
                className={`mt-2 rounded-2xl border-2 border-cognac/30 bg-white shadow-xs ${
                  isHighContrast ? 'border-black' : ''
                }`}
                style={{ padding: 18 }}>
                {/* Header with Cognac Accent */}
                <View className="flex-row items-center justify-between pb-3 border-b border-cognac/15">
                  <View className="flex-row items-center gap-2">
                    <View className="h-7 w-7 items-center justify-center rounded-lg bg-cognac/10">
                      <Leaf size={16} color="#8C4522" />
                    </View>
                    <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                      Soil Advice
                    </Text>
                  </View>
                  <View className={`rounded-full px-3 py-1 border border-cognac/20 ${soilAdvisory.badgeBg}`}>
                    <Text className={`text-xs font-black ${soilAdvisory.badgeColor}`}>
                      {soilAdvisory.title}
                    </Text>
                  </View>
                </View>

                {/* Short, plain-language explanation */}
                <Text
                  style={{ fontSize: 14 * fontScale }}
                  className="mt-3 text-espresso font-bold leading-5">
                  {soilAdvisory.explanation}
                </Text>

                {/* 1-2 Quick Action Bullets with Cognac Bullet Dots */}
                <View className="mt-3 gap-2 bg-champagne/70 rounded-xl p-3.5 border border-taupe/15">
                  {soilAdvisory.actions.map((action, idx) => (
                    <View key={idx} className="flex-row items-start gap-2.5">
                      <View className="mt-1.5 h-2 w-2 rounded-full bg-cognac shrink-0" />
                      <Text
                        style={{ fontSize: 13 * fontScale }}
                        className="flex-1 text-espresso font-medium leading-5">
                        {action}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Screenshot Button (Outputs PURE IMAGE ONLY: PNG/JPG) */}
              <Pressable
                disabled={isSharing}
                onPress={handleScreenshotShare}
                className={`mt-3 flex-row items-center justify-center gap-2.5 rounded-2xl bg-cognac shadow-md shadow-cognac/25 active:bg-[#733619] active:scale-98 ${
                  isGloveMode ? 'py-4 min-h-[54px]' : 'py-3.5'
                }`}>
                {isSharing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Sparkles size={18} color="#ffffff" />
                )}
                <Text className="text-sm font-bold text-white tracking-wide">
                  {isSharing ? 'Saving Image...' : 'Screenshot / Share Image'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* Off-Screen Native SVG Card (Only rendered on-demand when sharing image) */}
      {isSharing && activeReading ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 720,
            height: 960,
            opacity: 0.01,
            zIndex: -999,
            pointerEvents: 'none',
          }}
          collapsable={false}>
          <Svg
            ref={svgRef}
            width={720}
            height={960}
            viewBox="0 0 720 960">
            {/* Outer Card Background */}
            <Rect x={10} y={10} width={700} height={940} rx={24} fill="#FAF7F2" stroke="#E6DFD5" strokeWidth={2} />
            <Rect x={24} y={24} width={672} height={912} rx={20} fill="#FFFFFF" />

            {/* Top Banner with Cognac Accent */}
            <Rect x={24} y={24} width={672} height={10} rx={5} fill="#8C4522" />
            <SvgText x={360} y={75} fill="#8C4522" fontSize={16} fontWeight="bold" textAnchor="middle">
              SOILSYNC
            </SvgText>
            <SvgText x={360} y={115} fill="#1C120C" fontSize={28} fontWeight="900" textAnchor="middle">
              Soil NPK Test Result
            </SvgText>
            <SvgText x={360} y={145} fill="#8C7C70" fontSize={14} textAnchor="middle">
              Tested: {new Date(activeReading.receivedAt).toLocaleString()}
            </SvgText>
            <Line x1={60} y1={168} x2={660} y2={168} stroke="#EFE9E0" strokeWidth={2} />

            {/* Nitrogen (N) Block */}
            <Rect x={50} y={188} width={620} height={96} rx={16} fill="#FDFBF9" stroke="#EFE8E0" strokeWidth={1.5} />
            <Rect x={68} y={204} width={64} height={64} rx={14} fill="#D1FAE5" />
            <SvgText x={100} y={247} fill="#065F46" fontSize={26} fontWeight="900" textAnchor="middle">N</SvgText>
            <SvgText x={148} y={232} fill="#1C120C" fontSize={20} fontWeight="bold">Nitrogen</SvgText>
            <SvgText x={148} y={256} fill="#8C7C70" fontSize={13}>Helps leaves & green growth • Ideal: 50-120 mg/kg</SvgText>
            <SvgText x={555} y={238} fill="#8C4522" fontSize={28} fontWeight="900" textAnchor="end">{activeReading.nitrogen.toFixed(1)}</SvgText>
            <SvgText x={560} y={238} fill="#8C7C70" fontSize={14} fontWeight="bold">mg/kg</SvgText>
            <Rect
              x={510}
              y={250}
              width={135}
              height={24}
              rx={8}
              fill={getNutrientDetail('N', activeReading.nitrogen).level === 'optimal' ? '#D1FAE5' : getNutrientDetail('N', activeReading.nitrogen).level === 'low' ? '#FEF3C7' : '#FFE4E6'}
            />
            <SvgText
              x={577}
              y={267}
              fill={getNutrientDetail('N', activeReading.nitrogen).level === 'optimal' ? '#065F46' : getNutrientDetail('N', activeReading.nitrogen).level === 'low' ? '#92400E' : '#9F1239'}
              fontSize={13}
              fontWeight="bold"
              textAnchor="middle">
              {getNutrientDetail('N', activeReading.nitrogen).label}
            </SvgText>

            {/* Phosphorous (P) Block */}
            <Rect x={50} y={300} width={620} height={96} rx={16} fill="#FDFBF9" stroke="#EFE8E0" strokeWidth={1.5} />
            <Rect x={68} y={316} width={64} height={64} rx={14} fill="#D1FAE5" />
            <SvgText x={100} y={359} fill="#065F46" fontSize={26} fontWeight="900" textAnchor="middle">P</SvgText>
            <SvgText x={148} y={344} fill="#1C120C" fontSize={20} fontWeight="bold">Phosphorous</SvgText>
            <SvgText x={148} y={368} fill="#8C7C70" fontSize={13}>Helps roots & flowering • Ideal: 20-50 mg/kg</SvgText>
            <SvgText x={555} y={350} fill="#8C4522" fontSize={28} fontWeight="900" textAnchor="end">{activeReading.phosphorous.toFixed(1)}</SvgText>
            <SvgText x={560} y={350} fill="#8C7C70" fontSize={14} fontWeight="bold">mg/kg</SvgText>
            <Rect
              x={510}
              y={362}
              width={135}
              height={24}
              rx={8}
              fill={getNutrientDetail('P', activeReading.phosphorous).level === 'optimal' ? '#D1FAE5' : getNutrientDetail('P', activeReading.phosphorous).level === 'low' ? '#FEF3C7' : '#FFE4E6'}
            />
            <SvgText
              x={577}
              y={379}
              fill={getNutrientDetail('P', activeReading.phosphorous).level === 'optimal' ? '#065F46' : getNutrientDetail('P', activeReading.phosphorous).level === 'low' ? '#92400E' : '#9F1239'}
              fontSize={13}
              fontWeight="bold"
              textAnchor="middle">
              {getNutrientDetail('P', activeReading.phosphorous).label}
            </SvgText>

            {/* Potassium (K) Block */}
            <Rect x={50} y={412} width={620} height={96} rx={16} fill="#FDFBF9" stroke="#EFE8E0" strokeWidth={1.5} />
            <Rect x={68} y={428} width={64} height={64} rx={14} fill="#D1FAE5" />
            <SvgText x={100} y={471} fill="#065F46" fontSize={26} fontWeight="900" textAnchor="middle">K</SvgText>
            <SvgText x={148} y={456} fill="#1C120C" fontSize={20} fontWeight="bold">Potassium</SvgText>
            <SvgText x={148} y={480} fill="#8C7C70" fontSize={13}>Helps plant vigor & stems • Ideal: 100-200 mg/kg</SvgText>
            <SvgText x={555} y={462} fill="#8C4522" fontSize={28} fontWeight="900" textAnchor="end">{activeReading.potassium.toFixed(1)}</SvgText>
            <SvgText x={560} y={462} fill="#8C7C70" fontSize={14} fontWeight="bold">mg/kg</SvgText>
            <Rect
              x={510}
              y={474}
              width={135}
              height={24}
              rx={8}
              fill={getNutrientDetail('K', activeReading.potassium).level === 'optimal' ? '#D1FAE5' : getNutrientDetail('K', activeReading.potassium).level === 'low' ? '#FEF3C7' : '#FFE4E6'}
            />
            <SvgText
              x={577}
              y={491}
              fill={getNutrientDetail('K', activeReading.potassium).level === 'optimal' ? '#065F46' : getNutrientDetail('K', activeReading.potassium).level === 'low' ? '#92400E' : '#9F1239'}
              fontSize={13}
              fontWeight="bold"
              textAnchor="middle">
              {getNutrientDetail('K', activeReading.potassium).label}
            </SvgText>

            {/* Soil Advice Box with Multi-Line Wrapped Text (Never Overflows) */}
            <Rect x={50} y={530} width={620} height={270} rx={18} fill="#FAF4ED" stroke="#8C4522" strokeWidth={2} />
            <Rect x={70} y={550} width={130} height={26} rx={7} fill="#8C4522" />
            <SvgText x={135} y={568} fill="#FFFFFF" fontSize={12} fontWeight="bold" textAnchor="middle">SOIL ADVICE</SvgText>
            <SvgText x={215} y={570} fill="#8C4522" fontSize={17} fontWeight="900">{soilAdvisory.title}</SvgText>
            
            {/* Multi-line Explanation */}
            {svgExplanationLines.map((line, idx) => (
              <SvgText
                key={`exp-${idx}`}
                x={70}
                y={606 + idx * 22}
                fill="#1C120C"
                fontSize={15}
                fontWeight="bold">
                {line}
              </SvgText>
            ))}

            {/* Action 1 */}
            <Circle cx={76} cy={svgAction1Start - 4} r={3.5} fill="#8C4522" />
            {svgAction1Lines.map((line, idx) => (
              <SvgText
                key={`act1-${idx}`}
                x={92}
                y={svgAction1Start + idx * 20}
                fill="#4B382A"
                fontSize={14}
                fontWeight="600">
                {line}
              </SvgText>
            ))}

            {/* Action 2 */}
            <Circle cx={76} cy={svgAction2Start - 4} r={3.5} fill="#8C4522" />
            {svgAction2Lines.map((line, idx) => (
              <SvgText
                key={`act2-${idx}`}
                x={92}
                y={svgAction2Start + idx * 20}
                fill="#4B382A"
                fontSize={14}
                fontWeight="600">
                {line}
              </SvgText>
            ))}

            {/* Footer */}
            <Line x1={60} y1={825} x2={660} y2={825} stroke="#EFE9E0" strokeWidth={1.5} />
            <SvgText x={360} y={860} fill="#8C7C70" fontSize={13} textAnchor="middle">SoilSync IoT • Smart Farming for Filipino Farmers</SvgText>
          </Svg>
        </View>
      ) : null}

      {/* Paired Device Picker Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDeviceList}
        onRequestClose={() => setShowDeviceList(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setShowDeviceList(false)}
          />
          <View className="max-h-[70%] rounded-t-3xl bg-white p-5 shadow-xl">
            <View className="flex-row items-center justify-between pb-3.5 border-b border-taupe/20">
              <Text className="text-base font-black text-espresso">Select Your Sensor</Text>
              <Pressable
                onPress={() => setShowDeviceList(false)}
                className="rounded-full bg-champagne px-3 py-1">
                <Text className="text-xs font-bold text-taupe">Cancel</Text>
              </Pressable>
            </View>

            <FlatList
              data={pairedDevices}
              keyExtractor={(item) => item.address}
              className="mt-3"
              renderItem={({ item }) => {
                const isMatch = item.name?.includes(ESP32_NAME_HINT);
                return (
                  <Pressable
                    onPress={() => connectToDevice(item)}
                    className={`mb-2.5 flex-row items-center justify-between rounded-xl border p-3.5 ${
                      isMatch
                        ? 'border-cognac bg-cognac/5'
                        : 'border-taupe/20 bg-champagne/30'
                    }`}>
                    <View className="flex-row items-center gap-3">
                      <Bluetooth color={isMatch ? '#8C4522' : '#8C7C70'} size={18} />
                      <View>
                        <Text className="text-sm font-bold text-espresso">{item.name || 'Device'}</Text>
                        <Text className="text-xs text-taupe">{item.address}</Text>
                      </View>
                    </View>
                    <Text className="text-xs font-bold text-cognac">Connect</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text className="text-sm font-semibold text-taupe text-center">
                    &quot;{ESP32_NAME_HINT}&quot; was not found.
                  </Text>
                  <Pressable
                    onPress={openBluetoothSettings}
                    className="mt-4 rounded-xl bg-cognac px-5 py-2.5">
                    <Text className="text-xs font-bold text-white">Open Bluetooth Settings</Text>
                  </Pressable>
                  <Text className="mt-2 text-xs text-taupe text-center">
                    Pair your phone with SoilSync_ESP32 once, then return here.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Soil Standards & Ideal Ranges Guide Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showStandardsModal}
        onRequestClose={() => setShowStandardsModal(false)}>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setShowStandardsModal(false)}
          />
          <View className="max-h-[85%] rounded-t-3xl bg-white p-5 shadow-xl">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3.5 border-b border-taupe/20">
              <View>
                <Text className="text-base font-black text-espresso">Soil Standards & Ideal Ranges</Text>
                <Text className="text-xs text-taupe mt-0.5">Based on DA-BSWM & FAO benchmarks</Text>
              </View>
              <Pressable
                onPress={() => setShowStandardsModal(false)}
                className="rounded-full bg-champagne px-3 py-1">
                <Text className="text-xs font-bold text-taupe">Done</Text>
              </Pressable>
            </View>

            <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
              {/* Nutrient Benchmark Cards */}
              <View className="gap-3">
                {SOIL_BENCHMARKS_GUIDE.ranges.map((item) => (
                  <View key={item.symbol} className="rounded-2xl border border-cognac/20 bg-champagne/35 p-3.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-black text-espresso">{item.nutrient}</Text>
                      <View className="rounded-lg bg-emerald-100 px-2.5 py-0.5 border border-emerald-300">
                        <Text className="text-xs font-black text-emerald-800">Ideal: {item.ideal}</Text>
                      </View>
                    </View>
                    <Text className="mt-2 text-xs text-amber-900 font-medium">⚠️ {item.lowDesc}</Text>
                    <Text className="mt-1 text-xs text-rose-900 font-medium">⚠️ {item.highDesc}</Text>
                    <Text className="mt-1 text-xs text-cognac font-bold">🌱 {item.bestFor}</Text>
                  </View>
                ))}
              </View>

              {/* 3 Golden Field Rules */}
              <View className="mt-4 rounded-2xl bg-champagne/80 p-4 border border-cognac/25">
                <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                  3 Golden Rules for Accurate Sensor Readings
                </Text>
                <View className="mt-2.5 gap-2">
                  {SOIL_BENCHMARKS_GUIDE.fieldRules.map((rule, idx) => (
                    <View key={idx} className="flex-row items-start gap-2.5">
                      <View className="mt-1 h-2 w-2 rounded-full bg-cognac shrink-0" />
                      <Text className="text-xs text-espresso font-medium leading-4 flex-1">
                        {rule}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Close Button */}
              <Pressable
                onPress={() => setShowStandardsModal(false)}
                className="my-5 rounded-2xl bg-cognac py-3.5 items-center shadow-md shadow-cognac/20 active:bg-[#733619]">
                <Text className="text-sm font-bold text-white tracking-wide">Understood</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ---- Fully Responsive Nutrient Card with Cognac Accents ----

interface SimpleNutrientCardProps {
  symbol: 'N' | 'P' | 'K';
  name: string;
  detail: NutrientDetail;
}

const SimpleNutrientCard = React.memo(function SimpleNutrientCard({ symbol, name, detail }: SimpleNutrientCardProps) {
  const { fontScale, isHighContrast } = useAccessibility();

  const statusType: 'optimal' | 'low' | 'high' =
    detail.level === 'optimal' ? 'optimal' : detail.level === 'low' ? 'low' : 'high';

  return (
    <View
      className={`rounded-2xl bg-white border border-cognac/20 shadow-xs ${
        isHighContrast ? 'border-2 border-black/40' : ''
      }`}
      style={{ padding: 16 }}>
      {/* Top Row: Symbol Avatar, Name, Role (Responsive flex-1 min-w-0) + Status Badge */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
          <View
            className={`h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
              detail.level === 'optimal'
                ? 'bg-emerald-100 border border-emerald-200'
                : detail.level === 'low'
                ? 'bg-amber-100 border border-amber-200'
                : 'bg-rose-100 border border-rose-200'
            }`}>
            <Text
              className={`text-base font-black ${
                detail.level === 'optimal'
                  ? 'text-emerald-800'
                  : detail.level === 'low'
                  ? 'text-amber-800'
                  : 'text-rose-800'
              }`}>
              {symbol}
            </Text>
          </View>

          <View className="flex-1 min-w-0 pr-1">
            <Text
              style={{ fontSize: 16 * fontScale }}
              className={`font-black ${isHighContrast ? 'text-black' : 'text-espresso'}`}
              numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={{ fontSize: 11 * fontScale }}
              className="text-taupe font-medium"
              numberOfLines={1}>
              {detail.simpleRole}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View className="shrink-0">
          <StatusIndicator status={statusType} label={detail.label} size="sm" />
        </View>
      </View>

      {/* Middle Row: Value & Target in Dedicated Row (Never Squished) */}
      <View className="mt-3 flex-row items-baseline justify-between">
        <View className="flex-row items-baseline gap-1.5">
          <Text
            style={{ fontSize: Math.min(28, 25 * fontScale) }}
            className={`font-black ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
            {detail.value.toFixed(1)}
          </Text>
          <Text style={{ fontSize: 12 * fontScale }} className="font-bold text-cognac">
            {detail.unit}
          </Text>
        </View>

        <View className="rounded-lg bg-champagne px-2.5 py-0.5 border border-taupe/20">
          <Text style={{ fontSize: 11 * fontScale }} className="font-semibold text-taupe">
            Ideal: {detail.targetRange}
          </Text>
        </View>
      </View>

      {/* Bottom Progress Bar */}
      <View className="mt-3">
        <View className="h-2.5 w-full overflow-hidden rounded-full bg-champagne border border-taupe/15">
          <View
            className={`h-full rounded-full ${detail.barColor}`}
            style={{ width: `${detail.percentage}%` }}
          />
        </View>
      </View>
    </View>
  );
});
