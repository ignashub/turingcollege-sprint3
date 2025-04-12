export interface DataInfo {
  rows: number;
  columns: number;
  column_names: string[];
  missing_values: { [key: string]: number };
  file_name: string;
}

export interface CleaningOptions {
  missing_values: {
    [key: string]: 'mean' | 'median' | 'mode' | 'drop';
  };
  outliers: {
    [key: string]: {
      method: 'zscore' | 'iqr';
      action: 'remove' | 'cap';
    };
  };
  remove_duplicates: boolean;
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
} 