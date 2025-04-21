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
from langchain_core.messages import HumanMessage

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
    Use LLM to generate cleaning recommendations for the dataset
    """
    try:
        # Check OpenAI API key
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key or openai_api_key == "empty-string":
            logger.warning("OpenAI API key not configured, using default recommendations")
            return create_default_recommendations(df)
            
        # If dataset is too large, sample it
        sample_df = df if len(df) < 1000 else df.sample(1000, random_state=42)
        
        # Convert any potential problematic numeric types to Python native types
        sample_info = {
            'rows': int(len(df)),
            'columns': int(len(df.columns)),
            'column_names': df.columns.tolist(),
            'sample_data': []
        }
        
        # Handle different column types appropriately
        for col in df.columns:
            col_info = {
                'name': col,
                'dtype': str(df[col].dtype),
                'missing_values': int(df[col].isnull().sum()),
                'unique_values': int(df[col].nunique())
            }
            
            # Add numeric stats if applicable
            if np.issubdtype(df[col].dtype, np.number):
                col_info.update({
                    'min': float(df[col].min()) if not pd.isna(df[col].min()) else None,
                    'max': float(df[col].max()) if not pd.isna(df[col].max()) else None,
                    'mean': float(df[col].mean()) if not pd.isna(df[col].mean()) else None,
                    'median': float(df[col].median()) if not pd.isna(df[col].median()) else None
                })
            
            sample_info['sample_data'].append(col_info)
        
        # Define the prompt template for recommendations
        template = """
        You are an expert data scientist providing recommendations for cleaning a dataset.
        
        Here's the analysis of the dataset:
        {analysis}
        """
        
        # Add domain-specific context if detected
        if detect_ecommerce_domain(df):
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
        
        # Setup OpenAI client
        llm = ChatOpenAI(
            model="gpt-3.5-turbo-0125",
            temperature=0,
            api_key=openai_api_key
        )
        
        # Setup output parser BEFORE using it in the prompt
        parser = PydanticOutputParser(pydantic_object=DatasetRecommendation)
        
        prompt = PromptTemplate(
            template=template,
            input_variables=["analysis"],
            partial_variables={"format_instructions": parser.get_format_instructions()}
        )
        
        # Execute chain
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(analysis=json.dumps(sample_info, indent=2))
        
        # Parse the output
        recommendations = parser.parse(result)
        
        # Apply domain-specific rules if e-commerce dataset detected
        if detect_ecommerce_domain(df):
            recommendations = apply_ecommerce_rules(df, recommendations)
            
        return recommendations
        
    except Exception as e:
        logger.error(f"Error getting AI recommendations: {str(e)}")
        # Return default recommendations in case of error
        return create_default_recommendations(df)

def create_default_recommendations(df: pd.DataFrame) -> DatasetRecommendation:
    """Create default cleaning recommendations based on data characteristics"""
    column_recs = []
    
    for column in df.columns:
        # Get column data type
        data_type = str(df[column].dtype)
        
        # Check if column has missing values
        missing_count = df[column].isnull().sum()
        has_missing = missing_count > 0
        
        # Default strategy - will be updated based on data type
        missing_values_strategy = {
            "method": "none",
            "reason": "No missing values detected" if not has_missing else "Default strategy based on data type"
        }
        
        # Choose appropriate missing value strategy based on data type
        if has_missing:
            if np.issubdtype(df[column].dtype, np.number):
                # For numeric columns, use median (more robust than mean)
                missing_values_strategy = {
                    "method": "median",
                    "reason": "Median is robust to outliers and appropriate for numeric data"
                }
            else:
                # For non-numeric columns, use mode (most common value)
                missing_values_strategy = {
                    "method": "mode",
                    "reason": "Mode (most common value) is appropriate for categorical data"
                }
        
        # Check for outliers in numeric columns
        outliers_strategy = {
            "method": "none",
            "action": "none",
            "reason": "Non-numeric column, no outlier detection needed"
        }
        
        if np.issubdtype(df[column].dtype, np.number) and len(df[column].dropna()) > 5:
            # Detect outliers with Z-score
            if df[column].std() > 0:  # Ensure non-zero standard deviation
                z_scores = np.abs((df[column] - df[column].mean()) / df[column].std())
                outliers = z_scores > 3
                outlier_count = outliers.sum()
                
                if outlier_count > 0:
                    outliers_strategy = {
                        "method": "zscore",
                        "action": "cap",  # Cap rather than remove to preserve data
                        "reason": f"Detected {outlier_count} outliers using Z-score method"
                    }
        
        # Value transformations if needed
        value_transformations = []
        
        # Check for negative values in columns that should be positive
        if np.issubdtype(df[column].dtype, np.number) and df[column].min() < 0:
            # Check if column might represent price, quantity, or other typically positive value
            col_lower = column.lower()
            is_typically_positive = any(kw in col_lower for kw in 
                                         ['price', 'cost', 'amount', 'quantity', 'stock', 'age', 'height', 'weight'])
            
            if is_typically_positive:
                value_transformations.append("Ensure all values are positive")
        
        # Create recommendation for this column
        column_rec = DataCleaningRecommendation(
            column_name=column,
            data_type=data_type,
            missing_values=missing_values_strategy,
            outliers=outliers_strategy,
            value_transformations=value_transformations,
            column_importance=8 if has_missing or outliers_strategy["method"] != "none" else 5,
            reasoning=f"Generated recommendation based on data characteristics for column {column}"
        )
        
        column_recs.append(column_rec)
    
    # Check for duplicates
    duplicate_count = len(df) - len(df.drop_duplicates())
    
    # Create dataset recommendation
    dataset_rec = DatasetRecommendation(
        duplicate_removal=duplicate_count > 0,
        column_recommendations=column_recs,
        overall_advice="Automatic cleaning recommendations based on data analysis. Missing values are handled using median for numeric columns and mode for categorical columns. Outliers are detected with Z-score and capped to maintain data integrity."
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
        
        try:
            # Try to use LangChain for intelligent duplicate identification
            openai_api_key = os.getenv("OPENAI_API_KEY")
            if openai_api_key and openai_api_key != "empty-string":
                # Initialize the LLM
                llm = ChatOpenAI(
                    model="gpt-3.5-turbo-0125",
                    temperature=0,
                    api_key=openai_api_key
                )
                
                # Create a sample of the dataframe for analysis
                sample_size = min(10, len(cleaned_df))
                df_sample = cleaned_df.sample(sample_size) if sample_size > 0 else cleaned_df
                
                # Create a description of the dataframe
                column_descriptions = []
                for col in cleaned_df.columns:
                    col_type = str(cleaned_df[col].dtype)
                    unique_ratio = cleaned_df[col].nunique() / len(cleaned_df) if len(cleaned_df) > 0 else 0
                    column_descriptions.append(f"- {col} (type: {col_type}, uniqueness: {unique_ratio:.2f})")
                    
                column_info = "\n".join(column_descriptions)
                    
                # Create the prompt for the LLM
                prompt_text = f"""
                You are an expert data scientist analyzing a dataset to find the best columns for identifying duplicate records.
                Here are the columns in the dataset with their data types and uniqueness ratio (number of unique values / total rows):
                
                {column_info}
                
                Based on this information, identify which columns should be used together to detect duplicate records.
                Focus on columns that might represent unique identifiers, names, emails, or other fields that would be the same when a record is duplicated.
                
                Return your answer as a comma-separated list of column names, for example: "customer_id, email_address"
                If no columns are suitable, respond with "all_columns".
                ONLY return the comma-separated list, no explanations.
                """
                
                # Get the LLM's response
                response = llm.invoke([HumanMessage(content=prompt_text)])
                response_text = response.content.strip()
                
                # Parse the response to get the columns
                if response_text.lower() == "all_columns":
                    duplicate_subset = None  # Use all columns
                    used_columns = ["all columns"]
                else:
                    # Split by comma and strip whitespace
                    suggested_columns = [col.strip() for col in response_text.split(',')]
                    # Filter to only include columns that exist in the dataframe
                    duplicate_subset = [col for col in suggested_columns if col in cleaned_df.columns]
                    used_columns = duplicate_subset if duplicate_subset else ["all columns"]
                
                # Log what the AI suggested
                logger.info(f"AI suggested using these columns for duplicate detection: {response_text}")
                
                # If the AI didn't find suitable columns, fall back to the scoring method
                if not duplicate_subset:
                    logger.info("Falling back to scoring method for duplicate detection")
                    raise Exception("LLM didn't return usable column names")
            else:
                # No API key, fall back to the scoring method
                raise Exception("OpenAI API key not configured or invalid")
                
        except Exception as e:
            logger.warning(f"Error using LLM for duplicate detection: {str(e)}. Falling back to manual scoring.")
            
            # Fall back to the scoring-based method (retain this as a backup)
            potential_id_columns = []
            
            # Step 1: Analyze each column for uniqueness and naming patterns
            for col in cleaned_df.columns:
                col_lower = col.lower()
                uniqueness_ratio = cleaned_df[col].nunique() / len(cleaned_df) if len(cleaned_df) > 0 else 0
                
                # High uniqueness suggests an identifier (but not 100% unique)
                is_likely_identifier = 0.5 < uniqueness_ratio < 1.0
                
                # Common identifier patterns in column names
                common_id_patterns = ['id', 'code', 'key', 'num', 'number']
                name_patterns = ['name', 'user', 'customer', 'client', 'person']
                contact_patterns = ['email', 'mail', 'phone', 'contact']
                
                # Score the column based on name and uniqueness
                score = 0
                
                # Column appears to be an ID field by name
                if any(pattern in col_lower for pattern in common_id_patterns):
                    score += 5
                
                # Column appears to be a name field
                if any(pattern in col_lower for pattern in name_patterns):
                    score += 3
                
                # Column appears to be a contact field
                if any(pattern in col_lower for pattern in contact_patterns):
                    score += 4
                    
                # Has good uniqueness but not perfect (perfect might be primary key)
                if is_likely_identifier:
                    score += 3
                elif uniqueness_ratio == 1.0:  # Perfect uniqueness - likely primary key
                    score += 6
                elif uniqueness_ratio > 0.8:   # Very high uniqueness
                    score += 4
                
                if score > 0:
                    potential_id_columns.append((col, score))
            
            # Sort columns by score in descending order
            potential_id_columns.sort(key=lambda x: x[1], reverse=True)
            
            # Step 2: Decide on which columns to use for duplicate detection
            duplicate_subset = None
            used_columns = []
            
            if potential_id_columns:
                # If we have clear identifier columns, use them
                high_score_columns = [col for col, score in potential_id_columns if score >= 5]
                if high_score_columns:
                    duplicate_subset = high_score_columns
                    used_columns = high_score_columns
                else:
                    # Use top 2-3 scoring columns if available
                    top_columns = [col for col, _ in potential_id_columns[:min(3, len(potential_id_columns))]]
                    duplicate_subset = top_columns
                    used_columns = top_columns
        
        # Drop duplicates based on chosen subset
        if duplicate_subset:
            cleaned_df = cleaned_df.drop_duplicates(subset=duplicate_subset, keep='first')
        else:
            # Fall back to all columns if no clear identifiers found
            cleaned_df = cleaned_df.drop_duplicates(keep='first')
            used_columns = ["all columns"]
        
        duplicates_removed = duplicates_before - len(cleaned_df)
        report['duplicates_removed'] = duplicates_removed
        
        # Log duplicate removal in audit log
        audit_log.append(
            DataAuditLog(
                timestamp=datetime.now().isoformat(),
                operation="remove_duplicates",
                column=None,
                details={
                    "method": "ai_powered_duplicate_detection", 
                    "columns_used": used_columns,
                    "duplicates_found": duplicates_removed
                },
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
            
            # General transformations for typical positive values
            if "Ensure all values are positive" in transformations:
                negative_count = (cleaned_df[column] < 0).sum()
                if negative_count > 0:
                    cleaned_df.loc[cleaned_df[column] < 0, column] = abs(cleaned_df.loc[cleaned_df[column] < 0, column])
                    
                    # Log transformation
                    audit_log.append(
                        DataAuditLog(
                            timestamp=datetime.now().isoformat(),
                            operation="value_transformation",
                            column=column,
                            details={"transformation": "convert_negative_to_positive"},
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