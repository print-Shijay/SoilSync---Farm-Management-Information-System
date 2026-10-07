export type DailyReportQuestion = {
  id: string;
  category: string;
  categoryName: string;
  question: string;
  weight?: number;
  classCategory?: string;
};

export type PlotOption = {
  id: string;
  name: string;
  cropName?: string;
  type?: string;
};

export type DailyReportFilter = 'all' | 'issues' | 'healthy';
