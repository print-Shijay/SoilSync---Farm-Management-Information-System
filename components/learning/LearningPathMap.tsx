import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  Animated,
  } from 'react-native';
import { AppAlert as Alert } from '../common/AppAlert';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  BookOpen,
  Check,
} from 'lucide-react-native';
import {
  TrophyIcon,
  CrownIcon,
  StarIcon,
  SproutIcon,
  TreeIcon,
  ShieldIcon,
  DropletIcon,
  FlaskIcon,
  LayersIcon,
  LockIcon,
  HelpCircleIcon,
} from './LearningIcons';
import type {
  ModuleRecord,
  ModuleQuizRecord,
  UserLearningProgressRecord,
} from '../../lib/db-operations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = SCREEN_WIDTH;
const NODE_SPACING_Y = 145;
const CENTER_X = MAP_WIDTH / 2;
const TOP_PADDING = 120;
const BOTTOM_PADDING = 150;

export type PathNodeType = 'module' | 'quiz' | 'finish_line';

export interface PathNodeItem {
  id: string;
  type: PathNodeType;
  title: string;
  category?: string;
  difficulty?: string;
  order: number;
  moduleData?: ModuleRecord;
  quizData?: ModuleQuizRecord;
  x: number;
  y: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  isActive: boolean; // Current player location
  stars: number;
}

interface LearningPathMapProps {
  modules: ModuleRecord[];
  quizzes: Record<string, ModuleQuizRecord>;
  progress: Record<string, UserLearningProgressRecord>;
  userProfile?: {
    avatar_url?: string | null;
    profile_icon_url?: string | null;
    first_name?: string | null;
    username?: string | null;
  } | null;
  onSelectModule: (module: ModuleRecord) => void;
  onSelectQuiz: (quiz: ModuleQuizRecord) => void;
  onSelectFinishLine: () => void;
}

// Thematic icon helper for major modules
function getModuleIcon(order: number, category = '') {
  const cat = category.toLowerCase();
  if (cat.includes('soil') || order === 1) return <LayersIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  if (cat.includes('compost') || order === 2) return <SproutIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  if (cat.includes('crop') || order === 3) return <TreeIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  if (cat.includes('pest') || order === 4) return <ShieldIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  if (cat.includes('water') || cat.includes('irrigation') || order === 5) return <DropletIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  if (cat.includes('npk') || cat.includes('nutrient') || order === 6) return <FlaskIcon size={24} color="#FFFFFF" strokeWidth={2.4} />;
  return <BookOpen size={24} color="#FFFFFF" />;
}

export function LearningPathMap({
  modules,
  quizzes,
  progress,
  userProfile,
  onSelectModule,
  onSelectQuiz,
  onSelectFinishLine,
}: LearningPathMapProps) {
  // 1. Build the unified sequence of path nodes (Module 1 -> Quiz 1 -> Module 2 -> Quiz 2 ... -> Finish Line)
  const pathNodes = useMemo<PathNodeItem[]>(() => {
    const rawNodes: Omit<PathNodeItem, 'x' | 'y' | 'isUnlocked' | 'isCompleted' | 'isActive' | 'stars'>[] = [];

    // Sort modules by sort_order
    const sorted = [...modules].sort((a, b) => a.sort_order - b.sort_order);

    sorted.forEach((mod) => {
      // 1. Major node: Module Milestone
      rawNodes.push({
        id: mod.id,
        type: 'module',
        title: mod.title,
        category: mod.category,
        difficulty: mod.difficulty,
        order: mod.sort_order,
        moduleData: mod,
      });

      // 2. Minor node: Quiz Stepping Stone
      const quiz = quizzes[mod.id] || {
        id: `quiz-${mod.id}`,
        module_id: mod.id,
        title: `${mod.title} Quiz`,
        description: null,
        passing_score: 70,
        questions_json: '[]',
        sort_order: mod.sort_order,
        created_at: '',
        updated_at: '',
      };

      rawNodes.push({
        id: quiz.id,
        type: 'quiz',
        title: `${mod.title} Checkpoint`,
        order: mod.sort_order,
        quizData: quiz,
      });
    });

    // 3. Final Milestone: Summit Finish Line
    rawNodes.push({
      id: 'finish-line-milestone',
      type: 'finish_line',
      title: 'Summit Finish Line',
      order: (sorted[sorted.length - 1]?.sort_order ?? 0) + 1,
    });

    // Calculate progression and coordinates along straight central path corridor
    let firstUncompletedFound = false;
    const computedNodes: PathNodeItem[] = [];

    rawNodes.forEach((node, idx) => {
      // Straight central alignment with slight alternating offset for tactile clarity
      const x = CENTER_X + (idx % 2 === 0 ? -12 : 12);
      const y = TOP_PADDING + idx * NODE_SPACING_Y;

      // Completion check
      const progRecord = progress[node.id];
      const isCompleted = progRecord ? progRecord.is_completed === 1 : false;
      const stars = progRecord ? progRecord.stars : 0;

      // Unlock rule: Node 0 is unlocked. Node N is unlocked if Node N-1 is completed.
      let isUnlocked = false;
      if (idx === 0) {
        isUnlocked = true;
      } else {
        const prevNode = computedNodes[idx - 1];
        isUnlocked = prevNode ? prevNode.isCompleted : false;
      }

      // Active player location: First unlocked node that is not yet completed
      let isActive = false;
      if (isUnlocked && !isCompleted && !firstUncompletedFound) {
        isActive = true;
        firstUncompletedFound = true;
      }

      computedNodes.push({
        ...node,
        x,
        y,
        isUnlocked,
        isCompleted,
        isActive,
        stars,
      });
    });

    // If all nodes are completed, set the summit finish line as active
    if (!firstUncompletedFound && computedNodes.length > 0) {
      computedNodes[computedNodes.length - 1].isActive = true;
    }

    return computedNodes;
  }, [modules, quizzes, progress]);

  // Total canvas height
  const totalMapHeight = useMemo(() => {
    return TOP_PADDING + pathNodes.length * NODE_SPACING_Y + BOTTOM_PADDING;
  }, [pathNodes]);

  // Each of the 3 maps gets 1/3 of the total canvas height
  const singleMapHeight = useMemo(() => {
    return totalMapHeight / 3;
  }, [totalMapHeight]);

  // Generate SVG Bezier Path String for the continuous straight central ribbon
  const svgPathString = useMemo(() => {
    if (pathNodes.length === 0) return '';
    let d = `M ${pathNodes[0].x} ${pathNodes[0].y}`;

    for (let i = 0; i < pathNodes.length - 1; i++) {
      const current = pathNodes[i];
      const next = pathNodes[i + 1];

      const midY = (current.y + next.y) / 2;
      const cp1X = current.x;
      const cp1Y = midY;
      const cp2X = next.x;
      const cp2Y = midY;

      d += ` C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${next.x} ${next.y}`;
    }

    return d;
  }, [pathNodes]);

  // Apple Fluid Spring Floating Animation for Avatar Pin
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -10,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bounceAnim]);

  const handleNodePress = (node: PathNodeItem, index: number) => {
    if (!node.isUnlocked) {
      const prevNode = pathNodes[index - 1];
      const prevTitle = prevNode ? prevNode.title : 'the previous stage';
      Alert.alert(
        '🔒 Stage Locked',
        `Complete "${prevTitle}" first to unlock this section of the learning path!`,
        [{ text: 'Got it' }]
      );
      return;
    }

    if (node.type === 'module' && node.moduleData) {
      onSelectModule(node.moduleData);
    } else if (node.type === 'quiz' && node.quizData) {
      onSelectQuiz(node.quizData);
    } else if (node.type === 'finish_line') {
      onSelectFinishLine();
    }
  };

  const avatarUri = userProfile?.avatar_url || userProfile?.profile_icon_url;
  const displayName = userProfile?.first_name || userProfile?.username || 'Player';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        minHeight: totalMapHeight,
        paddingBottom: 80,
      }}
      style={{ flex: 1, backgroundColor: '#4EA336' }}
    >
      {/* ── 3 Seamless 1080x2400 Pixel Art Farming Maps Stack (Start -> Farm -> Finishline) ── */}
      <View
        style={{
          width: MAP_WIDTH,
          height: totalMapHeight,
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
        }}
      >
        {/* Picture 1: Start Map (Entrance, Soil Foundations, Compost Bays) */}
        <Image
          source={require('../../assets/images/farming_map_start.jpg')}
          style={{
            width: MAP_WIDTH,
            height: singleMapHeight,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          resizeMode="cover"
        />

        {/* Picture 2: Farm Map (Tomatoes, Greenhouses, Irrigation Ponds, Strawberries) */}
        <Image
          source={require('../../assets/images/farming_map_farm.jpg')}
          style={{
            width: MAP_WIDTH,
            height: singleMapHeight,
            position: 'absolute',
            top: singleMapHeight,
            left: 0,
          }}
          resizeMode="cover"
        />

        {/* Picture 3: Finishline Map (Corn, Pumpkins, Wheat, Barns, Windmills & Finish Arch) */}
        <Image
          source={require('../../assets/images/farming_map_finish.jpg')}
          style={{
            width: MAP_WIDTH,
            height: singleMapHeight,
            position: 'absolute',
            top: singleMapHeight * 2,
            left: 0,
          }}
          resizeMode="cover"
        />

        {/* Seamless Soft Transition Seams Between Maps */}
        <View
          style={{
            position: 'absolute',
            top: singleMapHeight - 6,
            left: 0,
            width: MAP_WIDTH,
            height: 12,
            backgroundColor: 'rgba(92, 53, 29, 0.12)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: singleMapHeight * 2 - 6,
            left: 0,
            width: MAP_WIDTH,
            height: 12,
            backgroundColor: 'rgba(92, 53, 29, 0.12)',
          }}
        />
      </View>

      {/* ── Natural Farm Walking Trail (Dashed Soil Footpath) ── */}
      <View
        style={{
          width: MAP_WIDTH,
          height: totalMapHeight,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <Svg width={MAP_WIDTH} height={totalMapHeight}>
          {/* 1. Subtle Trail Shadow on Ground */}
          <Path
            d={svgPathString}
            stroke="#2A1610"
            strokeWidth={6}
            strokeDasharray="10, 8"
            strokeLinecap="round"
            fill="none"
            opacity={0.3}
          />

          {/* 2. Natural Earth & Soil Footpath Trail */}
          <Path
            d={svgPathString}
            stroke="#8C4522"
            strokeWidth={4.5}
            strokeDasharray="10, 8"
            strokeLinecap="round"
            fill="none"
          />

          {/* 3. Subtle Warm Center Stepping Accents */}
          <Path
            d={svgPathString}
            stroke="#FDE68A"
            strokeWidth={2}
            strokeDasharray="4, 14"
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
        </Svg>
      </View>

      {/* ── Path Milestone Nodes (Minimalist Green & Brown Discs) ── */}
      {pathNodes.map((node, index) => {
        const isMajor = node.type === 'module';
        const isFinish = node.type === 'finish_line';
        const isMinor = node.type === 'quiz';

        const circleSize = isFinish ? 84 : isMajor ? 72 : 46;
        const radius = circleSize / 2;

        return (
          <View
            key={`node-item-${node.id}`}
            style={{
              position: 'absolute',
              left: node.x - radius,
              top: node.y - radius,
              width: circleSize,
              height: circleSize,
              zIndex: node.isActive ? 30 : 10,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Minimalist Organic Glow Halo for Active Level */}
            {node.isActive && (
              <View
                style={{
                  position: 'absolute',
                  width: circleSize + 18,
                  height: circleSize + 18,
                  borderRadius: (circleSize + 18) / 2,
                  backgroundColor: 'rgba(16, 185, 129, 0.25)',
                  borderWidth: 2,
                  borderColor: '#10B981',
                }}
              />
            )}

            {/* Subtle Drop Shadow */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                width: circleSize,
                height: circleSize,
                borderRadius: radius,
                backgroundColor: 'rgba(42, 22, 16, 0.2)',
              }}
            />

            {/* Minimalist Tactile Disc */}
            <TouchableOpacity
              onPress={() => handleNodePress(node, index)}
              activeOpacity={node.isUnlocked ? 0.82 : 0.95}
              style={{
                width: circleSize,
                height: circleSize,
                borderRadius: radius,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: isFinish ? 3.5 : isMajor ? 3 : 2.5,
                borderColor: !node.isUnlocked
                  ? '#D1D5DB'
                  : node.isCompleted
                  ? '#D1FAE5'
                  : node.isActive
                  ? '#FEF3C7'
                  : '#FFFFFF',
                backgroundColor: !node.isUnlocked
                  ? '#94A3B8'
                  : node.isCompleted
                  ? '#10B981' // Organic Emerald Green
                  : node.isActive
                  ? isFinish
                    ? '#059669'
                    : '#8C4522' // Rich Soil Brown
                  : isFinish
                  ? '#10B981'
                  : isMajor
                  ? '#8C4522'
                  : '#6B3A1E',
                shadowColor: '#2A1610',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              {/* Inner Soft Light Reflection */}
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  right: 4,
                  height: radius * 0.6,
                  borderRadius: radius,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                }}
              />

              {/* Node Center Icon / Emblem */}
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {!node.isUnlocked ? (
                  <LockIcon size={isMajor || isFinish ? 20 : 15} color="#FFFFFF" strokeWidth={2.4} />
                ) : isFinish ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <TrophyIcon size={32} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                ) : isMajor ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {getModuleIcon(node.order, node.category)}
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 9,
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: '#D1FAE5',
                      }}
                    >
                      {node.order}
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {node.isCompleted ? (
                      <Check size={20} color="#FFFFFF" strokeWidth={3} />
                    ) : (
                      <HelpCircleIcon size={20} color="#FFFFFF" strokeWidth={2.4} />
                    )}
                  </View>
                )}
              </View>

              {/* Completed Status Checkmark Badge for Major Nodes */}
              {node.isCompleted && isMajor && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -3,
                    right: -3,
                    backgroundColor: '#059669',
                    borderRadius: 10,
                    padding: 2.5,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <Check size={11} color="#FFFFFF" strokeWidth={3.5} />
                </View>
              )}

              {/* Completed Star Rating Badge for Quiz Stepping Stones */}
              {node.isCompleted && isMinor && node.stars > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -5,
                    backgroundColor: '#15803D',
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <StarIcon size={9} color="#FFFFFF" fill="#FFFFFF" />
                  <Text style={{ marginLeft: 2, fontSize: 8, fontWeight: '900', color: '#FFFFFF' }}>
                    {node.stars}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Apple Typography Milestone Title Pill below Major Nodes */}
            {(isMajor || isFinish) && (
              <View
                style={{
                  position: 'absolute',
                  top: circleSize + 8,
                  width: 145,
                  alignItems: 'center',
                }}
                pointerEvents="none"
              >
                <View
                  style={{
                    backgroundColor: node.isActive
                      ? '#FFFFFF'
                      : node.isCompleted
                      ? 'rgba(255,255,255,0.96)'
                      : 'rgba(255,255,255,0.85)',
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderWidth: 1,
                    borderColor: node.isActive
                      ? '#F59E0B'
                      : node.isCompleted
                      ? 'rgba(16,185,129,0.35)'
                      : 'rgba(0,0,0,0.06)',
                    shadowColor: '#2A1610',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.06,
                    shadowRadius: 6,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      textAlign: 'center',
                      fontSize: 10.5,
                      fontWeight: '800',
                      color: node.isActive
                        ? '#8C4522'
                        : node.isCompleted
                        ? '#065F46'
                        : '#64748B',
                      letterSpacing: -0.2,
                      lineHeight: 13,
                    }}
                  >
                    {node.title}
                  </Text>
                  {node.difficulty && (
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 8.5,
                        fontWeight: '800',
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                      }}
                    >
                      {node.difficulty}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Quiz Label Pill for Minor Stepping Stones */}
            {isMinor && (
              <View
                style={{
                  position: 'absolute',
                  top: circleSize + 4,
                  width: 90,
                  alignItems: 'center',
                }}
                pointerEvents="none"
              >
                <Text
                  numberOfLines={1}
                  style={{
                    textAlign: 'center',
                    fontSize: 9,
                    fontWeight: '800',
                    color: '#8C4522',
                    opacity: 0.75,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  Quiz {node.order}
                </Text>
              </View>
            )}

            {/* ── Player Avatar Pin Badge (Matching Candy Crush Reference Image) ── */}
            {node.isActive && (
              <Animated.View
                style={{
                  position: 'absolute',
                  top: -56,
                  left: -48,
                  transform: [{ translateY: bounceAnim }],
                  zIndex: 50,
                }}
                pointerEvents="none"
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#1E293B',
                    borderRadius: 20,
                    padding: 3,
                    paddingRight: 10,
                    borderWidth: 2.5,
                    borderColor: '#F59E0B',
                    shadowColor: '#F59E0B',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                    elevation: 8,
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFFFFF' }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: '#F59E0B',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: '#FFFFFF',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFFFFF' }}>
                        {displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ marginLeft: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#FBBF24', letterSpacing: 0.5 }}>
                      YOU
                    </Text>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#E2E8F0' }}>
                      Level {node.order}
                    </Text>
                  </View>
                </View>

                {/* Pointing Pin Emerald Dot & Line */}
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#10B981',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    marginLeft: 26,
                    marginTop: -3,
                  }}
                />
              </Animated.View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
