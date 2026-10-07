import { TodoItem, FarmRecord } from './db-operations';

export function isCheckUpTask(title?: string | null): boolean {
  if (!title) return false;
  return title.trim().toLowerCase().startsWith('check-up');
}

export type TaskGroup = {
  signature: string;
  plotIds: Set<string>;
  plotNames: Set<string>;
  todos: TodoItem[];
};

export type PlotGroup = {
  comboKey: string;
  plotNamesText: string;
  taskGroups: TaskGroup[];
};

export type FarmGroup = {
  farmId: string;
  farmName: string;
  plotGroups: PlotGroup[];
  generalTodos: TodoItem[];
};

export type GroupedTodosData = {
  farmGroups: FarmGroup[];
  allGeneralTodos: TodoItem[]; // if we ever don't want to group by farm
};

export function groupTodosForUI(
  todos: TodoItem[],
  gardenStructures: any[],
  farmsById: Record<string, FarmRecord>
): GroupedTodosData {
  // Map structures to plot names
  const allPlotsMap: Record<string, string> = {};
  gardenStructures.forEach((s) => {
    allPlotsMap[s.id] = s.label || s.type_name || 'Plot';
  });

  const farmMap = new Map<string, FarmGroup>();

  // Helper to ensure a farm group exists
  const getFarmGroup = (farmId: string): FarmGroup => {
    if (!farmMap.has(farmId)) {
      farmMap.set(farmId, {
        farmId,
        farmName: farmsById[farmId]?.farm_name || 'Unknown Farm',
        plotGroups: [],
        generalTodos: [],
      });
    }
    return farmMap.get(farmId)!;
  };

  // Group by Farm -> Signature
  const signatureMapByFarm = new Map<
    string,
    Map<string, { signature: string; plotIds: Set<string>; plotNames: Set<string>; todos: TodoItem[] }>
  >();

  todos.forEach((todo) => {
    const farmGroup = getFarmGroup(todo.farm_id);

    if (!todo.garden_structure_id) {
      farmGroup.generalTodos.push(todo);
      return;
    }

    if (!signatureMapByFarm.has(todo.farm_id)) {
      signatureMapByFarm.set(todo.farm_id, new Map());
    }
    const signatureMap = signatureMapByFarm.get(todo.farm_id)!;

    const signature = `${todo.title}|${todo.notes}|${todo.start_date}|${todo.due_date}`;
    if (!signatureMap.has(signature)) {
      signatureMap.set(signature, {
        signature,
        plotIds: new Set(),
        plotNames: new Set(),
        todos: [],
      });
    }

    const taskGroup = signatureMap.get(signature)!;
    taskGroup.todos.push(todo);
    taskGroup.plotIds.add(todo.garden_structure_id);
    const plotName = allPlotsMap[todo.garden_structure_id] || 'Unknown Plot';
    taskGroup.plotNames.add(plotName);
  });

  // Convert to plot combinations
  signatureMapByFarm.forEach((signatureMap, farmId) => {
    const plotGroupMap = new Map<string, { comboKey: string, plotNamesText: string; taskGroups: TaskGroup[] }>();

    signatureMap.forEach((taskGroup) => {
      const plotIdsArray = Array.from(taskGroup.plotIds).sort();
      const comboKey = plotIdsArray.join(',');

      if (!plotGroupMap.has(comboKey)) {
        const plotNamesArray = Array.from(taskGroup.plotNames).sort();
        plotGroupMap.set(comboKey, {
          comboKey,
          plotNamesText: plotNamesArray.join(', '),
          taskGroups: [],
        });
      }

      plotGroupMap.get(comboKey)!.taskGroups.push(taskGroup);
    });

    const farmGroup = getFarmGroup(farmId);
    farmGroup.plotGroups = Array.from(plotGroupMap.values());
  });

  return {
    farmGroups: Array.from(farmMap.values()),
    allGeneralTodos: [],
  };
}
