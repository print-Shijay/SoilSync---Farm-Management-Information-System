import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Modal } from '../common/AppModal';
import {
  BookOpen,
  Clock,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Type,
} from 'lucide-react-native';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  SproutIcon,
  TreeIcon,
  ShieldIcon,
  DropletIcon,
  FlaskIcon,
  LayersIcon,
} from './LearningIcons';
import { RichContentRenderer } from '../common/RichContentRenderer';
import {
  paginateRichContent,
  getSavedModulePage,
  saveModulePage,
  clearSavedModulePage,
  getSavedReadingFontSize,
  saveReadingFontSize,
} from '../../lib/contentPaginator';
import { useAccessibility } from '../../lib/accessibility/AccessibilityContext';
import type { ModuleRecord } from '../../lib/db-operations';

interface ModuleReaderModalProps {
  visible: boolean;
  module: ModuleRecord | null;
  isCompleted: boolean;
  onClose: () => void;
  onCompleteAndStartQuiz: (moduleId: string) => void;
}

const DIFFICULTY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  Beginner: { bg: '#ECFDF5', text: '#065F46', border: 'rgba(16,185,129,0.2)' },
  Intermediate: { bg: '#FFFBEB', text: '#92400E', border: 'rgba(245,158,11,0.25)' },
  Advanced: { bg: '#FEF2F2', text: '#991B1B', border: 'rgba(239,68,68,0.2)' },
};

function getCategoryIcon(category = '', size = 18) {
  const cat = category.toLowerCase();
  if (cat.includes('soil')) return <LayersIcon size={size} color="#8C4522" />;
  if (cat.includes('compost')) return <SproutIcon size={size} color="#10B981" />;
  if (cat.includes('crop')) return <TreeIcon size={size} color="#10B981" />;
  if (cat.includes('pest')) return <ShieldIcon size={size} color="#F43F5E" />;
  if (cat.includes('water') || cat.includes('irrigation')) return <DropletIcon size={size} color="#3B82F6" />;
  if (cat.includes('npk') || cat.includes('nutrient')) return <FlaskIcon size={size} color="#8B5CF6" />;
  return <BookOpen size={size} color="#8C4522" />;
}

export function ModuleReaderModal({
  visible,
  module,
  isCompleted,
  onClose,
  onCompleteAndStartQuiz,
}: ModuleReaderModalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { fontScale } = useAccessibility();
  const defaultBaseSize = useMemo(() => Math.round(18 * fontScale), [fontScale]);
  const [fontSize, setFontSize] = useState(defaultBaseSize);
  const [currentPage, setCurrentPage] = useState(0);
  const [isResumed, setIsResumed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // Load user's preferred font size from local cache
  useEffect(() => {
    getSavedReadingFontSize(defaultBaseSize).then((savedSize) => {
      setFontSize(savedSize);
    });
  }, [defaultBaseSize]);

  const handleFontSizeChange = (newSize: number) => {
    const clamped = Math.max(14, Math.min(24, newSize));
    setFontSize(clamped);
    saveReadingFontSize(clamped);
  };

  // Paginate content dynamically: ~1,500 chars (1-2 scrolls) without cutting paragraphs
  const pages = useMemo(() => {
    return paginateRichContent(module?.content, 1500);
  }, [module?.content]);

  const totalPages = pages.length;
  const isLastPage = currentPage === totalPages - 1;

  // Restore last read page from local on-device cache when modal opens
  useEffect(() => {
    let isMounted = true;
    if (visible && module?.id) {
      setHasScrolledToBottom(false);
      setScrollViewHeight(0);
      setContentHeight(0);

      getSavedModulePage(module.id).then((savedPage) => {
        if (!isMounted) return;
        if (savedPage > 0 && savedPage < pages.length) {
          setCurrentPage(savedPage);
          setIsResumed(true);
        } else {
          setCurrentPage(0);
          setIsResumed(false);
        }
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
    } else if (!visible) {
      setIsResumed(false);
    }
    return () => {
      isMounted = false;
    };
  }, [visible, module?.id, pages.length]);

  // Check if current page content is short enough that it doesn't need scrolling
  useEffect(() => {
    if (scrollViewHeight > 0 && contentHeight > 0) {
      if (contentHeight <= scrollViewHeight + 30) {
        setHasScrolledToBottom(true);
      }
    }
  }, [scrollViewHeight, contentHeight, currentPage]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasScrolledToBottom) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    // Calculate if user is close to the bottom (within 40px threshold)
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;

    if (isCloseToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const goToPage = (pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= totalPages) return;
    setCurrentPage(pageIndex);
    setIsResumed(false);
    setHasScrolledToBottom(false);
    setScrollViewHeight(0);
    setContentHeight(0);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (module?.id) {
      saveModulePage(module.id, pageIndex);
    }
  };

  if (!module) return null;

  const diffConfig = DIFFICULTY_CONFIG[module.difficulty] || DIFFICULTY_CONFIG.Beginner;
  const isButtonEnabled = isCompleted || hasScrolledToBottom;
  const progressPercent =
    totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 100;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.sheetContainer}>
          {/* Apple Frosted Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconBadge}>
                {getCategoryIcon(module.category, 18)}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerSubtitle}>
                  Vol. {module.sort_order} • {module.category}
                </Text>
                <Text numberOfLines={1} style={styles.headerTitle}>
                  SoilSync Field Academy
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeButton}
            >
              <X size={16} color="#523625" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          {/* Responsive Reading Control Bar (Text Size with Type Icon) */}
          <View style={styles.readingControlBar}>
            <View style={styles.textSizeLabelGroup}>
              <View style={styles.textSizeIconBadge}>
                <Type size={14} color="#8C4522" strokeWidth={2.4} />
              </View>
              <Text style={styles.textSizeLabel}>Text Size</Text>
            </View>

            <View style={styles.fontSizeStepper}>
              <TouchableOpacity
                onPress={() => handleFontSizeChange(fontSize - 1)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={styles.fontStepperBtn}
              >
                <Minus size={12} color="#523625" strokeWidth={2.8} />
              </TouchableOpacity>
              <Text style={styles.fontStepperText}>{fontSize} pt</Text>
              <TouchableOpacity
                onPress={() => handleFontSizeChange(fontSize + 1)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={styles.fontStepperBtn}
              >
                <Plus size={12} color="#523625" strokeWidth={2.8} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Apple Slim Progress Ribbon */}
          {totalPages > 1 && (
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercent}%` },
                ]}
              />
            </View>
          )}

          {/* Scrollable Reader Body */}
          <ScrollView
            ref={scrollRef}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={(e: LayoutChangeEvent) => setScrollViewHeight(e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => setContentHeight(h)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={{ flex: 1 }}
          >
            {/* Resume Notice Card if restored to a page > 0 */}
            {isResumed && currentPage > 0 && (
              <View style={styles.resumeNoticeCard}>
                <View style={styles.resumeNoticeLeft}>
                  <Clock size={13} color="#9A3412" />
                  <Text style={styles.resumeNoticeText}>
                    Resumed from Page {currentPage + 1} of {totalPages}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => goToPage(0)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.restartLinkText}>Start Over</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Title & Metadata Card - Rendered on Page 1 */}
            {currentPage === 0 ? (
              <View style={styles.metadataCard}>
                <View style={styles.badgesRow}>
                  <View
                    style={[
                      styles.difficultyBadge,
                      {
                        backgroundColor: diffConfig.bg,
                        borderColor: diffConfig.border,
                      },
                    ]}
                  >
                    <Text style={[styles.difficultyBadgeText, { color: diffConfig.text }]}>
                      {module.difficulty}
                    </Text>
                  </View>

                  <View style={styles.readingTimeBadge}>
                    <Clock size={11} color="#B45309" />
                    <Text style={styles.readingTimeText}>
                      {module.reading_time_min} Min Read
                    </Text>
                  </View>

                  {isCompleted && (
                    <View style={styles.masteredBadge}>
                      <CheckCircleIcon size={11} color="#059669" />
                      <Text style={styles.masteredText}>
                        Mastered
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.moduleTitle}>
                  {module.title}
                </Text>
                {module.description ? (
                  <Text style={styles.moduleDescription}>
                    {module.description}
                  </Text>
                ) : null}
              </View>
            ) : (
              /* Compact Section Breadcrumb on Subsequent Pages */
              <View style={styles.compactChapterCard}>
                <View style={styles.compactChapterLeft}>
                  <BookOpen size={13} color="#8C4522" />
                  <Text style={styles.compactChapterText}>
                    Part {currentPage + 1} of {totalPages}
                  </Text>
                </View>
                <Text style={styles.compactChapterRight}>
                  {progressPercent}% Completed
                </Text>
              </View>
            )}

            {/* Paper Reading Canvas (Paginated) */}
            <View style={styles.readingCanvas}>
              <RichContentRenderer
                content={pages[currentPage]}
                baseFontSize={fontSize}
                showImageZoom={true}
              />
            </View>

            {/* End of Page / Guide Navigation Prompt */}
            {!isLastPage ? (
              <TouchableOpacity
                onPress={() => goToPage(currentPage + 1)}
                activeOpacity={0.8}
                style={styles.continueToNextButton}
              >
                <Text style={styles.continueToNextText}>
                  Continue to Page {currentPage + 2} of {totalPages}
                </Text>
                <ChevronRight size={15} color="#8C4522" strokeWidth={2.5} />
              </TouchableOpacity>
            ) : (
              <View style={styles.endOfGuideRow}>
                <View style={styles.endOfGuideLine} />
                <Text style={styles.endOfGuideText}>End of Reading Guide</Text>
                <View style={styles.endOfGuideLine} />
              </View>
            )}
          </ScrollView>

          {/* Apple Bottom Action Footer */}
          <View style={styles.footer}>
            {/* Scroll-to-bottom prompt hint on the last page if not yet unlocked */}
            {!isButtonEnabled && isLastPage && (
              <View style={styles.scrollHintContainer}>
                <ChevronDown size={14} color="#8C4522" strokeWidth={2.5} />
                <Text style={styles.scrollHintText}>
                  Scroll to the bottom of the guide to unlock the quiz
                </Text>
              </View>
            )}

            {totalPages > 1 ? (
              <View style={styles.multiPageFooterRow}>
                {/* Previous Page Button */}
                <TouchableOpacity
                  disabled={currentPage === 0}
                  onPress={() => goToPage(currentPage - 1)}
                  activeOpacity={0.75}
                  style={[
                    styles.pageNavButton,
                    styles.prevButton,
                    currentPage === 0 && styles.pageNavButtonDisabled,
                  ]}
                >
                  <ChevronLeft
                    size={16}
                    color={currentPage === 0 ? '#C4B5A5' : '#523625'}
                    strokeWidth={2.5}
                  />
                  <Text
                    style={[
                      styles.pageNavButtonText,
                      currentPage === 0 && styles.pageNavButtonTextDisabled,
                    ]}
                  >
                    Prev
                  </Text>
                </TouchableOpacity>

                {/* Page Indicator Counter / Dot Pills */}
                <View style={styles.pageCounterContainer}>
                  <Text style={styles.pageCounterText}>
                    <Text style={styles.pageCounterCurrent}>{currentPage + 1}</Text> / {totalPages}
                  </Text>
                  <View style={styles.dotsRow}>
                    {pages.map((_, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => goToPage(idx)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        style={[
                          styles.dot,
                          idx === currentPage ? styles.dotActive : styles.dotInactive,
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Next Page Button OR Final Quiz Action */}
                {!isLastPage ? (
                  <TouchableOpacity
                    onPress={() => goToPage(currentPage + 1)}
                    activeOpacity={0.85}
                    style={[styles.pageNavButton, styles.nextButton]}
                  >
                    <Text style={styles.nextButtonText}>Next</Text>
                    <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    disabled={!isButtonEnabled}
                    onPress={() => {
                      if (isButtonEnabled) {
                        clearSavedModulePage(module.id);
                        onClose();
                        onCompleteAndStartQuiz(module.id);
                      }
                    }}
                    activeOpacity={0.88}
                    style={[
                      styles.finalQuizButton,
                      {
                        backgroundColor: isButtonEnabled ? '#8C4522' : 'rgba(140,69,34,0.18)',
                        shadowColor: isButtonEnabled ? '#8C4522' : 'transparent',
                        elevation: isButtonEnabled ? 4 : 0,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.finalQuizButtonText,
                        {
                          color: isButtonEnabled ? '#FFFFFF' : '#8C7C70',
                        },
                      ]}
                    >
                      {isCompleted
                        ? 'Quiz'
                        : isButtonEnabled
                        ? 'Start Quiz'
                        : 'Scroll Down'}
                    </Text>
                    {isButtonEnabled ? (
                      <ArrowRightIcon size={14} color="#FFFFFF" strokeWidth={2.5} />
                    ) : null}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* Single Page Module Layout */
              <TouchableOpacity
                disabled={!isButtonEnabled}
                onPress={() => {
                  if (isButtonEnabled) {
                    clearSavedModulePage(module.id);
                    onClose();
                    onCompleteAndStartQuiz(module.id);
                  }
                }}
                activeOpacity={0.88}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: isButtonEnabled ? '#8C4522' : 'rgba(140,69,34,0.18)',
                    shadowColor: isButtonEnabled ? '#8C4522' : 'transparent',
                    elevation: isButtonEnabled ? 4 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    {
                      color: isButtonEnabled ? '#FFFFFF' : '#8C7C70',
                      marginRight: isButtonEnabled ? 6 : 0,
                    },
                  ]}
                >
                  {isCompleted
                    ? 'Take Quiz Checkpoint'
                    : isButtonEnabled
                    ? 'Mark as Read & Start Quiz'
                    : 'Scroll Down to Finish Reading'}
                </Text>
                {isButtonEnabled ? (
                  <ArrowRightIcon size={16} color="#FFFFFF" strokeWidth={2.5} />
                ) : null}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
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
    maxHeight: '92%',
    height: '90%',
    width: '100%',
    backgroundColor: '#FBF8F4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(140,69,34,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C4522',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: '#FDFBF7',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  textSizeLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textSizeIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(140,69,34,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSizeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#523625',
    letterSpacing: 0.1,
  },
  fontSizeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 18,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  fontStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  fontStepperText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#523625',
    marginHorizontal: 10,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8C4522',
    borderRadius: 1.5,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
  },
  metadataCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  difficultyBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  difficultyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  readingTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  readingTimeText: {
    marginLeft: 3.5,
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  masteredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  masteredText: {
    marginLeft: 3.5,
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  moduleTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  moduleDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 21,
    marginTop: 5,
  },
  resumeNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,88,12,0.2)',
  },
  resumeNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  resumeNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9A3412',
  },
  restartLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C4522',
    textDecorationLine: 'underline',
  },
  compactChapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  compactChapterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactChapterText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#8C4522',
  },
  compactChapterRight: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  readingCanvas: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  continueToNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(140,69,34,0.06)',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(140,69,34,0.12)',
    gap: 6,
  },
  continueToNextText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8C4522',
  },
  endOfGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    gap: 12,
  },
  endOfGuideLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(140,69,34,0.15)',
  },
  endOfGuideText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C4522',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    paddingBottom: 22,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  scrollHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 4,
  },
  scrollHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C4522',
  },
  multiPageFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pageNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  prevButton: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    minWidth: 84,
  },
  nextButton: {
    backgroundColor: '#8C4522',
    minWidth: 84,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  pageNavButtonDisabled: {
    opacity: 0.4,
  },
  pageNavButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#523625',
    marginLeft: 3,
  },
  pageNavButtonTextDisabled: {
    color: '#A8978B',
  },
  nextButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 3,
  },
  pageCounterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  pageCounterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  pageCounterCurrent: {
    fontWeight: '800',
    color: '#523625',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  dotActive: {
    width: 14,
    backgroundColor: '#8C4522',
  },
  dotInactive: {
    width: 4,
    backgroundColor: 'rgba(140,69,34,0.2)',
  },
  finalQuizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 104,
    gap: 4,
  },
  finalQuizButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 15,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

