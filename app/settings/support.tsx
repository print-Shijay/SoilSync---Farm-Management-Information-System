import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  Linking,
  RefreshControl,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../components/common/AppModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HelpCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Mail,
  Search,
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Check,
  RotateCcw,
  Sparkles,
  Inbox,
  Clock,
  CheckCircle,
  Calendar,
  FileText,
  RefreshCw,
} from 'lucide-react-native';
import faqData from '../../assets/faq.json';
import { useAuth } from '../../lib/AuthContext';
import { createSupportReport, getUserSupportReports } from '../../lib/db-operations';

type SupportModalType = 'faq' | 'report' | 'my_reports' | null;

interface ReportItem {
  id: string;
  user_id: string;
  subject: string;
  note: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  device_info?: {
    platform?: string;
    osVersion?: string | number;
    appVersion?: string;
    submittedAt?: string;
    userEmail?: string;
  };
  created_at: string;
  updated_at: string;
}

const PROBLEM_SUBJECTS = [
  'IoT Sensor & Hardware Connection',
  'Soil & Crop Diagnostics (AI Scanner)',
  'Farm & Bed 3D Blueprint',
  'Data Syncing & Offline Access',
  'Map, GPS & Plot Boundaries',
  'Notifications & Crop Alerts',
  'Account, Login & PIN Passcode',
  'App Performance or Crashing',
  'Other',
];

export default function SupportSettings() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Active modal state
  const [activeModal, setActiveModal] = useState<SupportModalType>(null);

  // FAQ Modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('faq-1');

  // Report Modal state
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [isSubjectPickerOpen, setIsSubjectPickerOpen] = useState(false);

  // My Reports state
  const [myReports, setMyReports] = useState<ReportItem[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isRefreshingReports, setIsRefreshingReports] = useState(false);
  const [reportsFilter, setReportsFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [selectedReportDetail, setSelectedReportDetail] = useState<ReportItem | null>(null);

  // Fetch submitted reports for the logged in user
  const fetchMyReports = useCallback(async () => {
    if (!user?.id) {
      setMyReports([]);
      return;
    }
    setIsLoadingReports(true);
    try {
      const reports = await getUserSupportReports(user.id);
      setMyReports((reports as ReportItem[]) || []);
    } catch (err) {
      console.error('Error fetching reports from local DB:', err);
    } finally {
      setIsLoadingReports(false);
    }
  }, [user?.id]);

  const handleRefreshReports = async () => {
    setIsRefreshingReports(true);
    await fetchMyReports();
    setIsRefreshingReports(false);
  };

  useEffect(() => {
    if (user?.id) {
      fetchMyReports();
    }
  }, [user?.id, fetchMyReports]);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (faqData.faqs || []).filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

      if (!matchesCategory) return false;

      if (!query) return true;

      const matchesQuestion = item.question.toLowerCase().includes(query);
      const matchesAnswer = item.answer.toLowerCase().includes(query);
      const matchesTags = item.tags?.some((t: string) => t.toLowerCase().includes(query));

      return matchesQuestion || matchesAnswer || matchesTags;
    });
  }, [searchQuery, selectedCategory]);

  // Filtered My Reports
  const filteredReports = useMemo(() => {
    return myReports.filter((rep) => {
      if (reportsFilter === 'pending') {
        return rep.status === 'pending' || rep.status === 'in_progress';
      }
      if (reportsFilter === 'resolved') {
        return rep.status === 'resolved' || rep.status === 'closed';
      }
      return true;
    });
  }, [myReports, reportsFilter]);

  const pendingCount = useMemo(() => {
    return myReports.filter((r) => r.status === 'pending' || r.status === 'in_progress').length;
  }, [myReports]);

  const toggleFaq = (id: string) => {
    setExpandedFaqId((prev) => (prev === id ? null : id));
  };

  const handleOpenContactSupport = async () => {
    const supportEmail = 'support@soilsync.app';
    const emailSubject = encodeURIComponent('SoilSync Support Inquiry');
    const mailtoUrl = `mailto:${supportEmail}?subject=${emailSubject}`;

    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
    } else {
      Alert.alert(
        'Contact Support',
        `Please email our helpdesk team directly at:\n\n${supportEmail}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenReportModal = () => {
    setSubmittedReportId(null);
    setSelectedSubject('');
    setCustomSubject('');
    setNote('');
    setActiveModal('report');
  };

  const handleOpenMyReports = () => {
    fetchMyReports();
    setActiveModal('my_reports');
  };

  const handleSubmitReport = async () => {
    if (!selectedSubject) {
      Alert.alert('Subject Required', 'Please select a subject category for your problem report.');
      return;
    }

    if (selectedSubject === 'Other' && !customSubject.trim()) {
      Alert.alert(
        'Specify Subject',
        'Please specify the subject of your issue in the text field provided.'
      );
      return;
    }

    if (!note.trim()) {
      Alert.alert('Explanation Required', 'Please write a note explaining what happened.');
      return;
    }

    const finalSubject =
      selectedSubject === 'Other' ? `Other: ${customSubject.trim()}` : selectedSubject;

    setIsSubmitting(true);

    try {
      const reportId = await createSupportReport({
        userId: user?.id || 'anonymous',
        subject: finalSubject,
        note: note.trim(),
        status: 'pending',
        deviceInfo: {
          platform: Platform.OS,
          osVersion: Platform.Version,
          appVersion: '1.0.0',
          submittedAt: new Date().toISOString(),
          userEmail: user?.email || 'unauthenticated',
        },
      });

      setSubmittedReportId(reportId);
      // Refresh list in background
      fetchMyReports();
    } catch (err: any) {
      console.error('Error submitting report:', err);
      Alert.alert('Error', err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatReportDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <View className="flex-row items-center rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5">
            <Clock color="#92400e" size={10} className="mr-1" />
            <Text className="text-[10px] font-bold uppercase text-amber-800">Pending Review</Text>
          </View>
        );
      case 'in_progress':
        return (
          <View className="flex-row items-center rounded-md border border-blue-200 bg-blue-100 px-2 py-0.5">
            <ActivityIndicator size={8} color="#1d4ed8" className="mr-1" />
            <Text className="text-[10px] font-bold uppercase text-blue-800">In Progress</Text>
          </View>
        );
      case 'resolved':
        return (
          <View className="flex-row items-center rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5">
            <CheckCircle color="#065f46" size={10} className="mr-1" />
            <Text className="text-[10px] font-bold uppercase text-emerald-800">Resolved</Text>
          </View>
        );
      case 'closed':
        return (
          <View className="flex-row items-center rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold uppercase text-stone-600">Closed</Text>
          </View>
        );
      default:
        return (
          <View className="flex-row items-center rounded-md bg-stone-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold uppercase text-stone-600">{status}</Text>
          </View>
        );
    }
  };

  const Item = ({
    icon: Icon,
    title,
    subtitle,
    badgeText,
    onPress,
  }: {
    icon: any;
    title: string;
    subtitle?: string;
    badgeText?: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="flex-row items-center px-4 py-3.5 active:scale-[0.99] active:opacity-75">
      <View className="mr-3.5 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
        <Icon color="#8C4522" size={19} strokeWidth={2.2} />
      </View>
      <View className="flex-1 pr-2">
        <View className="flex-row items-center">
          <Text className="text-[15px] font-bold tracking-tight text-espresso">{title}</Text>
          {badgeText && (
            <View className="py-0.2 ml-2 rounded-full bg-cognac px-2">
              <Text className="text-[10px] font-bold text-white">{badgeText}</Text>
            </View>
          )}
        </View>
        {subtitle && <Text className="mt-0.5 text-xs text-taupe">{subtitle}</Text>}
      </View>
      <ChevronRight color="#8C7C70" size={18} strokeWidth={2.2} />
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView className="flex-1 p-5 pt-4">
        <View className="mb-4">
          <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
            Help & Inquiries
          </Text>
          <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
            <Item
              icon={HelpCircle}
              title="Frequently Asked Questions"
              subtitle="Common queries and guides"
              onPress={() => setActiveModal('faq')}
            />
            <View className="ml-16 mr-4 h-[1px] bg-black/5" />
            <Item
              icon={AlertTriangle}
              title="Report a Problem"
              subtitle="Let our engineering team assist"
              onPress={handleOpenReportModal}
            />
            <View className="ml-16 mr-4 h-[1px] bg-black/5" />
            <Item
              icon={Inbox}
              title="My Submitted Reports"
              subtitle="View status and history of your tickets"
              badgeText={pendingCount > 0 ? `${pendingCount} open` : undefined}
              onPress={handleOpenMyReports}
            />
            <View className="ml-16 mr-4 h-[1px] bg-black/5" />
            <Item
              icon={Mail}
              title="Contact Support"
              subtitle="Direct email helpdesk support"
              onPress={handleOpenContactSupport}
            />
          </View>
        </View>

        {/* Informational Helpdesk Card */}
        <View className="mt-2 rounded-2xl border border-cognac/15 bg-white p-4">
          <View className="flex-row items-center">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-cognac/10">
              <Sparkles color="#8C4522" size={16} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-espresso">Need urgent assistance?</Text>
              <Text className="mt-0.5 text-[11px] leading-tight text-taupe">
                Reports are directly reviewed by the SoilSync engineering and agronomy team.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: FREQUENTLY ASKED QUESTIONS (FAQ)                                 */}
      {/* ========================================================================= */}
      <Modal
        visible={activeModal === 'faq'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView
          className="flex-1 bg-champagne"
          style={{
            paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
          }}>
          {/* FAQ Header */}
          <View className="flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
                <HelpCircle color="#8C4522" size={20} strokeWidth={2.2} />
              </View>
              <View>
                <Text className="text-lg font-bold text-espresso">Frequently Asked Questions</Text>
                <Text className="text-[11px] text-taupe">Knowledgebase & Guides</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setActiveModal(null)}
              className="h-8 w-8 items-center justify-center rounded-full bg-champagne">
              <X color="#8C7C70" size={20} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="border-b border-cognac/10 bg-white px-5 pb-3 pt-3">
            <View className="flex-row items-center rounded-xl border border-cognac/15 bg-champagne px-3 py-2">
              <Search color="#8C7C70" size={18} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                maxLength={255}
                placeholder="Search questions or keywords..."
                placeholderTextColor="#8C7C70"
                className="ml-2 flex-1 text-xs text-espresso"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                  <X color="#8C7C70" size={14} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3 flex-row"
              contentContainerStyle={{ paddingRight: 10 }}>
              {faqData.categories.map((category: string) => {
                const isSelected = selectedCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    onPress={() => setSelectedCategory(category)}
                    activeOpacity={0.7}
                    className={`mr-2 rounded-full border px-3.5 py-1.5 ${
                      isSelected
                        ? 'border-cognac bg-cognac'
                        : 'border-cognac/15 bg-white active:bg-champagne'
                    }`}>
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected ? 'text-white' : 'text-espresso'
                      }`}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* FAQ List */}
          <ScrollView
            className="flex-1 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 48) }}
            showsVerticalScrollIndicator={false}>
            {filteredFaqs.length === 0 ? (
              <View className="items-center justify-center py-16">
                <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-cognac/10">
                  <Search color="#8C7C70" size={24} />
                </View>
                <Text className="text-base font-bold text-espresso">No questions found</Text>
                <Text className="mt-1 px-8 text-center text-xs text-taupe">
                  We couldn&apos;t find any FAQs matching &ldquo;{searchQuery}&rdquo;. Try another
                  search term or contact our support team.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="mt-4 rounded-xl border border-cognac/15 bg-white px-4 py-2">
                  <Text className="text-xs font-bold text-cognac">Reset Filters</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredFaqs.map((item) => {
                const isExpanded = expandedFaqId === item.id;
                return (
                  <View
                    key={item.id}
                    className="mb-3 overflow-hidden rounded-2xl border border-cognac/15 bg-white shadow-sm">
                    <TouchableOpacity
                      onPress={() => toggleFaq(item.id)}
                      activeOpacity={0.7}
                      className="flex-row items-center justify-between p-4">
                      <View className="flex-1 pr-3">
                        <View className="mb-1 flex-row items-center">
                          <View className="rounded-md bg-cognac/10 px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase text-cognac">
                              {item.category}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-sm font-bold text-espresso">{item.question}</Text>
                      </View>
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-champagne">
                        {isExpanded ? (
                          <ChevronDown color="#8C7C70" size={16} strokeWidth={2.2} />
                        ) : (
                          <ChevronRight color="#8C7C70" size={16} strokeWidth={2.2} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View className="border-t border-cognac/10 bg-champagne/80 p-4">
                        <Text className="text-xs leading-relaxed text-taupe">{item.answer}</Text>
                        {item.tags && item.tags.length > 0 && (
                          <View className="mt-3 flex-row flex-wrap gap-1">
                            {item.tags.map((tag: string, tIdx: number) => (
                              <View
                                key={tIdx}
                                className="rounded-md border border-cognac/10 bg-white px-2 py-0.5">
                                <Text className="text-[10px] text-taupe">#{tag}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* Bottom Help Note */}
            <View className="mb-2 mt-4 items-center rounded-2xl border border-cognac/15 bg-white p-5">
              <Text className="text-xs font-bold text-espresso">
                Didn&apos;t find what you need?
              </Text>
              <Text className="mt-1 text-center text-[11px] text-taupe">
                Submit a problem ticket or connect with our support engineers directly.
              </Text>
              <View className="mt-3.5 flex-row gap-2.5">
                <TouchableOpacity
                  onPress={() => {
                    setActiveModal(null);
                    handleOpenReportModal();
                  }}
                  className="flex-row items-center rounded-xl bg-cognac px-4 py-2">
                  <AlertTriangle color="#FFFFFF" size={14} className="mr-1.5" />
                  <Text className="text-xs font-bold text-white">Report Problem</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleOpenContactSupport}
                  className="flex-row items-center rounded-xl border border-cognac/15 bg-white px-4 py-2">
                  <Mail color="#8C4522" size={14} className="mr-1.5" />
                  <Text className="text-xs font-bold text-espresso">Email Support</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: REPORT A PROBLEM                                                 */}
      {/* ========================================================================= */}
      <Modal
        visible={activeModal === 'report'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView
          className="flex-1 bg-champagne"
          style={{
            paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
          }}>
          {/* Report Header */}
          <View className="flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
                <AlertTriangle color="#8C4522" size={20} />
              </View>
              <View>
                <Text className="text-lg font-bold text-espresso">Report a Problem</Text>
                <Text className="text-[11px] text-taupe">SoilSync Engineering Ticket</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setActiveModal(null)}
              className="h-8 w-8 items-center justify-center rounded-full bg-champagne">
              <X color="#8C7C70" size={20} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1">
            <ScrollView
              className="flex-1 px-5 pt-4"
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 48) }}
              showsVerticalScrollIndicator={false}>
              {submittedReportId ? (
                /* Success Confirmation Card */
                <View className="my-4 items-center rounded-3xl border border-white/90 bg-white p-6 shadow-sm shadow-espresso/5">
                  <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 color="#15803d" size={36} />
                  </View>
                  <Text className="text-center text-xl font-bold text-espresso">
                    Report Submitted!
                  </Text>
                  <Text className="mt-2 text-center text-xs leading-relaxed text-taupe">
                    Thank you for reporting this issue. Our engineering team has received your
                    ticket and will review it promptly.
                  </Text>

                  <View className="my-5 w-full rounded-2xl border border-cognac/15 bg-champagne p-4">
                    <View className="mb-2 flex-row justify-between">
                      <Text className="text-[11px] font-semibold text-taupe">
                        Reference Ticket:
                      </Text>
                      <Text className="font-mono text-[11px] font-bold text-cognac">
                        {typeof submittedReportId === 'string' && submittedReportId.length > 12
                          ? '#' + submittedReportId.substring(0, 8).toUpperCase()
                          : submittedReportId}
                      </Text>
                    </View>
                    <View className="mb-2 flex-row justify-between">
                      <Text className="text-[11px] font-semibold text-taupe">Status:</Text>
                      <View className="flex-row items-center rounded-md bg-amber-100 px-2 py-0.5">
                        <Text className="text-[10px] font-bold uppercase text-amber-800">
                          Pending Review
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-[11px] font-semibold text-taupe">Subject:</Text>
                      <Text
                        className="max-w-[180px] text-right text-[11px] font-bold text-espresso"
                        numberOfLines={1}>
                        {selectedSubject === 'Other' ? customSubject : selectedSubject}
                      </Text>
                    </View>
                  </View>

                  <View className="w-full flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => {
                        setActiveModal(null);
                        handleOpenMyReports();
                      }}
                      className="flex-1 items-center justify-center rounded-xl bg-cognac py-3.5">
                      <Text className="text-xs font-bold text-white">View My Reports</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setActiveModal(null)}
                      className="items-center justify-center rounded-xl border border-cognac/15 bg-white px-5 py-3.5">
                      <Text className="text-xs font-bold text-espresso">Close</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={handleOpenReportModal}
                    className="mt-3 flex-row items-center py-2">
                    <RotateCcw color="#8C4522" size={14} className="mr-1" />
                    <Text className="text-xs font-bold text-cognac">Submit Another Report</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Report Form */
                <View className="rounded-3xl border border-white/90 bg-white p-5 shadow-sm shadow-espresso/5">
                  {/* Step 1: Subject Dropdown Selection */}
                  <View className="mb-4">
                    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Where did you encounter the problem? <Text className="text-cognac">*</Text>
                    </Text>
                    <Text className="mb-2.5 text-[11px] text-taupe">
                      Select the category or area of the app related to your issue.
                    </Text>

                    <TouchableOpacity
                      onPress={() => setIsSubjectPickerOpen(!isSubjectPickerOpen)}
                      activeOpacity={0.7}
                      className="flex-row items-center justify-between rounded-xl border border-cognac/15 bg-champagne px-4 py-3.5">
                      <Text
                        className={`text-xs ${
                          selectedSubject ? 'font-bold text-espresso' : 'text-taupe'
                        }`}>
                        {selectedSubject || 'Select a problem subject...'}
                      </Text>
                      <ChevronDown
                        color="#8C7C70"
                        size={18}
                        style={{
                          transform: [{ rotate: isSubjectPickerOpen ? '180deg' : '0deg' }],
                        }}
                      />
                    </TouchableOpacity>

                    {/* Dropdown Options List */}
                    {isSubjectPickerOpen && (
                      <View className="mt-2 overflow-hidden rounded-xl border border-cognac/15 bg-white shadow-md">
                        {PROBLEM_SUBJECTS.map((subj, sIdx) => {
                          const isPicked = selectedSubject === subj;
                          return (
                            <TouchableOpacity
                              key={sIdx}
                              onPress={() => {
                                setSelectedSubject(subj);
                                setIsSubjectPickerOpen(false);
                              }}
                              activeOpacity={0.7}
                              className={`flex-row items-center justify-between px-4 py-3 ${
                                sIdx < PROBLEM_SUBJECTS.length - 1
                                  ? 'border-b border-cognac/10'
                                  : ''
                              } ${isPicked ? 'bg-cognac/10' : 'active:bg-champagne'}`}>
                              <Text
                                className={`text-xs ${
                                  isPicked ? 'font-bold text-cognac' : 'text-espresso'
                                }`}>
                                {subj}
                              </Text>
                              {isPicked && <Check color="#8C4522" size={16} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Step 1.5: Specify Subject if 'Other' */}
                  {selectedSubject === 'Other' && (
                    <View className="mb-4">
                      <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                        Specify Subject <Text className="text-cognac">*</Text>
                      </Text>
                      <TextInput
                        value={customSubject}
                        onChangeText={setCustomSubject}
                        placeholder="e.g., Weather forecast discrepancy, Crop guide error"
                        placeholderTextColor="#8C7C70"
                        className="rounded-xl border border-cognac/15 bg-champagne px-4 py-3 text-xs text-espresso"
                        maxLength={80}
                      />
                    </View>
                  )}

                  {/* Step 2: Note / Explanation */}
                  <View className="mb-4">
                    <View className="mb-1.5 flex-row items-center justify-between">
                      <Text className="text-xs font-bold uppercase tracking-wider text-espresso">
                        Problem Explanation / Note <Text className="text-cognac">*</Text>
                      </Text>
                      <Text className="text-[10px] text-taupe">{note.length}/3000</Text>
                    </View>
                    <Text className="mb-2.5 text-[11px] text-taupe">
                      Please describe what happened, steps to reproduce, or any error messages you
                      saw.
                    </Text>

                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder="Write your explanation here..."
                      placeholderTextColor="#8C7C70"
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      maxLength={3000}
                      className="min-h-[120px] rounded-xl border border-cognac/15 bg-champagne p-4 text-xs leading-relaxed text-espresso"
                    />
                  </View>

                  {/* Device Metadata Attachment Info */}
                  <View className="mb-5 flex-row items-center rounded-xl border border-cognac/15 bg-champagne p-3.5">
                    <View className="mr-3 h-7 w-7 items-center justify-center rounded-lg bg-cognac/10">
                      <Smartphone color="#8C4522" size={15} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11px] font-bold text-espresso">
                        Device Diagnostic Metadata
                      </Text>
                      <Text className="text-[10px] text-taupe">
                        OS: {Platform.OS} (v{Platform.Version}) • SoilSync v1.0.0
                      </Text>
                    </View>
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    onPress={handleSubmitReport}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                    className={`flex-row items-center justify-center rounded-xl bg-cognac py-3.5 shadow-sm shadow-cognac/20 ${
                      isSubmitting ? 'opacity-70' : ''
                    }`}>
                    {isSubmitting ? (
                      <>
                        <ActivityIndicator color="#FFFFFF" size="small" className="mr-2" />
                        <Text className="text-sm font-bold text-white">Submitting Report...</Text>
                      </>
                    ) : (
                      <>
                        <Send color="#FFFFFF" size={16} className="mr-2" />
                        <Text className="text-sm font-bold text-white">Submit Problem Report</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: MY SUBMITTED REPORTS                                             */}
      {/* ========================================================================= */}
      <Modal
        visible={activeModal === 'my_reports'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView
          className="flex-1 bg-champagne"
          style={{
            paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
          }}>
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-cognac/10">
                <Inbox color="#8C4522" size={20} />
              </View>
              <View>
                <Text className="text-lg font-bold text-espresso">My Submitted Reports</Text>
                <Text className="text-[11px] text-taupe">
                  {myReports.length} {myReports.length === 1 ? 'ticket' : 'tickets'} recorded
                </Text>
              </View>
            </View>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={handleRefreshReports}
                disabled={isLoadingReports}
                className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-champagne">
                {isLoadingReports ? (
                  <ActivityIndicator size="small" color="#8C4522" />
                ) : (
                  <RefreshCw color="#8C4522" size={16} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveModal(null)}
                className="h-8 w-8 items-center justify-center rounded-full bg-champagne">
                <X color="#8C7C70" size={20} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Filter Tabs */}
          <View className="flex-row border-b border-cognac/10 bg-white px-5 py-2.5">
            {[
              { key: 'all', label: 'All Reports' },
              { key: 'pending', label: 'Open / Pending' },
              { key: 'resolved', label: 'Resolved' },
            ].map((tab) => {
              const isActive = reportsFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setReportsFilter(tab.key as any)}
                  activeOpacity={0.7}
                  className={`mr-2 rounded-full border px-3.5 py-1.5 ${
                    isActive
                      ? 'border-cognac bg-cognac'
                      : 'border-cognac/15 bg-white active:bg-champagne'
                  }`}>
                  <Text
                    className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-espresso'}`}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Reports List */}
          <ScrollView
            className="flex-1 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 48) }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshingReports}
                onRefresh={handleRefreshReports}
                colors={['#8C4522']}
              />
            }>
            {isLoadingReports && myReports.length === 0 ? (
              <View className="items-center justify-center py-20">
                <ActivityIndicator size="large" color="#8C4522" />
                <Text className="mt-3 text-xs font-semibold text-taupe">
                  Loading your reports...
                </Text>
              </View>
            ) : filteredReports.length === 0 ? (
              <View className="items-center justify-center py-16">
                <View className="mb-3.5 h-16 w-16 items-center justify-center rounded-full bg-cognac/10">
                  <Inbox color="#8C7C70" size={28} />
                </View>
                <Text className="text-base font-bold text-espresso">No reports found</Text>
                <Text className="mt-1 max-w-[280px] text-center text-xs text-taupe">
                  {reportsFilter === 'all'
                    ? 'You have not submitted any problem tickets yet.'
                    : `No reports currently in '${reportsFilter}' status.`}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setActiveModal('report');
                    handleOpenReportModal();
                  }}
                  className="mt-5 flex-row items-center rounded-xl bg-cognac px-4 py-2.5">
                  <AlertTriangle color="#FFFFFF" size={14} className="mr-1.5" />
                  <Text className="text-xs font-bold text-white">Report a Problem</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredReports.map((report) => (
                <TouchableOpacity
                  key={report.id}
                  onPress={() => setSelectedReportDetail(report)}
                  activeOpacity={0.8}
                  className="mb-3.5 overflow-hidden rounded-2xl border border-cognac/15 bg-white p-4 shadow-sm active:opacity-85">
                  {/* Top Bar: Status Badge and Reference */}
                  <View className="mb-2 flex-row items-center justify-between">
                    {getStatusBadge(report.status)}
                    <Text className="font-mono text-[10px] font-bold text-taupe">
                      #{report.id.substring(0, 8).toUpperCase()}
                    </Text>
                  </View>

                  {/* Subject */}
                  <Text className="text-sm font-bold text-espresso">{report.subject}</Text>

                  {/* Note snippet */}
                  <Text className="mt-1 text-xs leading-relaxed text-taupe" numberOfLines={2}>
                    {report.note}
                  </Text>

                  {/* Footer: Date & Chevron */}
                  <View className="mt-3 flex-row items-center justify-between border-t border-cognac/10 pt-2.5">
                    <View className="flex-row items-center">
                      <Calendar color="#8C7C70" size={12} className="mr-1.5" />
                      <Text className="text-[10px] text-taupe">
                        {formatReportDate(report.created_at)}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Text className="mr-1 text-[11px] font-bold text-cognac">Details</Text>
                      <ChevronRight color="#8C4522" size={14} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Detailed Report View Modal */}
          <Modal
            visible={!!selectedReportDetail}
            animationType="fade"
            transparent
            onRequestClose={() => setSelectedReportDetail(null)}>
            <View className="flex-1 items-center justify-center bg-black/50 p-5">
              <View className="max-h-[85%] w-full max-w-[420px] overflow-hidden rounded-3xl border border-cognac/15 bg-white shadow-2xl">
                {/* Header */}
                <View className="flex-row items-center justify-between border-b border-cognac/15 bg-champagne px-5 py-4">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-bold text-espresso">Ticket Details</Text>
                    <Text className="font-mono text-[10px] text-taupe">
                      ID: #{selectedReportDetail?.id.substring(0, 12).toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedReportDetail(null)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-champagne">
                    <X color="#8C7C70" size={18} strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>

                {/* Body */}
                <ScrollView className="p-5" showsVerticalScrollIndicator={false}>
                  {/* Status Banner */}
                  <View className="mb-4 flex-row items-center justify-between rounded-xl border border-cognac/15 bg-champagne p-3">
                    <Text className="text-xs font-semibold text-taupe">Current Status:</Text>
                    {selectedReportDetail && getStatusBadge(selectedReportDetail.status)}
                  </View>

                  {/* Subject */}
                  <View className="mb-4">
                    <Text className="mb-1 text-[10px] font-bold uppercase tracking-wider text-taupe">
                      Problem Category / Subject
                    </Text>
                    <Text className="text-sm font-bold text-espresso">
                      {selectedReportDetail?.subject}
                    </Text>
                  </View>

                  {/* Note */}
                  <View className="mb-4">
                    <Text className="mb-1 text-[10px] font-bold uppercase tracking-wider text-taupe">
                      Problem Explanation
                    </Text>
                    <View className="rounded-xl border border-cognac/15 bg-champagne p-3.5">
                      <Text className="text-xs leading-relaxed text-espresso">
                        {selectedReportDetail?.note}
                      </Text>
                    </View>
                  </View>

                  {/* Submission Info */}
                  <View className="mb-4 rounded-xl border border-cognac/15 bg-champagne p-3">
                    <View className="mb-1.5 flex-row justify-between">
                      <Text className="text-[11px] text-taupe">Date Submitted:</Text>
                      <Text className="text-[11px] font-bold text-espresso">
                        {selectedReportDetail && formatReportDate(selectedReportDetail.created_at)}
                      </Text>
                    </View>
                    {selectedReportDetail?.device_info?.platform && (
                      <View className="flex-row justify-between">
                        <Text className="text-[11px] text-taupe">Device Platform:</Text>
                        <Text className="text-[11px] font-medium text-espresso">
                          {selectedReportDetail.device_info.platform} (v
                          {selectedReportDetail.device_info.osVersion || 'unknown'})
                        </Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedReportDetail(null)}
                    className="mb-1 mt-2 w-full items-center justify-center rounded-xl bg-cognac py-3">
                    <Text className="text-xs font-bold text-white">Done</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
