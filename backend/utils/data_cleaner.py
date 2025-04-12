import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from typing import Dict, Tuple, Any

def detect_outliers(df: pd.DataFrame, column: str, method: str = 'zscore') -> pd.Series:
    """
    Detect outliers in a column using either Z-score or IQR method.
    Returns a boolean series indicating outliers.
    """
    if method == 'zscore':
        z_scores = np.abs((df[column] - df[column].mean()) / df[column].std())
        return z_scores > 3
    else:  # IQR method
        Q1 = df[column].quantile(0.25)
        Q3 = df[column].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        return (df[column] < lower_bound) | (df[column] > upper_bound)

def handle_missing_values(df: pd.DataFrame, column: str, method: str = 'mean') -> pd.Series:
    """
    Handle missing values in a column using specified method.
    """
    if method == 'mean':
        return df[column].fillna(df[column].mean())
    elif method == 'median':
        return df[column].fillna(df[column].median())
    elif method == 'mode':
        return df[column].fillna(df[column].mode()[0])
    elif method == 'drop':
        return df[column].dropna()
    else:
        return df[column]

def clean_dataset(df: pd.DataFrame, options: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Clean the dataset based on provided options.
    Returns cleaned dataframe and a report of actions taken.
    """
    report = {
        'original_rows': len(df),
        'original_columns': len(df.columns),
        'missing_values_before': df.isnull().sum().to_dict(),
        'duplicates_removed': 0,
        'outliers_handled': {},
        'missing_values_handled': {}
    }
    
    # Create a copy of the dataframe
    cleaned_df = df.copy()
    
    # Handle missing values
    for column in cleaned_df.columns:
        if column in options.get('missing_values', {}):
            method = options['missing_values'][column]
            if method == 'drop':
                cleaned_df = cleaned_df.dropna(subset=[column])
            else:
                cleaned_df[column] = handle_missing_values(cleaned_df, column, method)
            report['missing_values_handled'][column] = method
    
    # Remove duplicates if requested
    if options.get('remove_duplicates', False):
        duplicates_before = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates()
        report['duplicates_removed'] = duplicates_before - len(cleaned_df)
    
    # Handle outliers
    for column in cleaned_df.select_dtypes(include=[np.number]).columns:
        if column in options.get('outliers', {}):
            method = options['outliers'][column]['method']
            action = options['outliers'][column]['action']
            
            outliers = detect_outliers(cleaned_df, column, method)
            if action == 'remove':
                cleaned_df = cleaned_df[~outliers]
            elif action == 'cap':
                if method == 'zscore':
                    z_scores = np.abs((cleaned_df[column] - cleaned_df[column].mean()) / cleaned_df[column].std())
                    cleaned_df.loc[z_scores > 3, column] = cleaned_df[column].mean() + 3 * cleaned_df[column].std()
                else:  # IQR method
                    Q1 = cleaned_df[column].quantile(0.25)
                    Q3 = cleaned_df[column].quantile(0.75)
                    IQR = Q3 - Q1
                    cleaned_df.loc[cleaned_df[column] < Q1 - 1.5 * IQR, column] = Q1 - 1.5 * IQR
                    cleaned_df.loc[cleaned_df[column] > Q3 + 1.5 * IQR, column] = Q3 + 1.5 * IQR
            
            report['outliers_handled'][column] = {
                'method': method,
                'action': action,
                'count': outliers.sum()
            }
    
    report['final_rows'] = len(cleaned_df)
    report['final_columns'] = len(cleaned_df.columns)
    report['missing_values_after'] = cleaned_df.isnull().sum().to_dict()
    
    return cleaned_df, report

def generate_cleaning_report(report: Dict[str, Any]) -> str:
    """
    Generate a human-readable summary of the cleaning operations performed.
    """
    summary = []
    
    # Basic statistics
    summary.append(f"Dataset cleaning summary:")
    summary.append(f"- Original size: {report['original_rows']} rows, {report['original_columns']} columns")
    summary.append(f"- Final size: {report['final_rows']} rows, {report['final_columns']} columns")
    
    # Duplicates
    if report['duplicates_removed'] > 0:
        summary.append(f"- Removed {report['duplicates_removed']} duplicate rows")
    
    # Missing values
    missing_before = sum(report['missing_values_before'].values())
    missing_after = sum(report['missing_values_after'].values())
    if missing_before > 0:
        summary.append(f"- Handled {missing_before - missing_after} missing values")
        for column, method in report['missing_values_handled'].items():
            summary.append(f"  * {column}: {method}")
    
    # Outliers
    if report['outliers_handled']:
        summary.append("- Outlier handling:")
        for column, info in report['outliers_handled'].items():
            summary.append(f"  * {column}: {info['count']} outliers {info['action']} using {info['method']} method")
    
    return "\n".join(summary) 