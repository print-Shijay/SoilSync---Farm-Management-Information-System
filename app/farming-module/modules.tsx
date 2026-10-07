import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { router, useFocusEffect } from 'expo-router';
import {
  Sparkles,
  BookOpen,
} from 'lucide-react-native';
import { BackButton } from '../../components/common/BackButton';
import { TrophyIcon } from '../../components/learning/LearningIcons';
import { useAuth } from '../../lib/AuthContext';
import { useAccessibility } from '../../lib/accessibility';
import {
  getAllModules,
  getQuizByModuleId,
  getUserLearningProgress,
  saveUserModuleProgress,
  saveUserQuizProgress,
  saveUserFinishLineProgress,
  type ModuleRecord,
  type ModuleQuizRecord,
  type UserLearningProgressRecord,
} from '../../lib/db-operations';
import { LearningPathMap } from '../../components/learning/LearningPathMap';
import { ModuleReaderModal } from '../../components/learning/ModuleReaderModal';
import { QuizRunnerModal } from '../../components/learning/QuizRunnerModal';
import { FinishLineModal } from '../../components/learning/FinishLineModal';

export default function FarmingModulesScreen() {
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, ModuleQuizRecord>>({});
  const [progressMap, setProgressMap] = useState<Record<string, UserLearningProgressRecord>>({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [selectedModule, setSelectedModule] = useState<ModuleRecord | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<ModuleQuizRecord | null>(null);
  const [isFinishLineOpen, setIsFinishLineOpen] = useState(false);

  // Load all modules, quizzes, and user progress
  const loadTrailData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id;

      // 1. Fetch all published modules
      const fetchedModules = await getAllModules();
      setModules(fetchedModules);

      // 2. Fetch quizzes for each module
      const quizLookup: Record<string, ModuleQuizRecord> = {};
      for (const mod of fetchedModules) {
        const quiz = await getQuizByModuleId(mod.id);
        if (quiz) {
          quizLookup[mod.id] = quiz;
        }
      }
      setQuizzes(quizLookup);

      // 3. Fetch progress for current user
      if (userId) {
        const progressList = await getUserLearningProgress(userId);
        const pMap: Record<string, UserLearningProgressRecord> = {};
        progressList.forEach((p) => {
          pMap[p.item_id] = p;
        });
        setProgressMap(pMap);
      }
    } catch (error) {
      console.error('[FarmingModulesScreen] Error loading trail:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTrailData();
    }, [loadTrailData])
  );

  // Calculations for summary stats banner
  const stats = useMemo(() => {
    const totalModules = modules.length;
    let completedModules = 0;
    let totalStars = 0;

    modules.forEach((mod) => {
      const p = progressMap[mod.id];
      if (p && p.is_completed === 1) {
        completedModules++;
      }
    });

    Object.values(progressMap).forEach((p) => {
      if (p.item_type === 'quiz') {
        totalStars += p.stars || 0;
      }
    });

    const finishRecord = progressMap['finish-line-milestone'];
    const isFinished = finishRecord ? finishRecord.is_completed === 1 : false;

    return {
      totalModules,
      completedModules,
      totalStars,
      isFinished,
    };
  }, [modules, progressMap]);

  // Handlers for Path Interaction
  const handleSelectModule = (mod: ModuleRecord) => {
    setSelectedModule(mod);
  };

  const handleSelectQuiz = (quiz: ModuleQuizRecord) => {
    setSelectedQuiz(quiz);
  };

  const handleSelectFinishLine = () => {
    setIsFinishLineOpen(true);
  };

  const handleModuleCompletedAndStartQuiz = async (moduleId: string) => {
    if (user?.id) {
      await saveUserModuleProgress(user.id, moduleId);
      await loadTrailData();
    }
    const targetQuiz = quizzes[moduleId];
    if (targetQuiz) {
      setSelectedQuiz(targetQuiz);
    } else {
      Alert.alert('Quiz Ready', 'You completed the reading! Take the checkpoint test now.');
    }
  };

  const handleQuizCompleted = async (
    quizId: string,
    moduleId: string,
    score: number,
    stars: number
  ) => {
    if (user?.id) {
      await saveUserQuizProgress(user.id, quizId, score, stars);
      await loadTrailData();
    }
  };

  const handleClaimFinishLine = async () => {
    if (user?.id) {
      await saveUserFinishLineProgress(user.id);
      await loadTrailData();
      Alert.alert(
        '🏆 Path Mastered!',
        'Congratulations on completing all agricultural foundational modules and quizzes!',
        [{ text: 'Celebrate!' }]
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#4EA336' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Gamified Header Banner (Apple Translucent Header) */}
      <View
        style={{
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 12,
          paddingBottom: 14,
          paddingHorizontal: 16,
          zIndex: 20,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(0,0,0,0.05)',
          backgroundColor: '#FBF8F4',
        }}
      >
        {/* Navigation & Actions Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton
            onPress={() => {
              triggerHaptic('light');
              router.back();
            }}
            style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
            className={isGloveMode ? 'h-12 w-12' : 'h-10 w-10'}
            size={isGloveMode ? 22 : 20}
            color={isHighContrast ? '#000000' : '#1C120C'}
          />

          {/* Center Stage Ribbon (Matching Level Header) */}
          <View
            style={{
              height: isGloveMode ? 44 : 36,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: isGloveMode ? 22 : 18,
              backgroundColor: '#ECFDF5',
              paddingHorizontal: isGloveMode ? 18 : 16,
              borderWidth: isHighContrast ? 2 : 1,
              borderColor: isHighContrast ? '#000000' : 'rgba(110,231,183,0.6)',
            }}
          >
            <BookOpen size={isGloveMode ? 16 : 14} color="#059669" />
            <Text style={{ marginLeft: 8, fontSize: Math.round(12 * fontScale), fontWeight: '900', color: '#064E3B', letterSpacing: 0.3 }}>
              Agri-Trail
            </Text>
            <View style={{ marginLeft: 8, borderRadius: 10, backgroundColor: '#059669', paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: Math.round(10 * fontScale), fontWeight: '900', color: '#FFFFFF' }}>
                {stats.completedModules}/{stats.totalModules}
              </Text>
            </View>
          </View>

          {/* Right Spacer for Balanced Center Alignment */}
          <View style={{ width: isGloveMode ? 48 : 40 }} />
        </View>
      </View>

      {/* Main Path Map View with Floating Side Info Badges */}
      <View style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5EAD9' }}>
            <ActivityIndicator size="large" color="#8C4522" />
            <Text style={{ marginTop: 12, fontSize: Math.round(12 * fontScale), fontWeight: '700', color: '#8C7C70' }}>
              Loading Adventure Trail...
            </Text>
          </View>
        ) : (
          <>
            <LearningPathMap
              modules={modules}
              quizzes={quizzes}
              progress={progressMap}
              userProfile={{
                avatar_url: user?.user_metadata?.avatar_url,
                profile_icon_url: user?.user_metadata?.profile_icon_url,
                first_name: user?.user_metadata?.first_name || user?.user_metadata?.full_name,
                username: user?.email?.split('@')[0],
              }}
              onSelectModule={handleSelectModule}
              onSelectQuiz={handleSelectQuiz}
              onSelectFinishLine={handleSelectFinishLine}
            />

            {/* Floating Side Info Badges (Candy Crush Style Side HUD on the Right) */}
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                alignItems: 'flex-end',
                gap: 10,
                zIndex: 40,
              }}
            >
              {/* Progress Trophy Badge */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  triggerHaptic('selection');
                  Alert.alert(
                    '🏆 Trail Mastery',
                    `You have completed ${stats.completedModules} of ${stats.totalModules} farming modules. Pass every quiz to reach the Summit Finish Line!`,
                    [{ text: 'Keep Going' }]
                  );
                }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  paddingVertical: isGloveMode ? 10 : 6,
                  paddingHorizontal: isGloveMode ? 14 : 10,
                  borderWidth: isHighContrast ? 2 : 1.5,
                  borderColor: isHighContrast ? '#000000' : '#FCD34D',
                  shadowColor: '#2A1610',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: isGloveMode ? 34 : 30,
                    height: isGloveMode ? 34 : 30,
                    borderRadius: isGloveMode ? 17 : 15,
                    backgroundColor: '#FEF3C7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#F59E0B',
                    marginRight: 6,
                  }}
                >
                  <TrophyIcon size={isGloveMode ? 18 : 16} color="#D97706" />
                </View>
                <View>
                  <Text style={{ fontSize: Math.round(8 * fontScale), fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}>
                    Mastered
                  </Text>
                  <Text style={{ fontSize: Math.round(11 * fontScale), fontWeight: '900', color: '#1E293B' }}>
                    {stats.completedModules}/{stats.totalModules}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Star Vault Badge */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  triggerHaptic('selection');
                  Alert.alert(
                    '⭐ Stars Collected',
                    `You have earned ${stats.totalStars} stars from checkpoint quizzes. Score 100% on quizzes to get 3 stars per stage!`,
                    [{ text: 'Awesome' }]
                  );
                }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  paddingVertical: isGloveMode ? 10 : 6,
                  paddingHorizontal: isGloveMode ? 14 : 10,
                  borderWidth: isHighContrast ? 2 : 1.5,
                  borderColor: isHighContrast ? '#000000' : '#FCD34D',
                  shadowColor: '#2A1610',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: isGloveMode ? 34 : 30,
                    height: isGloveMode ? 34 : 30,
                    borderRadius: isGloveMode ? 17 : 15,
                    backgroundColor: '#FEF3C7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#F59E0B',
                    marginRight: 6,
                  }}
                >
                  <Sparkles size={isGloveMode ? 18 : 16} color="#D97706" />
                </View>
                <View>
                  <Text style={{ fontSize: Math.round(8 * fontScale), fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}>
                    Stars
                  </Text>
                  <Text style={{ fontSize: Math.round(11 * fontScale), fontWeight: '900', color: '#D97706' }}>
                    {stats.totalStars} ⭐
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Module Reader Modal */}
      <ModuleReaderModal
        visible={selectedModule !== null}
        module={selectedModule}
        isCompleted={
          selectedModule
            ? progressMap[selectedModule.id]?.is_completed === 1
            : false
        }
        onClose={() => setSelectedModule(null)}
        onCompleteAndStartQuiz={handleModuleCompletedAndStartQuiz}
      />

      {/* Quiz Runner Modal */}
      <QuizRunnerModal
        visible={selectedQuiz !== null}
        quiz={selectedQuiz}
        onClose={() => setSelectedQuiz(null)}
        onQuizCompleted={handleQuizCompleted}
      />

      {/* Finish Line Modal */}
      <FinishLineModal
        visible={isFinishLineOpen}
        onClose={() => setIsFinishLineOpen(false)}
        totalModulesCount={stats.completedModules}
        totalStarsEarned={stats.totalStars}
        isCompleted={stats.isFinished}
        userProfile={{
          userId: user?.id,
          firstName: user?.user_metadata?.first_name || '',
          lastName: user?.user_metadata?.last_name || '',
          email: user?.email || '',
        }}
        onClaimFinish={handleClaimFinishLine}
      />
    </SafeAreaView>
  );
}
