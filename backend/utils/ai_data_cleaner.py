import pandas as pd
import numpy as np
from typing import Dict, Tuple, Any, List, Optional
import os
from sklearn.preprocessing import StandardScaler
import json
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataCleaningRecommendation(BaseModel):
    """Recommendations for data cleaning from AI"""
    column_name: str = Field(description="Name of the column")
    data_type: str = Field(description="Data type of the column")
    missing_values: Dict[str, Any] = Field(description="Missing values recommendations")
    outliers: Dict[str, Any] = Field(description="Outlier recommendations")
    value_transformations: Optional[List[str]] = Field(description="Suggested value transformations")
    column_importance: int = Field(description="Importance score of column (1-10)")
    reasoning: str = Field(description="Reasoning behind recommendations")

class DatasetRecommendation(BaseModel):
    """Overall dataset recommendations"""
    duplicate_removal: bool = Field(description="Whether to remove duplicates")
    column_recommendations: List[DataCleaningRecommendation] = Field(description="Recommendations for each column")
    overall_advice: str = Field(description="General advice for the dataset")

class DataAuditLog(BaseModel):
    """Audit log entry for tracking data cleaning operations"""
    timestamp: str = Field(description="Time of operation")
    operation: str = Field(description="Operation performed")
    column: Optional[str] = Field(description="Column affected if applicable")
    details: Dict[str, Any] = Field(description="Operation details")
    rows_affected: Optional[int] = Field(description="Number of rows affected")

def analyze_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyze the dataframe to get basic statistics and metadata
    """
    analysis = {
        'rows': len(df),
        'columns': len(df.columns),
        'column_info': {},
        'missing_values': df.isnull().sum().to_dict(),
        'potential_duplicates': len(df) - len(df.drop_duplicates()),
    }
    
    for column in df.columns:
        col_type = str(df[column].dtype)
        
        # Basic column info
        column_data = {
            'dtype': col_type,
            'missing_values': df[column].isnull().sum(),
            'unique_values': df[column].nunique(),
        }
        
        # Add type-specific statistics
        if np.issubdtype(df[column].dtype, np.number):
            column_data.update({
                'min': float(df[column].min()) if not pd.isna(df[column].min()) else None,
                'max': float(df[column].max()) if not pd.isna(df[column].max()) else None,
                'mean': float(df[column].mean()) if not pd.isna(df[column].mean()) else None,
                'median': float(df[column].median()) if not pd.isna(df[column].median()) else None,
                'std': float(df[column].std()) if not pd.isna(df[column].std()) else None,
            })
            
            # Identify potential outliers using IQR
            if not df[column].isnull().all() and len(df[column].dropna()) > 10:
                Q1 = df[column].quantile(0.25)
                Q3 = df[column].quantile(0.75)
                IQR = Q3 - Q1
                outliers = ((df[column] < (Q1 - 1.5 * IQR)) | (df[column] > (Q3 + 1.5 * IQR))).sum()
                column_data['potential_outliers'] = int(outliers)
                column_data['potential_outliers_percent'] = float(outliers / len(df))
            else:
                column_data['potential_outliers'] = 0
                column_data['potential_outliers_percent'] = 0.0
        
        elif df[column].dtype == 'object' or df[column].dtype == 'string':
            # For string columns
            sample_values = df[column].dropna().sample(min(5, df[column].nunique())).tolist() if df[column].nunique() > 0 else []
            column_data['sample_values'] = sample_values
            
            # Check if string column might be categorical
            if df[column].nunique() <= min(10, len(df) * 0.05):
                column_data['might_be_categorical'] = True
                column_data['categories'] = df[column].value_counts().to_dict()
            else:
                column_data['might_be_categorical'] = False
        
        # Store column analysis
        analysis['column_info'][column] = column_data
    
    return analysis

def detect_ecommerce_domain(df: pd.DataFrame) -> bool:
    """
    Detect if the dataset is likely from e-commerce domain
    """
    # Lowercase column names for easier matching
    columns = [col.lower() for col in df.columns]
    
    # Common e-commerce related column names
    ecommerce_keywords = [
        'product', 'price', 'discount', 'sale', 'order', 'customer',
        'item', 'quantity', 'purchase', 'cart', 'shipping', 'inventory',
        'category', 'sku', 'transaction', 'payment', 'revenue', 'review'
    ]
    
    # Count number of ecommerce-related columns
    ecommerce_column_count = sum(1 for col in columns if any(keyword in col for keyword in ecommerce_keywords))
    
    # If at least 3 columns match ecommerce keywords, consider it an ecommerce dataset
    return ecommerce_column_count >= 3

def apply_ecommerce_rules(df: pd.DataFrame, recommendations: DatasetRecommendation) -> DatasetRecommendation:
    """
    Apply e-commerce specific cleaning rules to the recommendations
    """
    # Identify e-commerce specific columns
    price_columns = [col for col in df.columns if 'price' in col.lower() or 'cost' in col.lower() or 'revenue' in col.lower()]
    quantity_columns = [col for col in df.columns if 'quantity' in col.lower() or 'stock' in col.lower() or 'inventory' in col.lower()]
    date_columns = [col for col in df.columns if 'date' in col.lower() or 'time' in col.lower()]
    id_columns = [col for col in df.columns if 'id' in col.lower() or 'code' in col.lower() or 'sku' in col.lower()]
    
    # Enhance recommendations for each column type
    updated_column_recommendations = []
    
    for rec in recommendations.column_recommendations:
        column = rec.column_name
        
        # Price columns should be positive numbers
        if column in price_columns:
            # Enhance missing value handling for price columns
            rec.missing_values = {
                "method": "median",
                "reason": "For price data, median is typically better than mean to avoid skew from outliers."
            }
            
            # Enhanced outlier detection for price data
            rec.outliers = {
                "method": "iqr",
                "action": "cap",
                "reason": "Cap extreme prices rather than removing them, using IQR to avoid removing legitimate premium products."
            }
            
            # Importance of price columns is high in e-commerce
            rec.column_importance = 9
            rec.reasoning = f"Price column '{column}' is critical for e-commerce analysis. Median imputation for missing values and IQR-based outlier capping preserves data integrity while handling anomalies."
            
            # Add validation transformation
            rec.value_transformations = [
                "Ensure all prices are positive",
                "Round to standard currency precision (2 decimal places)"
            ]
            
        # Quantity columns should be non-negative integers
        elif column in quantity_columns:
            # Quantity columns typically use mode for missing values
            rec.missing_values = {
                "method": "mode",
                "reason": "For quantity data, most common value is typically the best replacement as quantities often have common values (1, 5, 10, etc)."
            }
            
            rec.outliers = {
                "method": "zscore",
                "action": "cap",
                "reason": "Unusually large order quantities should be capped rather than removed to preserve sales data."
            }
            
            rec.column_importance = 8
            rec.reasoning = f"Quantity column '{column}' is essential for inventory and order analysis. Mode imputation for missing values and outlier capping helps preserve order integrity."
            
            rec.value_transformations = [
                "Convert to integer values",
                "Ensure non-negative values",
                "Replace zero quantities with a minimum value if business logic requires"
            ]
            
        # Date columns need format standardization
        elif column in date_columns:
            rec.missing_values = {
                "method": "drop",
                "reason": "Transactions without dates lack critical context and should typically be removed."
            }
            
            # Dates don't typically have outliers in the statistical sense
            rec.outliers = {
                "method": "none",
                "action": "none",
                "reason": "Date fields don't typically have statistical outliers, but rather invalid dates."
            }
            
            rec.column_importance = 9
            rec.reasoning = f"Date column '{column}' is crucial for time-series analysis of e-commerce data. Standardizing dates and removing records with missing dates ensures proper temporal analysis."
            
            rec.value_transformations = [
                "Standardize to ISO format (YYYY-MM-DD)",
                "Remove future dates if they exist",
                "Flag very old dates for review"
            ]
            
        # ID columns should be unique and non-missing
        elif column in id_columns:
            rec.missing_values = {
                "method": "drop",
                "reason": "Records without IDs cannot be uniquely identified and should be removed for data integrity."
            }
            
            rec.outliers = {
                "method": "none",
                "action": "none",
                "reason": "ID fields don't have statistical outliers."
            }
            
            rec.column_importance = 10
            rec.reasoning = f"ID column '{column}' is fundamental for e-commerce data integrity. Ensuring uniqueness and removing records with missing IDs is essential."
            
            rec.value_transformations = [
                "Check ID format consistency",
                "Validate against expected patterns (if SKUs or product codes have a standard format)"
            ]
            
        updated_column_recommendations.append(rec)
    
    # Update recommendations
    recommendations.column_recommendations = updated_column_recommendations
    
    # For e-commerce, duplicates are often problematic but need careful consideration
    recommendations.duplicate_removal = True
    
    # Add domain-specific overall advice
    recommendations.overall_advice += "\n\nE-commerce specific advice: Pay special attention to price and quantity outliers, as they can significantly impact revenue calculations. Consider data validation for product codes/SKUs and ensure order dates are properly formatted for accurate temporal analysis."
    
    return recommendations

def get_ai_cleaning_recommendations(df: pd.DataFrame) -> DatasetRecommendation:
    """
    Use LLM to generate data cleaning recommendations
    """
    try:
        # Analyze dataframe
        analysis = analyze_dataframe(df)
        
        # Detect if this is an e-commerce dataset
        is_ecommerce = detect_ecommerce_domain(df)
        
        # Setup OpenAI client
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key or openai_api_key == "empty-string":
            raise ValueError("OpenAI API key not properly configured")
        
        # Create LLM
        llm = ChatOpenAI(
            model="gpt-3.5-turbo-0125",
            temperature=0,
            api_key=openai_api_key
        )
        
        # Setup output parser
        parser = PydanticOutputParser(pydantic_object=DatasetRecommendation)
        
        # Create prompt template with domain information if detected
        template = """
        You are an expert data scientist providing recommendations for cleaning a dataset.
        
        Here's the analysis of the dataset:
        {analysis}
        """
        
        # Add domain-specific context if detected
        if is_ecommerce:
            template += """
            This appears to be an e-commerce dataset. When making recommendations, consider:
            1. Price columns should be positive and may need special outlier handling
            2. Quantity/inventory columns should be non-negative integers
            3. Order/transaction dates should be standardized
            4. Product IDs and SKUs should be unique and well-formatted
            5. Customer IDs typically should not have missing values
            6. Duplicate order entries may indicate data issues
            """
        
        template += """
        Based on this analysis, provide detailed recommendations for cleaning this dataset.
        Focus on handling missing values, outliers, and whether duplicates should be removed.
        For each column, suggest the best approach based on the data characteristics.
        
        {format_instructions}
        """
        
        prompt = PromptTemplate(
            template=template,
            input_variables=["analysis"],
            partial_variables={"format_instructions": parser.get_format_instructions()}
        )
        
        # Execute chain
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(analysis=json.dumps(analysis, indent=2))
        
        # Parse the output
        recommendations = parser.parse(result)
        
        # Apply domain-specific rules if e-commerce dataset detected
        if is_ecommerce:
            recommendations = apply_ecommerce_rules(df, recommendations)
            
        return recommendations
        
    except Exception as e:
        logger.error(f"Error getting AI recommendations: {str(e)}")
        # Return default recommendations in case of error
        return create_default_recommendations(df)

def create_default_recommendations(df: pd.DataFrame) -> DatasetRecommendation:
    """Create default recommendations if AI recommendations fail"""
    column_recs = []
    
    for column in df.columns:
        # Get column data type
        data_type = str(df[column].dtype)
        
        # Default missing values strategy
        missing_values_strategy = {
            "method": "none",
            "reason": "No AI recommendation available, defaulting to keep as is"
        }
        
        # Default outliers strategy
        outliers_strategy = {
            "method": "none",
            "action": "none",
            "reason": "No AI recommendation available, defaulting to keep as is"
        }
        
        # Create recommendation for this column
        column_rec = DataCleaningRecommendation(
            column_name=column,
            data_type=data_type,
            missing_values=missing_values_strategy,
            outliers=outliers_strategy,
            value_transformations=[],
            column_importance=5,  # Middle importance
            reasoning="Default recommendation due to AI recommendation failure"
        )
        
        column_recs.append(column_rec)
    
    # Create dataset recommendation
    dataset_rec = DatasetRecommendation(
        duplicate_removal=True if len(df) - len(df.drop_duplicates()) > 0 else False,
        column_recommendations=column_recs,
        overall_advice="Default cleaning suggestions. For better recommendations, ensure OpenAI API is properly configured."
    )
    
    return dataset_rec

def apply_ai_recommendations(df: pd.DataFrame, recommendations: DatasetRecommendation) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Apply the AI-generated recommendations to clean the dataset
    """
    # Create a copy of the dataframe
    cleaned_df = df.copy()
    
    # Initialize audit log
    audit_log = []
    
    # Create a report of cleaning actions
    report = {
        'original_rows': len(df),
        'original_columns': len(df.columns),
        'missing_values_before': df.isnull().sum().to_dict(),
        'duplicates_removed': 0,
        'outliers_handled': {},
        'missing_values_handled': {},
        'ai_recommendations': recommendations.dict(),
        'is_ecommerce_dataset': detect_ecommerce_domain(df),
        'audit_log': audit_log
    }
    
    # Handle duplicates if recommended
    if recommendations.duplicate_removal:
        duplicates_before = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates()
        duplicates_removed = duplicates_before - len(cleaned_df)
        report['duplicates_removed'] = duplicates_removed
        
        # Log duplicate removal in audit log
        audit_log.append(
            DataAuditLog(
                timestamp=datetime.now().isoformat(),
                operation="remove_duplicates",
                column=None,
                details={"method": "exact_match"},
                rows_affected=duplicates_removed
            ).dict()
        )
    
    # Apply column-specific recommendations
    for column_rec in recommendations.column_recommendations:
        column = column_rec.column_name
        
        # Only process columns that exist
        if column not in cleaned_df.columns:
            continue
        
        # Handle missing values
        missing_method = column_rec.missing_values.get('method', 'none')
        if missing_method != 'none':
            missing_before = cleaned_df[column].isnull().sum()
            
            if missing_method == 'drop':
                rows_before = len(cleaned_df)
                cleaned_df = cleaned_df.dropna(subset=[column])
                rows_affected = rows_before - len(cleaned_df)
                
                # Log in audit
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="drop_missing_values",
                        column=column,
                        details={"method": missing_method, "reason": column_rec.missing_values.get('reason', '')},
                        rows_affected=rows_affected
                    ).dict()
                )
                
            elif missing_method == 'mean' and np.issubdtype(cleaned_df[column].dtype, np.number):
                mean_value = cleaned_df[column].mean()
                cleaned_df[column] = cleaned_df[column].fillna(mean_value)
                
                # Log in audit
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="fill_missing_values",
                        column=column,
                        details={
                            "method": missing_method, 
                            "fill_value": float(mean_value),
                            "reason": column_rec.missing_values.get('reason', '')
                        },
                        rows_affected=missing_before
                    ).dict()
                )
                
            elif missing_method == 'median' and np.issubdtype(cleaned_df[column].dtype, np.number):
                median_value = cleaned_df[column].median()
                cleaned_df[column] = cleaned_df[column].fillna(median_value)
                
                # Log in audit
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="fill_missing_values",
                        column=column,
                        details={
                            "method": missing_method, 
                            "fill_value": float(median_value),
                            "reason": column_rec.missing_values.get('reason', '')
                        },
                        rows_affected=missing_before
                    ).dict()
                )
                
            elif missing_method == 'mode':
                mode_value = cleaned_df[column].mode()[0] if not cleaned_df[column].mode().empty else None
                if mode_value is not None:
                    cleaned_df[column] = cleaned_df[column].fillna(mode_value)
                    
                    # Convert mode_value to string for JSON serialization if it's not a number
                    mode_value_json = float(mode_value) if isinstance(mode_value, (int, float)) else str(mode_value)
                    
                    # Log in audit
                    audit_log.append(
                        DataAuditLog(
                            timestamp=datetime.now().isoformat(),
                            operation="fill_missing_values",
                            column=column,
                            details={
                                "method": missing_method, 
                                "fill_value": mode_value_json,
                                "reason": column_rec.missing_values.get('reason', '')
                            },
                            rows_affected=missing_before
                        ).dict()
                    )
            
            report['missing_values_handled'][column] = missing_method
        
        # Handle outliers for numeric columns
        outlier_method = column_rec.outliers.get('method', 'none')
        outlier_action = column_rec.outliers.get('action', 'none')
        
        if outlier_method != 'none' and np.issubdtype(cleaned_df[column].dtype, np.number):
            # Detect outliers
            if outlier_method == 'zscore':
                z_scores = np.abs((cleaned_df[column] - cleaned_df[column].mean()) / cleaned_df[column].std())
                outliers = z_scores > 3
            else:  # IQR method
                Q1 = cleaned_df[column].quantile(0.25)
                Q3 = cleaned_df[column].quantile(0.75)
                IQR = Q3 - Q1
                outliers = (cleaned_df[column] < Q1 - 1.5 * IQR) | (cleaned_df[column] > Q3 + 1.5 * IQR)
            
            outlier_count = int(outliers.sum())
            
            # Apply outlier handling
            if outlier_action == 'remove' and outlier_count > 0:
                rows_before = len(cleaned_df)
                cleaned_df = cleaned_df[~outliers]
                rows_removed = rows_before - len(cleaned_df)
                
                # Log in audit
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="remove_outliers",
                        column=column,
                        details={
                            "method": outlier_method, 
                            "threshold": 3 if outlier_method == 'zscore' else 1.5,
                            "reason": column_rec.outliers.get('reason', '')
                        },
                        rows_affected=rows_removed
                    ).dict()
                )
                
            elif outlier_action == 'cap' and outlier_count > 0:
                if outlier_method == 'zscore':
                    mean, std = cleaned_df[column].mean(), cleaned_df[column].std()
                    
                    # Store original values for audit
                    original_values = cleaned_df.loc[outliers, column].copy()
                    
                    # Apply capping
                    cleaned_df.loc[outliers, column] = cleaned_df.loc[outliers, column].apply(
                        lambda x: mean + 3 * std if x > mean else mean - 3 * std
                    )
                    
                    # Log in audit
                    audit_log.append(
                        DataAuditLog(
                            timestamp=datetime.now().isoformat(),
                            operation="cap_outliers",
                            column=column,
                            details={
                                "method": outlier_method, 
                                "threshold": 3,
                                "upper_cap": float(mean + 3 * std),
                                "lower_cap": float(mean - 3 * std),
                                "reason": column_rec.outliers.get('reason', '')
                            },
                            rows_affected=outlier_count
                        ).dict()
                    )
                    
                else:  # IQR method
                    Q1 = cleaned_df[column].quantile(0.25)
                    Q3 = cleaned_df[column].quantile(0.75)
                    IQR = Q3 - Q1
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    
                    # Store original values for audit
                    original_values = cleaned_df.loc[outliers, column].copy()
                    
                    # Apply capping
                    cleaned_df.loc[cleaned_df[column] < lower_bound, column] = lower_bound
                    cleaned_df.loc[cleaned_df[column] > upper_bound, column] = upper_bound
                    
                    # Log in audit
                    audit_log.append(
                        DataAuditLog(
                            timestamp=datetime.now().isoformat(),
                            operation="cap_outliers",
                            column=column,
                            details={
                                "method": outlier_method, 
                                "threshold": 1.5,
                                "upper_cap": float(upper_bound),
                                "lower_cap": float(lower_bound),
                                "reason": column_rec.outliers.get('reason', '')
                            },
                            rows_affected=outlier_count
                        ).dict()
                    )
            
            report['outliers_handled'][column] = {
                'method': outlier_method,
                'action': outlier_action,
                'count': outlier_count
            }
        
        # Apply value transformations if they exist
        transformations = column_rec.value_transformations
        if transformations:
            # E-commerce specific transformations
            if "Ensure all prices are positive" in transformations and cleaned_df[column].min() < 0:
                negative_count = (cleaned_df[column] < 0).sum()
                cleaned_df.loc[cleaned_df[column] < 0, column] = 0
                
                # Log transformation
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="value_transformation",
                        column=column,
                        details={"transformation": "ensure_positive_values"},
                        rows_affected=negative_count
                    ).dict()
                )
                
            if "Round to standard currency precision (2 decimal places)" in transformations:
                cleaned_df[column] = cleaned_df[column].round(2)
                
                # Log transformation
                audit_log.append(
                    DataAuditLog(
                        timestamp=datetime.now().isoformat(),
                        operation="value_transformation",
                        column=column,
                        details={"transformation": "round_to_currency_precision", "decimal_places": 2},
                        rows_affected=len(cleaned_df)
                    ).dict()
                )
                
            if "Convert to integer values" in transformations:
                try:
                    non_integer_count = (~cleaned_df[column].apply(lambda x: float(x).is_integer())).sum()
                    cleaned_df[column] = cleaned_df[column].fillna(0).astype(int)
                    
                    # Log transformation
                    audit_log.append(
                        DataAuditLog(
                            timestamp=datetime.now().isoformat(),
                            operation="value_transformation",
                            column=column,
                            details={"transformation": "convert_to_integer"},
                            rows_affected=non_integer_count
                        ).dict()
                    )
                except Exception as e:
                    logger.error(f"Error converting column {column} to integer: {str(e)}")
    
    # Final dataset stats
    report['final_rows'] = len(cleaned_df)
    report['final_columns'] = len(cleaned_df.columns)
    report['missing_values_after'] = cleaned_df.isnull().sum().to_dict()
    
    return cleaned_df, report

def ai_clean_dataset(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Main function to clean dataset using AI recommendations
    """
    # Get AI recommendations
    recommendations = get_ai_cleaning_recommendations(df)
    
    # Apply recommendations
    cleaned_df, report = apply_ai_recommendations(df, recommendations)
    
    return cleaned_df, report 