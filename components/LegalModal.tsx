import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { Modal } from './common/AppModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FileText,
  ShieldAlert,
  ShieldCheck,
  X,
  Camera,
  MapPin,
  HardDrive,
  Bell,
  Bluetooth,
  Fingerprint,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

const PERMISSION_ICONS: Record<string, any> = {
  camera: Camera,
  location: MapPin,
  storage: HardDrive,
  notifications: Bell,
  bluetooth: Bluetooth,
  biometrics: Fingerprint,
};

interface PermissionBullet {
  key: string;
  name: string;
  purpose: string;
}

interface Section {
  heading: string;
  content: string;
  permissions?: PermissionBullet[];
}

export interface ParsedLegalDoc {
  lastUpdated: string;
  intro: string;
  sections: Section[];
}

export function parseLegalMarkdown(mdText: string): ParsedLegalDoc {
  if (!mdText) return { lastUpdated: '', intro: '', sections: [] };

  const lines = mdText.split('\n');
  let lastUpdated = '';
  let introLines: string[] = [];
  let startedSections = false;
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith('last updated:')) {
      lastUpdated = line.replace(/last updated:\s*/i, '');
      continue;
    }
    if (line.startsWith('## ')) {
      startedSections = true;
    }
    if (!startedSections) {
      if (!line.startsWith('# ') && line.length > 0) {
        introLines.push(line);
      }
    }
  }

  const rawSections = mdText.split('\n## ');
  rawSections.forEach((rawSec, index) => {
    if (index === 0) return;

    const secLines = rawSec.split('\n');
    const heading = secLines[0].trim();
    const remainingLines = secLines.slice(1);

    const bullets: PermissionBullet[] = [];
    const contentLines: string[] = [];

    remainingLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
        const match = trimmed.match(/^[-*]\s*\*\*(.*?)\*\*[:\s]+(.*)$/);
        if (match) {
          const name = match[1].trim();
          const purpose = match[2].trim();
          let key = name.toLowerCase();
          if (key.includes('camera')) key = 'camera';
          else if (key.includes('location') || key.includes('gps')) key = 'location';
          else if (key.includes('storage') || key.includes('library') || key.includes('photo'))
            key = 'storage';
          else if (key.includes('notification')) key = 'notifications';
          else if (key.includes('bluetooth')) key = 'bluetooth';
          else if (
            key.includes('biometric') ||
            key.includes('authentication') ||
            key.includes('face') ||
            key.includes('fingerprint')
          )
            key = 'biometrics';
          else key = 'shield';

          bullets.push({ name, purpose, key });
        } else {
          contentLines.push(line);
        }
      } else {
        contentLines.push(line);
      }
    });

    sections.push({
      heading,
      content: contentLines.join('\n').trim(),
      permissions: bullets.length > 0 ? bullets : undefined,
    });
  });

  return {
    lastUpdated,
    intro: introLines.join('\n').trim(),
    sections,
  };
}

export async function readAssetAsText(assetModule: any): Promise<string> {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  if (asset.localUri) {
    return await FileSystem.readAsStringAsync(asset.localUri);
  } else if (asset.uri) {
    const response = await fetch(asset.uri);
    return await response.text();
  }
  throw new Error('Asset could not be loaded');
}

export function LegalModal({
  visible,
  type,
  onClose,
}: {
  visible: boolean;
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<ParsedLegalDoc | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible || !type) return;

    let isMounted = true;
    async function loadDoc() {
      try {
        const asset =
          type === 'terms'
            ? require('../terms.md')
            : require('../privacy-policy.md');
        const text = await readAssetAsText(asset);
        if (isMounted) {
          setDoc(parseLegalMarkdown(text));
        }
      } catch (err) {
        console.warn(`Failed to load ${type} doc:`, err);
      }
    }

    loadDoc();
    return () => {
      isMounted = false;
    };
  }, [visible, type]);

  if (!visible || !type) return null;

  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const Icon = isTerms ? FileText : ShieldAlert;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#FBF8F4',
          paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
        }}
      >
        {/* Modal Header */}
        <View className="flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
          <View className="flex-row items-center">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
              <Icon color="#8C4522" size={20} strokeWidth={2.2} />
            </View>
            <Text className="text-xl font-bold text-espresso">{title}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            className="h-8 w-8 items-center justify-center rounded-full bg-champagne"
          >
            <X color="#8C7C70" size={20} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 48) }}
          showsVerticalScrollIndicator={false}
        >
          {/* Unified Document Container */}
          <View className="rounded-3xl border border-white/90 bg-white p-6 shadow-sm shadow-espresso/5">
            {/* Effective Date & Intro */}
            <View className="border-b border-cognac/10 pb-5 mb-5">
              <View className="flex-row items-center mb-1">
                <ShieldCheck color="#8C4522" size={16} strokeWidth={2.2} />
                <Text className="ml-1.5 text-xs font-bold text-cognac uppercase tracking-wider">
                  Last Updated: {doc ? doc.lastUpdated : 'August 21, 2026'}
                </Text>
              </View>
              <Text className="mt-1.5 text-xs leading-relaxed text-taupe">
                {doc
                  ? doc.intro
                  : isTerms
                  ? 'Welcome to SoilSync. By using our services, you agree to these terms.'
                  : 'SoilSync values your privacy and data security.'}
              </Text>
            </View>

            {/* Sections divided by simple lines */}
            {doc &&
              doc.sections.map((sec, idx) => (
                <View
                  key={idx}
                  className={
                    idx < doc.sections.length - 1
                      ? 'border-b border-cognac/10 pb-5 mb-5'
                      : 'pb-2'
                  }
                >
                  <Text className="text-base font-bold text-espresso">{sec.heading}</Text>
                  <Text className="mt-1.5 text-xs leading-relaxed text-taupe">{sec.content}</Text>

                  {/* If section contains permissions */}
                  {sec.permissions && (
                    <View className="mt-3.5 pt-2">
                      {sec.permissions.map((perm, pIdx) => {
                        const PermIcon = PERMISSION_ICONS[perm.key] || ShieldAlert;
                        return (
                          <View key={pIdx} className="flex-row items-start mt-2.5">
                            <View className="mr-2.5 mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-champagne">
                              <PermIcon color="#8C4522" size={14} strokeWidth={2.2} />
                            </View>
                            <View className="flex-1">
                              <Text className="text-xs font-bold text-espresso">{perm.name}</Text>
                              <Text className="text-xs text-taupe leading-relaxed mt-0.5">
                                {perm.purpose}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}

            <View className="mt-4 pt-4 border-t border-cognac/10">
              <Text className="text-center text-xs text-taupe">
                © 2026 SoilSync Platform. All Rights Reserved.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
