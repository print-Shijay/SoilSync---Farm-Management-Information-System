import { useCallback, useEffect, useState } from 'react';
import {
  fetchDynamicProblemClassesFromDB,
  getFarmDailyReports,
  hasSubmittedDailyReportToday,
  saveDailyReport,
  deleteDailyReport,
  type FarmDailyReportRecord,
  type DailyReportInput,
  type ProblemClassItem,
  getDatabase,
} from '../../../lib/db-operations';
import { powersync } from '../../../lib/powersync';
import { CONDITION_LABELS, YOLO_CLASS_INDEX } from '../../rfdetr-detector/config';
import type { DailyReportQuestion, PlotOption } from '../types';

export function useDailyReports(farmId: string, userId?: string) {
  const [reports, setReports] = useState<FarmDailyReportRecord[]>([]);
  const [questions, setQuestions] = useState<DailyReportQuestion[]>([]);
  const [plots, setPlots] = useState<PlotOption[]>([]);
  const [hasReportedToday, setHasReportedToday] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Load questions from dynamic problem classes
  const loadQuestions = useCallback(async () => {
    try {
      const problemClasses = await fetchDynamicProblemClassesFromDB();
      const extracted: DailyReportQuestion[] = [];

      if (problemClasses && problemClasses.length > 0) {
        problemClasses.forEach((pc: ProblemClassItem) => {
          const categoryName =
            pc.name ||
            CONDITION_LABELS[pc.id] ||
            pc.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

          const rawCategory = (pc.category || '').toLowerCase();
          const isDisease =
            rawCategory === 'disease' ||
            pc.id.includes('disease') ||
            pc.id.includes('discolor') ||
            pc.id.includes('fung') ||
            pc.id.includes('mold') ||
            pc.id.includes('rot') ||
            pc.id.includes('spot') ||
            pc.id.includes('mildew');
          const classCategory = rawCategory === 'pest' || rawCategory === 'disease' ? rawCategory : (isDisease ? 'disease' : 'pest');

          if (Array.isArray(pc.questions) && pc.questions.length > 0) {
            pc.questions.forEach((qText: string, idx: number) => {
              if (qText && typeof qText === 'string' && qText.trim()) {
                extracted.push({
                  id: `pc_${pc.id}_${idx}`,
                  category: pc.id,
                  categoryName,
                  question: qText.trim(),
                  weight: 1,
                  classCategory,
                });
              }
            });
          }
        });
      }

      // Fallback questions if none configured
      if (extracted.length === 0) {
        extracted.push(
          {
            id: 'fallback_1',
            category: 'aphids',
            categoryName: 'Aphids',
            question: 'Are there clusters of tiny insects or sticky residue visible on leaves?',
            classCategory: 'pest',
          },
          {
            id: 'fallback_2',
            category: 'leaf_discoloration',
            categoryName: 'Leaf Discoloration',
            question: 'Are there yellowing patches, yellow halos, or brown necrotic spots?',
            classCategory: 'disease',
          },
          {
            id: 'fallback_3',
            category: 'fungal_growth',
            categoryName: 'Fungal / Mildew',
            question: 'Is there white powdery mildew, fuzzy spores, or damping off near the stem base?',
            classCategory: 'disease',
          }
        );
      }

      setQuestions(extracted);
    } catch (err) {
      console.warn('[useDailyReports] Failed to load questions:', err);
    }
  }, []);

  // Load plots that have an assigned crop
  const loadPlots = useCallback(async () => {
    try {
      const db = getDatabase();
      const plotList: PlotOption[] = [
        { id: 'general', name: 'General Farm Field', type: 'Farm Wide' },
      ];

      // 1. Query garden_structures joined with farm_layouts AND crop_cycles
      // Only include structures that have an assigned crop cycle!
      const assignedStructures = await db.all<any>(
        `SELECT 
           gs.id, 
           gs.label, 
           gs.structure_type_id, 
           gs.display_order,
           cc.id as cycle_id,
           cc.crop_id,
           cc.status as cycle_status,
           c.common_name as crop_name,
           c.local_name as crop_local_name
         FROM garden_structures gs
         JOIN farm_layouts fl ON fl.id = gs.farm_layout_id
         JOIN crop_cycles cc ON cc.garden_structure_id = gs.id
         LEFT JOIN organic_farming_crops c ON c.id = cc.crop_id
         WHERE fl.farm_id = ?
           AND cc.status NOT IN ('harvested', 'cancelled', 'removed')
         ORDER BY gs.display_order ASC, gs.label ASC`,
        [farmId]
      );

      if (assignedStructures && assignedStructures.length > 0) {
        const seen = new Set<string>();
        assignedStructures.forEach((s) => {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            const cropTitle = s.crop_name || s.crop_local_name || (s.crop_id ? `Crop #${s.crop_id}` : null);
            const baseLabel = s.label || `Plot ${s.display_order || s.id.substring(0, 4)}`;
            const displayName = cropTitle ? `${baseLabel} (${cropTitle})` : baseLabel;

            plotList.push({
              id: s.id,
              name: displayName,
              cropName: cropTitle || undefined,
              type: s.structure_type_id ? `Type ${s.structure_type_id}` : 'Plot',
            });
          }
        });
      } else {
        // 2. Fallback: Check if blueprint_data_json from farm_layouts has items with assigned crops
        const layoutRow = await db.get<any>(
          `SELECT id, blueprint_data_json FROM farm_layouts WHERE farm_id = ? LIMIT 1`,
          [farmId]
        );

        if (layoutRow?.blueprint_data_json) {
          try {
            const blueprint =
              typeof layoutRow.blueprint_data_json === 'string'
                ? JSON.parse(layoutRow.blueprint_data_json)
                : layoutRow.blueprint_data_json;

            const items = blueprint?.structures || blueprint?.items || blueprint?.plots || [];
            if (Array.isArray(items)) {
              items.forEach((item: any, idx: number) => {
                // Only include if item has an assigned crop!
                if (item.crop_id || item.crop || item.cropName || item.assigned_crop) {
                  const cropName = item.cropName || item.crop || item.crop_id;
                  const label = item.label || item.name || `Bed ${idx + 1}`;
                  plotList.push({
                    id: item.id || `blueprint_${idx + 1}`,
                    name: `${label} (${cropName})`,
                    cropName: String(cropName),
                    type: item.type || 'Plot',
                  });
                }
              });
            }
          } catch {
            // Blueprint parse fallback
          }
        }
      }

      setPlots(plotList);
    } catch (err) {
      console.warn('[useDailyReports] Failed to load plots:', err);
      setPlots([{ id: 'general', name: 'General Farm Field', type: 'Farm Wide' }]);
    }
  }, [farmId]);

  // Load reports
  const loadReports = useCallback(async () => {
    try {
      const data = await getFarmDailyReports(farmId);
      setReports(data);

      if (userId) {
        const reportedToday = await hasSubmittedDailyReportToday(farmId, userId);
        setHasReportedToday(reportedToday);
      }
    } catch (err) {
      console.warn('[useDailyReports] Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [farmId, userId]);

  useEffect(() => {
    loadQuestions();
    loadPlots();
    loadReports();

    let isMounted = true;
    const abortController = new AbortController();

    try {
      (async () => {
        try {
          for await (const _update of (powersync as any).watch(
            'SELECT id FROM farm_daily_reports WHERE farm_id = ?',
            [farmId],
            { signal: abortController.signal }
          )) {
            if (!isMounted) break;
            void loadReports();
          }
        } catch {
          // graceful fallback if watch is not active
        }
      })();
    } catch {
      // ignore
    }

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [farmId, loadQuestions, loadPlots, loadReports]);

  // Submit report
  const submitReport = useCallback(
    async (input: Omit<DailyReportInput, 'farmId' | 'userId'>) => {
      if (!userId) throw new Error('User not authenticated');
      setSubmitting(true);
      try {
        const id = await saveDailyReport({
          ...input,
          farmId,
          userId,
        });
        await loadReports();
        return id;
      } finally {
        setSubmitting(false);
      }
    },
    [farmId, userId, loadReports]
  );

  // Delete report
  const removeReport = useCallback(
    async (reportId: string) => {
      await deleteDailyReport(reportId);
      await loadReports();
    },
    [loadReports]
  );

  return {
    reports,
    questions,
    plots,
    hasReportedToday,
    loading,
    submitting,
    refresh: loadReports,
    submitReport,
    removeReport,
  };
}
