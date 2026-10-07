import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  Share,
  Linking,
  Dimensions,
  Platform,
} from 'react-native';
import { AppAlert as Alert } from '../common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../common/AppModal';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { TrophyIcon, CheckCircleIcon, FlagIcon, StarIcon } from './LearningIcons';
import { QRCodeView } from '../common/QRCodeView';
import {
  saveUserCertificate,
  getUserCertificate,
  sendCertificateEmailViaResend,
  type UserCertificateRecord,
} from '../../lib/db-operations';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Website Certificate Base URL for soilsync.app
const WEBSITE_CERTIFICATE_BASE_URL =
  process.env.EXPO_PUBLIC_WEBSITE_CERTIFICATE_URL || 'https://soilsync.app/eCertificate/';

// ── Compact SVG Icons ──
function CopyIcon({ size = 14, color = '#8C4522' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke={color} strokeWidth={2} />
      <Path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}

function CheckIcon({ size = 14, color = '#059669' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17l-5-5"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShareIcon({ size = 16, color = '#8C4522' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="18" cy="5" r="3" stroke={color} strokeWidth={2} />
      <Circle cx="6" cy="12" r="3" stroke={color} strokeWidth={2} />
      <Circle cx="18" cy="19" r="3" stroke={color} strokeWidth={2} />
      <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function MailIcon({ size = 16, color = '#8C7C70' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth={2} />
      <Path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function AwardIcon({ size = 18, color = '#8C4522' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="6" stroke={color} strokeWidth={2} />
      <Path
        d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MaximizeIcon({ size = 16, color = '#8C4522' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ExternalLinkIcon({ size = 16, color = '#E2E8F0' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 3h6v6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 14L21 3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface FinishLineModalProps {
  visible: boolean;
  onClose: () => void;
  totalModulesCount: number;
  totalStarsEarned: number;
  isCompleted: boolean;
  userProfile?: {
    userId?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
  onClaimFinish?: () => void;
}

export function FinishLineModal({
  visible,
  onClose,
  totalModulesCount,
  totalStarsEarned,
  isCompleted,
  userProfile,
  onClaimFinish,
}: FinishLineModalProps) {
  const { isOnline } = useNetworkStatus();
  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [email, setEmail] = useState(userProfile?.email || '');

  const [isLoading, setIsLoading] = useState(false);
  const [certificate, setCertificate] = useState<UserCertificateRecord | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showFullscreenCert, setShowFullscreenCert] = useState(false);

  // Initialize or check for existing certificate when modal opens
  useEffect(() => {
    if (visible) {
      if (userProfile?.firstName) setFirstName(userProfile.firstName);
      if (userProfile?.lastName) setLastName(userProfile.lastName);
      if (userProfile?.email) setEmail(userProfile.email);

      if (userProfile?.userId) {
        getUserCertificate(userProfile.userId).then((existingCert) => {
          if (existingCert) {
            setCertificate(existingCert);
          }
        });
      }
    }
  }, [visible, userProfile]);

  const certificateUrl = certificate
    ? `${WEBSITE_CERTIFICATE_BASE_URL.replace(/\/$/, '')}/?id=${certificate.id}`
    : '';

  const handleGenerateCertificate = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(
        'Incomplete Name',
        'Please enter your first and last name to be inscribed on the certificate.'
      );
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert(
        'Invalid Email',
        'Please provide a valid email address to receive your certificate link.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const userId = userProfile?.userId || 'guest-user';
      const newCert = await saveUserCertificate({
        userId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        totalModules: totalModulesCount,
        totalStars: totalStarsEarned,
      });

      setCertificate(newCert);

      if (onClaimFinish) {
        onClaimFinish();
      }

      // Online-only: trigger Resend email delivery via Edge Function
      if (isOnline) {
        const emailResult = await sendCertificateEmailViaResend(newCert);
        if (emailResult.success) {
          Alert.alert(
            '🎓 Certificate Created & Sent!',
            `Your official E-Certificate has been generated and dispatched to ${email.trim()} via Resend.`
          );
        } else {
          Alert.alert(
            '🎓 Certificate Created!',
            `Your certificate was generated! Note regarding email delivery: ${emailResult.message || 'Resend API key not configured or domain restricted.'}`
          );
        }
      } else {
        Alert.alert(
          '🎓 Certificate Created Offline!',
          `Your certificate has been created and saved locally on your device. Once you are back online, it will sync upstream and email dispatch can proceed.`
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Generation Error',
        err?.message || 'Failed to generate certificate. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!certificateUrl) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);

    try {
      await Share.share({
        title: 'SoilSync Certificate Link',
        message: certificateUrl,
        url: certificateUrl,
      });
    } catch (err) {
      console.warn('Share/Copy error:', err);
    }
  };

  const handleShareLink = async () => {
    if (!certificateUrl) return;
    try {
      await Share.share({
        title: 'SoilSync Agricultural Mastery E-Certificate',
        message: `🎓 View my verified SoilSync Agricultural Mastery Certificate: ${certificateUrl}`,
        url: certificateUrl,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  const handleOpenWebCertificate = async () => {
    if (!certificateUrl) return;
    try {
      const supported = await Linking.canOpenURL(certificateUrl);
      if (supported) {
        await Linking.openURL(certificateUrl);
      } else {
        Alert.alert('Public Certificate Link', certificateUrl);
      }
    } catch (err) {
      console.warn('Open URL error:', err);
    }
  };

  const formattedDate = certificate?.issue_date
    ? new Date(certificate.issue_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBackdrop}>
          <View style={styles.sheetContainer}>
            {/* Header Bar */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.headerIconBadge}>
                  <FlagIcon size={18} color="#D97706" />
                </View>
                <Text style={styles.headerTitle}>Summit Finish Line • E-Certificate</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.closeButton}>
                <X size={18} color="#523625" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}>
              {/* Grand Trophy Card */}
              <View style={styles.trophyCard}>
                <View style={styles.trophyIconCircle}>
                  <TrophyIcon size={44} color="#D97706" strokeWidth={2.2} />
                  <View style={styles.completedBadge}>
                    <CheckCircleIcon size={16} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={styles.trophyTitle}>Summit of Agriculture!</Text>
                <Text style={styles.trophySubtitle}>
                  You have journeyed across all foundational farming modules and conquered every
                  checkpoint quiz.
                </Text>

                {/* Stats pill row */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Modules</Text>
                    <Text style={styles.statValue}>{totalModulesCount} Mastered</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Stars</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <StarIcon size={14} color="#D97706" fill="#D97706" />
                      <Text style={[styles.statValue, { color: '#B45309', marginLeft: 3 }]}>
                        {totalStarsEarned} ⭐
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Status</Text>
                    <Text style={[styles.statValue, { color: '#059669' }]}>
                      {certificate ? 'Verified' : isCompleted ? 'Completed' : 'Unlocked'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── STATE 1: CREDENTIALS CHECK & CLAIM FORM (If no certificate yet) ── */}
              {!certificate ? (
                <View style={styles.formContainer}>
                  <View style={styles.formHeaderRow}>
                    <AwardIcon size={18} color="#8C4522" />
                    <Text style={styles.formHeaderTitle}>Confirm Certificate Inscription</Text>
                  </View>
                  <Text style={styles.formDescription}>
                    Please double check your first name, last name, and email. These will be
                    permanently printed on your official graduation certificate and sent via Resend.
                  </Text>

                  {/* ROW 1: First Name & Last Name (Side by Side) */}
                  <View style={styles.inputRow}>
                    <View style={styles.inputCol}>
                      <Text style={styles.inputLabel}>First Name</Text>
                      <TextInput
                        value={firstName}
                        onChangeText={setFirstName}
                        maxLength={255}
                        placeholder="e.g. Juan"
                        placeholderTextColor="#94A3B8"
                        style={styles.textInput}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <Text style={styles.inputLabel}>Last Name</Text>
                      <TextInput
                        value={lastName}
                        onChangeText={setLastName}
                        maxLength={255}
                        placeholder="e.g. Dela Cruz"
                        placeholderTextColor="#94A3B8"
                        style={styles.textInput}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  {/* ROW 2: Email Address (Full Width) */}
                  <View style={styles.inputRowFull}>
                    <Text style={styles.inputLabel}>
                      Email Address (For Certificate Link Delivery)
                    </Text>
                    <View style={styles.emailInputWrapper}>
                      <MailIcon size={16} color="#8C7C70" />
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        maxLength={255}
                        placeholder="e.g. juan@gmail.com"
                        placeholderTextColor="#94A3B8"
                        style={styles.emailTextInput}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  {/* Claim Button */}
                  <TouchableOpacity
                    onPress={handleGenerateCertificate}
                    disabled={isLoading}
                    activeOpacity={0.88}
                    style={[styles.primaryButton, { opacity: isLoading ? 0.7 : 1 }]}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <AwardIcon size={18} color="#FFFFFF" />
                        <Text style={styles.primaryButtonText}>Generate & Claim E-Certificate</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* ── STATE 2: CERTIFICATE ISSUED DASHBOARD (QR CODE, PREVIEW & LINK) ── */
                <View style={styles.issuedContainer}>
                  {/* Notification Badge */}
                  <View style={styles.emailSentBadge}>
                    <CheckCircleIcon size={16} color="#059669" />
                    <Text style={styles.emailSentText}>
                      E-Certificate generated & sent to {certificate.email}
                    </Text>
                  </View>

                  {/* 16:9 Certificate Mockup Preview Card (Tap to View Fullscreen) */}
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => setShowFullscreenCert(true)}
                    style={styles.certPreviewContainer}>
                    <View style={styles.certCard}>
                      <Image
                        source={require('../../assets/images/certificate_template_2.jpg')}
                        style={styles.certImage}
                        resizeMode="contain"
                      />

                      {/* Centered Recipient Name in Blank Slot (top ~37.5%) */}
                      <View style={styles.certCenterSlot} pointerEvents="none">
                        <Text numberOfLines={1} style={styles.certRecipientName}>
                          {certificate.recipient_name}
                        </Text>
                      </View>

                      {/* Bottom Left Date and Cert No on "Issued on: ___" line */}
                      <View style={styles.certDateSlot} pointerEvents="none">
                        <Text style={styles.certDateValue}>{formattedDate}</Text>
                        <Text style={styles.certCodeValue}>
                          Cert No: {certificate.certificate_code || 'SOIL-CERT-MASTER'}
                        </Text>
                      </View>

                      {/* Tap to expand pill badge */}
                      <View style={styles.expandBadge}>
                        <MaximizeIcon size={12} color="#FFFFFF" />
                        <Text style={styles.expandBadgeText}>Tap to Enlarge</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* QR Code Section */}
                  <View style={styles.qrSectionCard}>
                    <Text style={styles.qrHeading}>Scan to Verify Credential</Text>
                    <Text style={styles.qrSubtitle}>
                      Scan this QR code with any mobile camera to verify official certification
                      details.
                    </Text>

                    <View style={styles.qrWrapper}>
                      <QRCodeView value={certificateUrl} size={160} />
                    </View>
                  </View>

                  {/* Shareable Link Box */}
                  <View style={styles.linkCard}>
                    <Text style={styles.linkLabel}>Verification ID Code:</Text>
                    <View style={styles.linkRow}>
                      <Text numberOfLines={1} style={styles.linkText}>
                        {certificate.certificate_code}
                      </Text>
                      <TouchableOpacity
                        onPress={handleCopyLink}
                        activeOpacity={0.7}
                        style={styles.copyBtn}>
                        {isCopied ? (
                          <CheckIcon size={14} color="#059669" />
                        ) : (
                          <CopyIcon size={14} color="#8C4522" />
                        )}
                        <Text
                          style={[styles.copyBtnText, { color: isCopied ? '#059669' : '#8C4522' }]}>
                          {isCopied ? 'Copied' : 'Copy'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Action Buttons Row */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      onPress={handleOpenWebCertificate}
                      activeOpacity={0.85}
                      style={styles.openBrowserBtn}>
                      <ExternalLinkIcon size={16} color="#FFFFFF" />
                      <Text style={styles.openBrowserBtnText}>Open in Browser</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleShareLink}
                      activeOpacity={0.85}
                      style={styles.shareBtn}>
                      <ShareIcon size={16} color="#8C4522" />
                      <Text style={styles.shareBtnText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── FULLSCREEN IN-APP CERTIFICATE VIEWER MODAL (PORTRAIT ONLY) ── */}
      {certificate && (
        <Modal
          visible={showFullscreenCert}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setShowFullscreenCert(false)}>
          <View style={styles.fullscreenContainer}>
            {/* Top Toolbar */}
            <View style={styles.fullscreenHeader}>
              <View style={styles.fullscreenHeaderLeft}>
                <View style={styles.fullscreenIconCircle}>
                  <AwardIcon size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.fullscreenHeaderTitle}>Official Certificate</Text>
                  <Text style={styles.fullscreenHeaderSubtitle}>SoilSync Verified Credential</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowFullscreenCert(false)}
                style={styles.fullscreenCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={20} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            {/* Portrait Certificate Body (Scrollable for all screen sizes) */}
            <ScrollView
              style={styles.fullscreenScrollView}
              contentContainerStyle={styles.fullscreenScrollContent}
              showsVerticalScrollIndicator={false}>
              {/* Full Uncropped 16:9 Certificate Card in Portrait View */}
              <View style={styles.fullscreenCertContainer}>
                <View style={styles.fullscreenCertCard}>
                  <Image
                    source={require('../../assets/images/certificate_template_2.jpg')}
                    style={styles.certImage}
                    resizeMode="contain"
                  />

                  {/* Centered Recipient Name */}
                  <View style={styles.fullscreenNameSlot} pointerEvents="none">
                    <Text numberOfLines={1} style={styles.fullscreenNameText}>
                      {certificate.recipient_name}
                    </Text>
                  </View>

                  {/* Bottom Left Date & Cert No */}
                  <View style={styles.fullscreenDateSlot} pointerEvents="none">
                    <Text style={styles.fullscreenDateText}>{formattedDate}</Text>
                    <Text style={styles.fullscreenCodeText}>
                      Cert No: {certificate.certificate_code || 'SOIL-CERT-MASTER'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Certificate Meta & Verification Details Card */}
              <View style={styles.fullscreenDetailsCard}>
                <View style={styles.fullscreenDetailsHeader}>
                  <View style={styles.verifiedBadge}>
                    <CheckCircleIcon size={14} color="#059669" />
                    <Text style={styles.verifiedBadgeText}>Officially Verified & Recorded</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Recipient</Text>
                  <Text style={styles.detailValue}>{certificate.recipient_name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Course Completed</Text>
                  <Text style={styles.detailValue}>Organic Agriculture Fundamentals</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Issued On</Text>
                  <Text style={styles.detailValue}>{formattedDate}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Verification Code</Text>
                  <TouchableOpacity
                    onPress={handleCopyLink}
                    style={styles.codePill}
                    activeOpacity={0.7}>
                    <Text style={styles.codeText}>{certificate.certificate_code}</Text>
                    {isCopied ? (
                      <CheckIcon size={12} color="#059669" />
                    ) : (
                      <CopyIcon size={12} color="#D97706" />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.detailDivider} />

                <Text style={styles.issuingText}>
                  Issued by the Office of the City Agriculturist San Pablo City, Laguna State
                  Polytechnic University & SoilSync.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.fullscreenActionsContainer}>
                <TouchableOpacity
                  onPress={handleShareLink}
                  activeOpacity={0.88}
                  style={styles.fullscreenPrimaryBtn}>
                  <ShareIcon size={18} color="#FFFFFF" />
                  <Text style={styles.fullscreenPrimaryBtnText}>Share Certificate Link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenWebCertificate}
                  activeOpacity={0.88}
                  style={styles.fullscreenSecondaryBtn}>
                  <ExternalLinkIcon size={16} color="#E2E8F0" />
                  <Text style={styles.fullscreenSecondaryBtnText}>
                    Open Public Verification Link
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
    </>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetContainer: {
    maxHeight: '94%',
    height: '92%',
    width: '100%',
    backgroundColor: '#FDFBF7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    overflow: 'hidden',
  },
  header: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8C4522',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  trophyCard: {
    marginVertical: 10,
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  trophyIconCircle: {
    position: 'relative',
    marginBottom: 10,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3.5,
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 12,
    backgroundColor: '#10B981',
    padding: 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  trophyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2A1610',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  trophySubtitle: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#8C4522',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
  },
  statsRow: {
    marginTop: 14,
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    borderRadius: 16,
    backgroundColor: '#FDFBF7',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2A1610',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignSelf: 'center',
  },

  /* ── Form Styles ── */
  formContainer: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  formHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#8C4522',
  },
  formDescription: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  inputCol: {
    flex: 1,
  },
  inputRowFull: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2A1610',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  emailTextInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C4522',
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* ── Issued State Styles ── */
  issuedContainer: {
    marginTop: 10,
  },
  emailSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 6,
  },
  emailSentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  certPreviewContainer: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  certCard: {
    width: '100%',
    aspectRatio: 1920 / 1080,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  certImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  certCenterSlot: {
    position: 'absolute',
    top: '30%',
    left: '2.8%',
    right: '28%',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  certRecipientName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'left',
    letterSpacing: 0.1,
  },
  certDateSlot: {
    position: 'absolute',
    bottom: '3.65%',
    left: '11.8%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  certDateValue: {
    fontSize: 4.8,
    fontWeight: '600',
    color: '#334155',
  },
  certCodeValue: {
    fontSize: 4.3,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.1,
  },
  expandBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  expandBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  qrSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 12,
  },
  qrHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2A1610',
  },
  qrSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginVertical: 6,
    maxWidth: 260,
    lineHeight: 15,
  },
  qrWrapper: {
    marginVertical: 10,
  },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 14,
  },
  linkLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#8C7C70',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  linkText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
    marginRight: 8,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  openBrowserBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C4522',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    gap: 6,
  },
  openBrowserBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#8C4522',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 6,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8C4522',
  },

  /* ── Fullscreen Modal Styles (Portrait Only) ── */
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 10,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  fullscreenHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fullscreenIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  fullscreenHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 1,
  },
  fullscreenCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenScrollView: {
    flex: 1,
  },
  fullscreenScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  fullscreenCertContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  fullscreenCertCard: {
    width: '100%',
    aspectRatio: 1920 / 1080,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  fullscreenNameSlot: {
    position: 'absolute',
    top: '34.5%',
    left: '2.8%',
    right: '28%',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  fullscreenNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'left',
    letterSpacing: 0.1,
  },
  fullscreenDateSlot: {
    position: 'absolute',
    bottom: '3.6%',
    left: '11.8%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fullscreenDateText: {
    fontSize: 5.5,
    fontWeight: '600',
    color: '#334155',
  },
  fullscreenCodeText: {
    fontSize: 4.9,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.15,
  },
  fullscreenDetailsCard: {
    width: '100%',
    marginTop: 20,
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fullscreenDetailsHeader: {
    marginBottom: 14,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    maxWidth: '60%',
    textAlign: 'right',
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  codeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  detailDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  issuingText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#94A3B8',
    lineHeight: 15,
    textAlign: 'center',
  },
  fullscreenActionsContainer: {
    width: '100%',
    marginTop: 16,
    gap: 10,
  },
  fullscreenPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C4522',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    gap: 8,
  },
  fullscreenPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  fullscreenSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 8,
  },
  fullscreenSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
});
