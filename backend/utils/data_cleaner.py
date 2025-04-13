import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from typing import Dict, Tuple, Any

def detect_outliers(df: pd.DataFrame, column: str, method: str = 'zscore', threshold: float = 3) -> pd.Series:
    """
    Detect outliers in a column using either Z-score or IQR method.
    Returns a boolean series indicating outliers.
    """
    if method == 'zscore':
        z_scores = np.abs((df[column] - df[column].mean()) / df[column].std())
        return z_scores > threshold
    else:  # IQR method
        Q1 = df[column].quantile(0.25)
        Q3 = df[column].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - threshold * IQR
        upper_bound = Q3 + threshold * IQR
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
            if isinstance(method, dict):
                method = method.get('method', 'none')
            
            if method == 'drop':
                cleaned_df = cleaned_df.dropna(subset=[column])
            elif method in ['mean', 'median', 'mode']:
                cleaned_df[column] = handle_missing_values(cleaned_df, column, method)
            
            report['missing_values_handled'][column] = method
    
    # Remove duplicates if requested
    if options.get('remove_duplicates', False):
        duplicates_before = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates()
        report['duplicates_removed'] = duplicates_before - len(cleaned_df)
    
    # Handle outliers
    for column in cleaned_df.select_dtypes(include=[np.number]).columns:
        if column in options.get('outliers', {}) and options['outliers'][column].get('enabled', False):
            method = options['outliers'][column].get('method', 'zscore')
            action = options['outliers'][column].get('action', 'remove')  # Default to 'remove' if action not specified
            threshold = options['outliers'][column].get('threshold', 3)
            
            outliers = detect_outliers(cleaned_df, column, method, threshold)
            if action == 'remove':
                cleaned_df = cleaned_df[~outliers]
            elif action == 'cap':
                if method == 'zscore':
                    z_scores = np.abs((cleaned_df[column] - cleaned_df[column].mean()) / cleaned_df[column].std())
                    cleaned_df.loc[z_scores > threshold, column] = cleaned_df[column].mean() + threshold * cleaned_df[column].std()
                else:  # IQR method
                    Q1 = cleaned_df[column].quantile(0.25)
                    Q3 = cleaned_df[column].quantile(0.75)
                    IQR = Q3 - Q1
                    cleaned_df.loc[cleaned_df[column] < Q1 - threshold * IQR, column] = Q1 - threshold * IQR
                    cleaned_df.loc[cleaned_df[column] > Q3 + threshold * IQR, column] = Q3 + threshold * IQR
            
            report['outliers_handled'][column] = {
                'method': method,
                'action': action,
                'threshold': threshold,
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
    summary.append("Dataset Cleaning Summary")
    summary.append(f"• Your dataset started with {report['original_rows']} rows and {report['original_columns']} columns")
    
    # Calculate changes
    rows_diff = report['original_rows'] - report['final_rows']
    if rows_diff > 0:
        summary.append(f"• {rows_diff} rows were removed during the cleaning process")
    elif report['original_rows'] == report['final_rows']:
        summary.append("• No rows were removed during cleaning")
    
    # Duplicates
    if report['duplicates_removed'] > 0:
        summary.append(f"• Removed {report['duplicates_removed']} duplicate rows to improve data quality")
    
    # Missing values
    missing_before = sum(report['missing_values_before'].values())
    missing_after = sum(report['missing_values_after'].values())
    
    if missing_before > 0:
        if missing_before - missing_after > 0:
            summary.append(f"• Successfully handled {missing_before - missing_after} out of {missing_before} missing values")
        else:
            summary.append(f"• Your dataset had {missing_before} missing values")
        
        # Group by method for better readability
        method_columns = {}
        for column, method_info in report['missing_values_handled'].items():
            method = method_info
            if isinstance(method_info, dict) and 'method' in method_info:
                method = method_info['method']
            
            if method not in method_columns:
                method_columns[method] = []
            method_columns[method].append(column)
        
        # Add better descriptions for methods
        method_descriptions = {
            'none': 'Left as is',
            'mean': 'Filled with average values',
            'median': 'Filled with median values',
            'mode': 'Filled with most common values',
            'drop': 'Rows with missing values were removed'
        }
        
        for method, columns in method_columns.items():
            if method == 'none':
                if len(columns) < 5:  # Only show individual columns if there aren't too many
                    summary.append(f"  • {method_descriptions.get(method, method)}: {', '.join(columns)}")
                else:
                    summary.append(f"  • {method_descriptions.get(method, method)}: {len(columns)} columns")
            else:
                summary.append(f"  • {method_descriptions.get(method, method)}: {', '.join(columns)}")
    
    # Outliers
    if report['outliers_handled']:
        outlier_count = sum(info['count'] for info in report['outliers_handled'].values() if isinstance(info, dict) and 'count' in info)
        if outlier_count > 0:
            summary.append(f"• Detected and handled {outlier_count} outliers across {len(report['outliers_handled'])} columns")
            
            # Group by method and action
            method_action_columns = {}
            for column, info in report['outliers_handled'].items():
                if isinstance(info, dict):
                    key = (info.get('method', 'none'), info.get('action', 'none'))
                    if key not in method_action_columns:
                        method_action_columns[key] = []
                    if info.get('count', 0) > 0:
                        method_action_columns[key].append(f"{column} ({info.get('count', 0)} outliers)")
            
            # Better descriptions
            action_descriptions = {
                'remove': 'removed from dataset',
                'cap': 'capped at normal range'
            }
            
            for (method, action), columns in method_action_columns.items():
                if columns:  # Only include if there were actually outliers
                    summary.append(f"  • Using {method} method: {action_descriptions.get(action, action)}: {', '.join(columns)}")
    
    summary.append(f"• Final dataset has {report['final_rows']} rows and {report['final_columns']} columns")
    
    return "\n".join(summary) 