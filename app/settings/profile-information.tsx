import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal } from '../../components/common/AppModal';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import { useRouter, useNavigation } from 'expo-router';
import { Save, Mail, User, Phone, Check, Pencil, X, WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { UnsavedChangesModal } from '../../components/UnsavedChangesModal';
import {
  PRESET_PROFILE_ICONS,
  resolveUserAvatarUrl,
  getAvatarImageSource,
  PresetProfileIcon,
} from '../../lib/profile-icons';

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection to update your profile.');
      return false;
    }
    return true;
  } catch {
    Alert.alert('No Connection', 'Unable to verify network status. Please try again.');
    return false;
  }
}

interface AvatarItemProps {
  id: string;
  source: any;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AvatarItem({ source, label, isSelected, onSelect }: AvatarItemProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onSelect}
      style={[
        styles.avatarCard,
        isSelected ? styles.avatarCardSelected : styles.avatarCardDefault,
      ]}>
      <View style={styles.avatarCircle}>
        <Image
          source={source}
          style={styles.avatarImg}
          resizeMode="cover"
        />
        {isSelected && (
          <View style={styles.checkOverlay}>
            <View style={styles.checkIconBadge}>
              <Check size={11} color="white" strokeWidth={3} />
            </View>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.avatarText,
          isSelected ? styles.avatarTextSelected : styles.avatarTextDefault,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ProfileInformation() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, updateProfile, syncNow } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileIconUrl, setProfileIconUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Avatar picker modal visibility state
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);

  // Original values for change detection
  const [originalEmail, setOriginalEmail] = useState('');
  const [originalFirstName, setOriginalFirstName] = useState('');
  const [originalLastName, setOriginalLastName] = useState('');
  const [originalPhoneNumber, setOriginalPhoneNumber] = useState('');
  const [originalProfileIconUrl, setOriginalProfileIconUrl] = useState('');

  // Unsaved changes navigation guard state
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingActionRef = useRef<any>(null);
  const isBypassingGuardRef = useRef(false);

  const userId = user?.id;

  useEffect(() => {
    if (userId) {
      fetchProfile(true);
    }
  }, [userId]);

  const hasChanges = () => {
    return (
      email !== originalEmail ||
      firstName !== originalFirstName ||
      lastName !== originalLastName ||
      profileIconUrl !== originalProfileIconUrl
    );
  };

  const hasChangesRef = useRef(false);
  hasChangesRef.current = hasChanges();

  // Attach navigation guard once on mount
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== 'function') return;
    try {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        if (!hasChangesRef.current || isBypassingGuardRef.current) {
          return;
        }
        e.preventDefault();
        pendingActionRef.current = e.data.action;
        setShowUnsavedModal(true);
      });

      return unsubscribe;
    } catch (err) {
      console.warn('[ProfileInfo] navigation.addListener error:', err);
    }
  }, [navigation]);

  const fetchProfile = async (isInitial = false) => {
    if (!user) return;

    try {
      if (isInitial) {
        setFetching(true);
      }

      // Get email and metadata from Supabase Auth
      const currentEmail = user.email || '';
      const currentFirstName = user.user_metadata?.first_name || '';
      const currentLastName = user.user_metadata?.last_name || '';
      const metaAvatarUrl =
        user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      const metaProfileIconUrl = user.user_metadata?.profile_icon_url || null;

      setEmail(currentEmail);
      setFirstName(currentFirstName);
      setLastName(currentLastName);
      setOriginalEmail(currentEmail);
      setOriginalFirstName(currentFirstName);
      setOriginalLastName(currentLastName);

      // Get phone_number, avatar_url, and profile_icon_url from public.users table
      const { data, error } = await supabase
        .from('users')
        .select('phone_number, avatar_url, profile_icon_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data?.phone_number) {
        setPhoneNumber(data.phone_number);
        setOriginalPhoneNumber(data.phone_number);
      }

      const rawGoogleAvatar = data?.avatar_url || metaAvatarUrl || null;
      setAvatarUrl(rawGoogleAvatar);

      const activeProfileIcon =
        data?.profile_icon_url ||
        metaProfileIconUrl ||
        rawGoogleAvatar ||
        PRESET_PROFILE_ICONS[0].url;

      setProfileIconUrl(activeProfileIcon);
      setOriginalProfileIconUrl(activeProfileIcon);
    } catch (error) {
      console.error('[ProfileInfo] Error fetching profile:', error);
    } finally {
      if (isInitial) {
        setFetching(false);
      }
    }
  };

  const handleSave = async (onSuccessCallback?: () => void): Promise<boolean> => {
    if (!hasChanges()) {
      Alert.alert('No Changes', 'No changes were made to your profile.');
      return false;
    }

    if (!firstName.trim()) {
      Alert.alert('Validation Error', 'First name cannot be empty.');
      return false;
    }
    if (!lastName.trim()) {
      Alert.alert('Validation Error', 'Last name cannot be empty.');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Validation Error', 'Email cannot be empty.');
      return false;
    }

    if (!(await ensureOnline())) return false;

    try {
      setLoading(true);

      const updates: {
        email?: string;
        firstName?: string;
        lastName?: string;
        profileIconUrl?: string;
      } = {};

      if (email !== originalEmail) updates.email = email;
      if (firstName !== originalFirstName) updates.firstName = firstName;
      if (lastName !== originalLastName) updates.lastName = lastName;
      if (profileIconUrl !== originalProfileIconUrl) updates.profileIconUrl = profileIconUrl;

      await updateProfile(updates);

      // Update originals to reflect saved state
      setOriginalEmail(email);
      setOriginalFirstName(firstName);
      setOriginalLastName(lastName);
      setOriginalProfileIconUrl(profileIconUrl);

      // Background sync — fire and forget
      syncNow().catch((err) =>
        console.error('[ProfileInfo] Background sync after profile update failed:', err)
      );

      if (onSuccessCallback) {
        onSuccessCallback();
      } else {
        if (updates.email) {
          Alert.alert(
            'Profile Updated',
            'Your profile has been updated. A confirmation email has been sent to your new email address. Please confirm it to complete the email change.',
            [{ text: 'OK', onPress: () => navigateAway() }]
          );
        } else {
          Alert.alert('Success', 'Your profile has been updated.', [
            { text: 'OK', onPress: () => navigateAway() },
          ]);
        }
      }
      return true;
    } catch (error) {
      Alert.alert(
        'Update Failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const navigateAway = () => {
    isBypassingGuardRef.current = true;
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      navigation.dispatch(action);
    } else {
      router.back();
    }
  };

  const handleModalSave = async () => {
    const success = await handleSave(() => {
      setShowUnsavedModal(false);
      navigateAway();
    });
    if (!success) {
      setShowUnsavedModal(false);
    }
  };

  const handleModalDisregard = () => {
    setShowUnsavedModal(false);
    navigateAway();
  };

  const handleModalKeepEditing = () => {
    setShowUnsavedModal(false);
    pendingActionRef.current = null;
  };

  if (fetching) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8C4522" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  const currentDisplayName = `${firstName} ${lastName}`.trim() || 'SoilSync Member';
  const heroImageSource = getAvatarImageSource(profileIconUrl, avatarUrl);

  return (
    <>
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* ── Top Avatar Preview Header ── */}
        <View style={styles.headerCard}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              isOnline
                ? setShowAvatarPickerModal(true)
                : Alert.alert('Offline Mode', 'Changing your profile icon requires an active internet connection.')
            }
            style={styles.heroAvatarTouchable}>
            <View style={styles.heroAvatarWrapper}>
              <View style={styles.heroAvatarCircle}>
                <Image
                  source={heroImageSource}
                  style={styles.heroAvatarImg}
                  resizeMode="cover"
                />
              </View>
              {/* Pencil Edit Badge */}
              <View style={[styles.heroPencilBadge, !isOnline && { backgroundColor: '#8C7C70' }]}>
                <Pencil size={14} color="white" strokeWidth={2.4} />
              </View>
            </View>
          </TouchableOpacity>

          <Text style={styles.heroNameText}>{currentDisplayName}</Text>
          <Text style={styles.heroEmailText}>{email || 'SoilSync User'}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              isOnline
                ? setShowAvatarPickerModal(true)
                : Alert.alert('Offline Mode', 'Changing your profile icon requires an active internet connection.')
            }
            style={[styles.changeAvatarBtn, !isOnline && { opacity: 0.6 }]}>
            <Pencil size={12} color="#8C4522" strokeWidth={2.2} />
            <Text style={styles.changeAvatarBtnText}>
              {isOnline ? 'Change Profile Icon' : 'Icon Locked (Offline)'}
            </Text>
          </TouchableOpacity>
        </View>

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <WifiOff color="#B45309" size={18} strokeWidth={2.2} style={{ marginRight: 10 }} />
            <Text style={styles.offlineBannerText}>
              You are currently offline. Profile updates and credential modifications require an active internet connection.
            </Text>
          </View>
        )}

        {/* ── Personal Info Form Fields ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.formSectionHeader}>Account Details</Text>

          {/* Email */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Mail color="#8C4522" size={17} strokeWidth={2.2} />
              <Text style={styles.labelText}>Email</Text>
            </View>
            <TextInput
              style={[styles.input, !isOnline && styles.inputDisabled]}
              placeholder="your@email.com"
              placeholderTextColor="#8C7C70"
              value={email}
              onChangeText={setEmail}
              maxLength={255}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={isOnline}
            />
            {email !== originalEmail && (
              <Text style={styles.helperWarningText}>
                ⚠️ Changing your email requires confirmation via the new email address.
              </Text>
            )}
          </View>

          {/* First Name */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <User color="#8C4522" size={17} strokeWidth={2.2} />
              <Text style={styles.labelText}>First Name</Text>
            </View>
            <TextInput
              style={[styles.input, !isOnline && styles.inputDisabled]}
              placeholder="John"
              placeholderTextColor="#8C7C70"
              value={firstName}
              onChangeText={setFirstName}
              maxLength={255}
              editable={isOnline}
            />
          </View>

          {/* Last Name */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <User color="#8C4522" size={17} strokeWidth={2.2} />
              <Text style={styles.labelText}>Last Name</Text>
            </View>
            <TextInput
              style={[styles.input, !isOnline && styles.inputDisabled]}
              placeholder="Doe"
              placeholderTextColor="#8C7C70"
              value={lastName}
              onChangeText={setLastName}
              maxLength={255}
              editable={isOnline}
            />
          </View>

          {/* Phone Number (Read-Only) */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Phone color="#8C4522" size={17} strokeWidth={2.2} />
              <Text style={styles.labelText}>Phone Number</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              placeholder="Not set"
              placeholderTextColor="#8C7C70"
              value={phoneNumber}
              maxLength={255}
              editable={false}
              selectTextOnFocus={false}
            />
            <Text style={styles.helperInfoText}>
              ℹ️ Phone number can be updated in SMS Notification settings.
            </Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            hasChanges() && !loading && isOnline ? styles.saveBtnActive : styles.saveBtnDisabled,
          ]}
          onPress={() => handleSave()}
          disabled={loading || !hasChanges() || !isOnline}
          activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <View style={styles.saveBtnContent}>
              <Save color="white" size={18} strokeWidth={2.2} />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── Choose Profile Icon Modal (Opens when tapping current avatar) ── */}
      <Modal
        visible={showAvatarPickerModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowAvatarPickerModal(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAvatarPickerModal(false)}>
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}>
            {/* Sheet Handle */}
            <View style={styles.modalHandle} />

            {/* Sheet Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSubtitle}>Profile Avatar</Text>
                <Text style={styles.modalTitle}>Choose Profile Icon</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAvatarPickerModal(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={18} color="#8C7C70" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Tap an avatar to select it for your profile.
            </Text>

            {/* Grid of 11 Avatar Options */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.avatarGrid}>
              {/* Option: Google User Avatar (if available) */}
              {avatarUrl ? (
                <AvatarItem
                  key="google-avatar-option"
                  id="google"
                  source={{ uri: avatarUrl }}
                  label="Google"
                  isSelected={profileIconUrl === avatarUrl}
                  onSelect={() => {
                    setProfileIconUrl(avatarUrl);
                    setShowAvatarPickerModal(false);
                  }}
                />
              ) : null}

              {/* 10 Preset Avatars */}
              {PRESET_PROFILE_ICONS.map((preset: PresetProfileIcon) => {
                const cleanFilename = (profileIconUrl || '').split('?')[0].split('/').pop() || '';
                const isSelected =
                  profileIconUrl === preset.url ||
                  cleanFilename === preset.filename ||
                  cleanFilename === `${preset.id}.webp` ||
                  cleanFilename === `${preset.id}.png` ||
                  cleanFilename === preset.id;
                return (
                  <AvatarItem
                    key={preset.id}
                    id={preset.id}
                    source={preset.localSource}
                    label={preset.label}
                    isSelected={isSelected}
                    onSelect={() => {
                      setProfileIconUrl(preset.url);
                      setShowAvatarPickerModal(false);
                    }}
                  />
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        visible={showUnsavedModal}
        onSave={handleModalSave}
        onDisregard={handleModalDisregard}
        onKeepEditing={handleModalKeepEditing}
        saving={loading}
        saveDisabled={!isOnline}
        title="Unsaved Profile Changes"
        description="You have modified your profile information. Would you like to save these changes before leaving, or disregard them?"
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF8F4',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#8C7C70',
  },
  screenScroll: {
    flex: 1,
    backgroundColor: '#FBF8F4',
  },
  screenContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerCard: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 24,
  },
  heroAvatarTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarWrapper: {
    position: 'relative',
  },
  heroAvatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(140, 69, 34, 0.3)',
    backgroundColor: '#FBF8F4',
  },
  heroAvatarImg: {
    width: '100%',
    height: '100%',
  },
  heroPencilBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#8C4522',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  heroNameText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '900',
    color: '#1C120C',
  },
  heroEmailText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#8C7C70',
  },
  changeAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140, 69, 34, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(140, 69, 34, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  changeAvatarBtnText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '700',
    color: '#8C4522',
  },
  sectionCard: {
    marginBottom: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 20,
  },
  formSectionHeader: {
    marginBottom: 16,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#8C4522',
  },
  formGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#1C120C',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(140, 69, 34, 0.15)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C120C',
  },
  inputDisabled: {
    borderColor: 'rgba(140, 124, 112, 0.2)',
    backgroundColor: 'rgba(243, 244, 246, 0.8)',
    color: '#8C7C70',
  },
  helperWarningText: {
    marginLeft: 4,
    marginTop: 6,
    fontSize: 11,
    color: '#8C7C70',
  },
  helperInfoText: {
    marginLeft: 4,
    marginTop: 6,
    fontSize: 11,
    color: '#8C7C70',
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnActive: {
    backgroundColor: '#8C4522',
  },
  saveBtnDisabled: {
    backgroundColor: 'rgba(140, 124, 112, 0.4)',
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  /* ── Modal & Avatar Grid Styles ── */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#FBF8F4',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(140, 124, 112, 0.3)',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#8C4522',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2D1B12',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalDesc: {
    marginBottom: 18,
    fontSize: 12,
    fontWeight: '500',
    color: '#8C7C70',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    paddingBottom: 16,
  },
  avatarCard: {
    width: '22.5%',
    minWidth: 64,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    padding: 6,
    marginBottom: 8,
  },
  avatarCardDefault: {
    borderColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  avatarCardSelected: {
    borderColor: '#8C4522',
    backgroundColor: 'rgba(140, 69, 34, 0.12)',
  },
  avatarCircle: {
    position: 'relative',
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(140, 69, 34, 0.15)',
    backgroundColor: '#FBF8F4',
    marginBottom: 4,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  checkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(140, 69, 34, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconBadge: {
    borderRadius: 999,
    backgroundColor: '#8C4522',
    padding: 2,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  avatarTextDefault: {
    color: '#1C120C',
  },
  avatarTextSelected: {
    color: '#8C4522',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  offlineBannerText: {
    flex: 1,
    color: '#78350F',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
});
