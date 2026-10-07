import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Modal } from '../common/AppModal';
import { X, Minus, Plus, Type } from 'lucide-react-native';
import {
  TrophyIcon,
  StarIcon,
  CheckCircleIcon,
  HelpCircleIcon,
  LightbulbIcon,
  ArrowRightIcon,
  RotateCcwIcon,
} from './LearningIcons';
import {
  getSavedReadingFontSize,
  saveReadingFontSize,
} from '../../lib/contentPaginator';
import { useAccessibility } from '../../lib/accessibility/AccessibilityContext';
import type { ModuleQuizRecord, QuizQuestion } from '../../lib/db-operations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface QuizRunnerModalProps {
  visible: boolean;
  quiz: ModuleQuizRecord | null;
  onClose: () => void;
  onQuizCompleted: (quizId: string, moduleId: string, score: number, stars: number) => void;
}

export function QuizRunnerModal({
  visible,
  quiz,
  onClose,
  onQuizCompleted,
}: QuizRunnerModalProps) {
  const questions = useMemo<QuizQuestion[]>(() => {
    if (!quiz?.questions_json) return [];
    try {
      if (typeof quiz.questions_json === 'string') {
        return JSON.parse(quiz.questions_json);
      }
      return quiz.questions_json as QuizQuestion[];
    } catch {
      return [];
    }
  }, [quiz]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const { fontScale } = useAccessibility();
  const defaultBaseSize = useMemo(() => Math.round(18 * fontScale), [fontScale]);
  const [fontSize, setFontSize] = useState(defaultBaseSize);

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

  const questionFontSize = fontSize + 1;
  const questionLineHeight = Math.round(questionFontSize * 1.5);
  const optionFontSize = Math.max(14, fontSize - 1);
  const optionLineHeight = Math.round(optionFontSize * 1.45);
  const explanationFontSize = Math.max(13, fontSize - 2);
  const explanationLineHeight = Math.round(explanationFontSize * 1.45);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Reset quiz state whenever modal opens or quiz changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setCorrectAnswersCount(0);
      setIsFinished(false);
    }
  }, [visible, quiz]);

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (index: number) => {
    if (isAnswerChecked) return;
    setSelectedOption(index);
  };

  const handleCheckAnswer = () => {
    if (selectedOption === null || !currentQuestion) return;
    setIsAnswerChecked(true);
    if (selectedOption === currentQuestion.correct_index) {
      setCorrectAnswersCount((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setCorrectAnswersCount(0);
    setIsFinished(false);
  };

  // Score calculation
  const totalQuestions = questions.length || 1;
  const scorePercent = Math.round((correctAnswersCount / totalQuestions) * 100);
  const isPassed = scorePercent >= (quiz?.passing_score ?? 70);

  const starsEarned = useMemo(() => {
    if (scorePercent === 100) return 3;
    if (scorePercent >= 70) return 2;
    if (scorePercent >= 50) return 1;
    return 0;
  }, [scorePercent]);

  const handleFinishAndSave = () => {
    if (quiz) {
      onQuizCompleted(quiz.id, quiz.module_id, scorePercent, starsEarned);
    }
    onClose();
  };

  if (!quiz || questions.length === 0) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.emptyBackdrop}>
          <View style={styles.emptyCard}>
            <HelpCircleIcon size={40} color="#8C4522" />
            <Text style={styles.emptyTitle}>No Questions Available</Text>
            <TouchableOpacity onPress={onClose} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const progressRatio = (currentIndex + 1) / questions.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconBadge}>
                <HelpCircleIcon size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerSubtitle}>Knowledge Checkpoint</Text>
                <Text numberOfLines={1} style={styles.headerTitle}>
                  {quiz.title}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeButton}
            >
              <X size={18} color="#523625" strokeWidth={2.4} />
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

          {/* Body Content */}
          {!isFinished ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              style={{ flex: 1 }}
            >
              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressLabelRow}>
                  <Text style={styles.progressLabelText}>
                    Question {currentIndex + 1} of {questions.length}
                  </Text>
                  <Text style={styles.progressPercentText}>
                    {Math.round(progressRatio * 100)}%
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.round(progressRatio * 100)}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Question Box */}
              <View style={styles.questionCard}>
                <Text
                  style={[
                    styles.questionText,
                    { fontSize: questionFontSize, lineHeight: questionLineHeight },
                  ]}
                >
                  {currentQuestion.question}
                </Text>
              </View>

              {/* Options List */}
              <View style={styles.optionsList}>
                {currentQuestion.options.map((option, optIdx) => {
                  const isSelected = selectedOption === optIdx;
                  const isCorrect = optIdx === currentQuestion.correct_index;

                  let cardBg = '#FFFFFF';
                  let cardBorder = 'rgba(0,0,0,0.08)';
                  let textColor = '#2A1610';
                  let letterBg = 'rgba(0,0,0,0.05)';
                  let letterColor = '#523625';
                  let iconElement = null;

                  if (isAnswerChecked) {
                    if (isCorrect) {
                      cardBg = '#ECFDF5';
                      cardBorder = '#10B981';
                      textColor = '#064E3B';
                      letterBg = 'rgba(16,185,129,0.2)';
                      letterColor = '#065F46';
                      iconElement = <CheckCircleIcon size={20} color="#10B981" />;
                    } else if (isSelected && !isCorrect) {
                      cardBg = '#FFF1F2';
                      cardBorder = '#F43F5E';
                      textColor = '#881337';
                      letterBg = 'rgba(244,63,94,0.2)';
                      letterColor = '#9F1239';
                    }
                  } else if (isSelected) {
                    cardBg = '#FFF8F3';
                    cardBorder = '#8C4522';
                    textColor = '#8C4522';
                    letterBg = 'rgba(140,69,34,0.15)';
                    letterColor = '#8C4522';
                  }

                  const optionLetter = String.fromCharCode(65 + optIdx);

                  return (
                    <TouchableOpacity
                      key={`opt-${optIdx}`}
                      onPress={() => handleSelectOption(optIdx)}
                      activeOpacity={isAnswerChecked ? 1 : 0.8}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor: cardBg,
                          borderColor: cardBorder,
                          borderWidth: isSelected || (isAnswerChecked && isCorrect) ? 2 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.optionLetterBadge, { backgroundColor: letterBg }]}>
                        <Text style={[styles.optionLetterText, { color: letterColor }]}>
                          {optionLetter}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: textColor,
                            fontSize: optionFontSize,
                            lineHeight: optionLineHeight,
                          },
                        ]}
                      >
                        {option}
                      </Text>

                      {iconElement && <View style={{ marginLeft: 8 }}>{iconElement}</View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Explanation Card */}
              {isAnswerChecked && currentQuestion.explanation ? (
                <View style={styles.explanationCard}>
                  <View style={styles.explanationHeaderRow}>
                    <LightbulbIcon size={16} color="#D97706" />
                    <Text style={styles.explanationHeaderText}>
                      {selectedOption === currentQuestion.correct_index
                        ? 'Correct Insight'
                        : 'Explanation'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.explanationBodyText,
                      {
                        fontSize: explanationFontSize,
                        lineHeight: explanationLineHeight,
                      },
                    ]}
                  >
                    {currentQuestion.explanation}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            /* Results Screen */
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.resultsScrollContent}
              style={{ flex: 1 }}
            >
              <View style={styles.trophyIconCircle}>
                <TrophyIcon size={40} color="#D97706" strokeWidth={2.2} />
              </View>

              <Text style={styles.resultsHeading}>
                {isPassed ? 'Level Completed! 🎉' : 'Keep Practicing! 💪'}
              </Text>
              <Text style={styles.resultsSubtitle}>
                {isPassed
                  ? 'Great job! You proved your mastery and unlocked the next path level.'
                  : 'You need at least 70% to unlock the next level. Review the guide and retry!'}
              </Text>

              {/* Stars Row */}
              <View style={styles.starsRow}>
                {[1, 2, 3].map((star) => (
                  <View
                    key={`star-${star}`}
                    style={[
                      styles.starBadge,
                      {
                        borderColor: star <= starsEarned ? '#F59E0B' : 'rgba(0,0,0,0.08)',
                        backgroundColor: star <= starsEarned ? '#FEF3C7' : 'rgba(0,0,0,0.04)',
                      },
                    ]}
                  >
                    <StarIcon
                      size={24}
                      color={star <= starsEarned ? '#D97706' : '#94A3B8'}
                      fill={star <= starsEarned ? '#D97706' : 'transparent'}
                    />
                  </View>
                ))}
              </View>

              {/* Score breakdown card */}
              <View style={styles.scoreCard}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Total Questions</Text>
                  <Text style={styles.scoreValue}>{totalQuestions}</Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Correct Answers</Text>
                  <Text style={[styles.scoreValue, { color: '#059669' }]}>
                    {correctAnswersCount}
                  </Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Final Score</Text>
                  <Text style={[styles.scoreValue, { color: '#8C4522', fontSize: 16 }]}>
                    {scorePercent}%
                  </Text>
                </View>
                <View style={[styles.scoreRow, { borderBottomWidth: 0, paddingTop: 10 }]}>
                  <Text style={styles.scoreLabel}>Result</Text>
                  <Text
                    style={[
                      styles.scoreResultText,
                      { color: isPassed ? '#059669' : '#E11D48' },
                    ]}
                  >
                    {isPassed ? 'PASSED & UNLOCKED' : 'NOT PASSED (70% REQUIRED)'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Bottom Action Footer */}
          <View style={styles.footer}>
            {!isFinished ? (
              !isAnswerChecked ? (
                <TouchableOpacity
                  onPress={handleCheckAnswer}
                  disabled={selectedOption === null}
                  activeOpacity={0.88}
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: selectedOption !== null ? '#8C4522' : 'rgba(0,0,0,0.18)',
                      opacity: selectedOption !== null ? 1 : 0.6,
                    },
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Check Answer</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleNextQuestion}
                  activeOpacity={0.88}
                  style={styles.primaryButton}
                >
                  <Text style={[styles.primaryButtonText, { marginRight: 8 }]}>
                    {currentIndex + 1 < questions.length ? 'Next Question' : 'View Results'}
                  </Text>
                  <ArrowRightIcon size={16} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>
              )
            ) : (
              <View style={styles.footerResultsRow}>
                <TouchableOpacity
                  onPress={handleRestartQuiz}
                  activeOpacity={0.85}
                  style={styles.retryButton}
                >
                  <RotateCcwIcon size={15} color="#8C4522" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleFinishAndSave}
                  activeOpacity={0.88}
                  style={styles.continueButton}
                >
                  <Text style={styles.continueButtonText}>
                    {isPassed ? 'Continue Journey' : 'Exit Quiz'}
                  </Text>
                  <ArrowRightIcon size={15} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#FDFBF7',
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
    marginRight: 10,
  },
  headerIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8C4522',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8C4522',
  },
  progressBarTrack: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8C4522',
    borderRadius: 4,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2A1610',
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  optionsList: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 18,
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  optionLetterBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionLetterText: {
    fontSize: 14,
    fontWeight: '900',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    letterSpacing: -0.1,
  },
  explanationCard: {
    marginTop: 16,
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  explanationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  explanationHeaderText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  explanationBodyText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#523625',
    lineHeight: 22,
  },
  resultsScrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
  },
  trophyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FEF3C7',
    borderWidth: 4,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  resultsHeading: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2A1610',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  resultsSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 280,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 18,
  },
  starBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  scoreValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2A1610',
  },
  scoreResultText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C4522',
    borderRadius: 18,
    paddingVertical: 15,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  footerResultsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  retryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#8C4522',
    borderRadius: 18,
    paddingVertical: 15,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8C4522',
    marginLeft: 6,
  },
  continueButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C4522',
    borderRadius: 18,
    paddingVertical: 15,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 6,
    letterSpacing: 0.2,
  },
  emptyBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2A1610',
    marginTop: 12,
  },
  emptyButton: {
    marginTop: 18,
    backgroundColor: '#8C4522',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
