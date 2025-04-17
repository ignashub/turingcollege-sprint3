export interface DataInfo {
  rows: number;
  columns: number;
  column_names: string[];
  missing_values: { [key: string]: number };
  file_name: string;
  agent_analysis?: string;
  ai_recommendations?: any;
}

export interface CleaningOptions {
  missing_values: {
    [key: string]: {
      method: 'mean' | 'median' | 'mode' | 'drop' | 'none';
    };
  };
  outliers: {
    [key: string]: {
      method: 'zscore' | 'iqr';
      action?: 'remove' | 'cap';
      enabled: boolean;
      threshold?: number;
    };
  };
  remove_duplicates: boolean;
  get_recommendations_only?: boolean;
}

export interface AuditLogEntry {
  timestamp: string;
  operation: string;
  column?: string;
  details: { [key: string]: any };
  rows_affected?: number;
}

export interface CleaningReport {
  original_rows: number;
  original_columns: number;
  final_rows: number;
  final_columns: number;
  duplicates_removed: number;
  missing_values_before: { [key: string]: number };
  missing_values_after: { [key: string]: number };
  missing_values_handled: { [key: string]: string };
  outliers_handled: {
    [key: string]: {
      method: string;
      action: string;
      count: number;
    };
  };
  human_readable?: string;
  agent_suggestions?: string;
  audit_log?: AuditLogEntry[];
  ai_recommendations?: any;
  is_ecommerce_dataset?: boolean;
}

export interface AIRecommendation {
  explanation?: string;
  general_advice?: string;
  overall_advice?: string;
  should_remove_duplicates?: boolean;
  duplicate_removal?: boolean;
  column_recommendations: Record<string, any>;
} 