import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { Modal } from '../../components/common/AppModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Info,
  FileText,
  ShieldAlert,
  ChevronRight,
  X,
  CheckCircle2,
  Sparkles,
} from 'lucide-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import { LegalModal, readAssetAsText } from '../../components/LegalModal';

interface ParsedAboutDoc {
  appName: string;
  tagline: string;
  description: string;
  highlights: { title: string; description: string }[];
  credits: string;
}

function parseAboutDocument(mdText: string): ParsedAboutDoc {
  if (!mdText) {
    return {
      appName: Application.applicationName || 'SoilSync',
      tagline: 'Smart Agricultural Intelligence & Soil Diagnostics',
      description:
        'SoilSync is an end-to-end smart agriculture and soil intelligence platform designed for modern farming.',
      highlights: [],
      credits: 'Developed with care by the SoilSync Engineering Team.',
    };
  }

  const lines = mdText.split('\n');
  let tagline = 'Smart Agricultural Intelligence & Soil Diagnostics';
  let descLines: string[] = [];
  let credits = 'Developed with care by the SoilSync Engineering Team.';
  const highlights: { title: string; description: string }[] = [];

  const rawSections = mdText.split('\n## ');

  // Extract tagline & intro from first block
  const firstBlockLines = rawSections[0].split('\n');
  let nonHeaderLines = firstBlockLines.filter((l) => !l.startsWith('# ') && l.trim().length > 0);
  if (nonHeaderLines.length > 0) {
    tagline = nonHeaderLines[0].trim();
    descLines = nonHeaderLines.slice(1);
  }

  // Parse remaining ## sections
  rawSections.slice(1).forEach((rawSec) => {
    const secLines = rawSec.split('\n');
    const header = secLines[0].trim().toLowerCase();
    const remaining = secLines.slice(1);

    if (header.includes('capabilities') || header.includes('features')) {
      remaining.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
          const match = trimmed.match(/^[-*]\s*\*\*(.*?)\*\*[:\s]+(.*)$/);
          if (match) {
            highlights.push({
              title: match[1].trim(),
              description: match[2].trim(),
            });
          }
        }
      });
    } else if (header.includes('credits') || header.includes('team')) {
      credits = remaining.join('\n').trim();
    }
  });

  return {
    appName: Application.applicationName || 'SoilSync',
    tagline,
    description: descLines.join('\n').trim(),
    highlights,
    credits,
  };
}

export default function AboutSettings() {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);
  const [aboutDoc, setAboutDoc] = useState<ParsedAboutDoc | null>(null);
  const insets = useSafeAreaInsets();

  // Dynamic application values via expo-application
  const appName = Application.applicationName || 'SoilSync';
  const appVersion = Application.nativeApplicationVersion || '1.0.0';
  const buildNumber = Application.nativeBuildVersion || '1';

  useEffect(() => {
    async function loadAboutDocument() {
      try {
        const aboutText = await readAssetAsText(require('../../about-app.md'));
        setAboutDoc(parseAboutDocument(aboutText));
      } catch (err) {
        console.warn('Failed to load dynamic about-app.md:', err);
      }
    }
    loadAboutDocument();
  }, []);

  const Item = ({
    icon: Icon,
    title,
    subtitle,
    onPress,
  }: {
    icon: any;
    title: string;
    subtitle: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3.5 active:scale-[0.99] active:opacity-75"
    >
      <View className="mr-3.5 h-10 w-10 items-center justify-center rounded-xl bg-cognac/10">
        <Icon color="#8C4522" size={20} strokeWidth={2.2} />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-bold tracking-tight text-espresso">{title}</Text>
        <Text className="mt-0.5 text-xs text-taupe">{subtitle}</Text>
      </View>
      <ChevronRight color="#8C7C70" size={18} strokeWidth={2.2} />
    </TouchableOpacity>
  );

  const displayAbout = aboutDoc || {
    appName,
    tagline: 'Smart Agricultural Intelligence & Soil Diagnostics',
    description:
      'SoilSync is an end-to-end smart agriculture and soil intelligence platform designed for modern farming. By pairing real-time IoT soil sensors with edge AI computer vision diagnostics, SoilSync empowers farmers, agronomists, and researchers to make data-driven decisions that optimize crop yield and preserve soil health.',
    highlights: [
      {
        title: 'Real-time Telemetry Monitoring',
        description:
          'Continuously track soil moisture, temperature, pH levels, NPK nutrient concentrations, and ambient microclimate conditions.',
      },
      {
        title: 'Edge AI Crop & Soil Diagnostics',
        description:
          'Scan plant foliage and soil samples using on-device neural networks to instantly detect crop diseases, pest risks, and nutrient deficiencies.',
      },
      {
        title: 'Interactive Field & Bed Mapping',
        description:
          'Map farm boundaries, construct virtual garden bed structures, tag soil samples with GPS precision, and monitor plot performance.',
      },
      {
        title: 'Intelligent Moisture & Climate Alerts',
        description:
          'Receive push alerts for critical soil dehydration, irrigation schedules, and localized weather warnings.',
      },
    ],
    credits: 'Developed with care by the SoilSync Engineering Team.',
  };

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView
        className="flex-1 px-5 pt-2"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 36) }}
        showsVerticalScrollIndicator={false}
      >
        {/* App Icon Header */}
        <View className="mb-6 mt-2 items-center">
          <View className="mb-3.5 h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/90 bg-white p-2 shadow-sm shadow-espresso/10">
            <Image
              source={require('../../assets/soilsync-icon.png')}
              className="h-full w-full rounded-2xl"
              resizeMode="contain"
            />
          </View>

          <Text className="text-2xl font-black tracking-tight text-espresso">
            {displayAbout.appName}
          </Text>
          <View className="mt-1.5 flex-row items-center rounded-full bg-cognac/10 px-3 py-0.5 border border-cognac/15">
            <Text className="text-xs font-bold text-cognac">Version {appVersion}</Text>
          </View>

          <Text className="mt-2 text-center text-xs text-taupe px-6">
            {displayAbout.tagline}
          </Text>
        </View>

        {/* Menu Items */}
        <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
          Information & Legal
        </Text>

        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5 mb-5">
          <Item
            icon={Info}
            title="About App"
            subtitle="Platform overview, features & mission"
            onPress={() => setShowAboutModal(true)}
          />
          <View className="ml-16 mr-4 h-[1px] bg-black/5" />
          <Item
            icon={FileText}
            title="Terms of Service"
            subtitle="Usage policies & service agreements"
            onPress={() => setLegalModalType('terms')}
          />
          <View className="ml-16 mr-4 h-[1px] bg-black/5" />
          <Item
            icon={ShieldAlert}
            title="Privacy Policy"
            subtitle="Device permissions & data protection"
            onPress={() => setLegalModalType('privacy')}
          />
        </View>

        {/* System Build Specs Card */}
        <View className="rounded-[24px] border border-white/90 bg-white/70 p-4 shadow-sm shadow-espresso/5">
          <Text className="text-xs font-bold text-espresso">System Release Info</Text>
          <View className="mt-2 flex-row justify-between border-b border-cognac/10 pb-1.5">
            <Text className="text-xs text-taupe">Application Version</Text>
            <Text className="text-xs font-medium text-espresso">{appVersion}</Text>
          </View>
          <View className="mt-1.5 flex-row justify-between border-b border-cognac/10 pb-1.5">
            <Text className="text-xs text-taupe">Build Number (versionCode)</Text>
            <Text className="text-xs font-medium text-espresso">{buildNumber}</Text>
          </View>
          <View className="mt-1.5 flex-row justify-between border-b border-cognac/10 pb-1.5">
            <Text className="text-xs text-taupe">Package ID</Text>
            <Text className="text-xs font-medium text-espresso">
              {Application.applicationId || 'com.shijaydev.SoilSync'}
            </Text>
          </View>
          <View className="mt-1.5 flex-row justify-between">
            <Text className="text-xs text-taupe">Status</Text>
            <Text className="text-xs font-semibold text-emerald-600">Production Ready</Text>
          </View>
        </View>

        {/* Footer */}
        <Text className="mt-8 mb-4 text-center text-xs text-taupe">
          © 2026 SoilSync Team. All rights reserved.
        </Text>
      </ScrollView>

      {/* MODAL 1: ABOUT APP */}
      <Modal
        visible={showAboutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAboutModal(false)}
      >
        <SafeAreaView
          className="flex-1 bg-champagne"
          style={{
            paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
          }}
        >
          {/* Modal Header */}
          <View className="flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
                <Info color="#8C4522" size={20} strokeWidth={2.2} />
              </View>
              <Text className="text-xl font-bold text-espresso">About SoilSync</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowAboutModal(false)}
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
              {/* Top Hero Section */}
              <View className="items-center mb-6 border-b border-cognac/10 pb-6">
                <View className="h-20 w-20 items-center justify-center rounded-2xl bg-champagne border border-cognac/15 p-2 mb-3 shadow-sm">
                  <Image
                    source={require('../../assets/soilsync-icon.png')}
                    className="h-full w-full rounded-xl"
                    resizeMode="contain"
                  />
                </View>
                <Text className="text-2xl font-black text-espresso">{displayAbout.appName}</Text>
                <Text className="text-xs font-medium text-cognac mt-0.5">{displayAbout.tagline}</Text>
                <Text className="mt-3 text-center text-xs leading-relaxed text-taupe px-2">
                  {displayAbout.description}
                </Text>
              </View>

              {/* Highlights Header */}
              {displayAbout.highlights && displayAbout.highlights.length > 0 && (
                <>
                  <View className="mb-4 flex-row items-center">
                    <Sparkles color="#D99C2B" size={18} strokeWidth={2.2} />
                    <Text className="ml-2 text-xs font-bold uppercase tracking-wider text-taupe">
                      Key Platform Capabilities
                    </Text>
                  </View>

                  {/* Highlights List */}
                  {displayAbout.highlights.map((item, idx) => (
                    <View
                      key={idx}
                      className={
                        idx < displayAbout.highlights.length - 1
                          ? 'border-b border-cognac/10 pb-4 mb-4'
                          : 'pb-2'
                      }
                    >
                      <View className="flex-row items-center mb-1">
                        <CheckCircle2 color="#8C4522" size={16} strokeWidth={2.2} />
                        <Text className="text-base font-bold text-espresso ml-2">{item.title}</Text>
                      </View>
                      <Text className="ml-6 text-xs leading-relaxed text-taupe">{item.description}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Credits */}
              <View className="mt-4 pt-4 border-t border-cognac/10">
                <Text className="text-center text-xs font-medium text-cognac">
                  {displayAbout.credits}
                </Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* SHARED REUSABLE LEGAL MODAL FOR TERMS & PRIVACY */}
      <LegalModal
        visible={legalModalType !== null}
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />
    </View>
  );
}
