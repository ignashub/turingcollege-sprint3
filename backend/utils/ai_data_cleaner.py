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

def get_ai_cleaning_recommendations(df: pd.DataFrame) -> DatasetRecommendation:
    """
    Use LLM to generate data cleaning recommendations
    """
    try:
        # Analyze dataframe
        analysis = analyze_dataframe(df)
        
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
        
        # Create prompt template
        template = """
        You are an expert data scientist providing recommendations for cleaning a dataset.
        
        Here's the analysis of the dataset:
        {analysis}
        
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
    
    # Create a report of cleaning actions
    report = {
        'original_rows': len(df),
        'original_columns': len(df.columns),
        'missing_values_before': df.isnull().sum().to_dict(),
        'duplicates_removed': 0,
        'outliers_handled': {},
        'missing_values_handled': {},
        'ai_recommendations': recommendations.dict()
    }
    
    # Handle duplicates if recommended
    if recommendations.duplicate_removal:
        duplicates_before = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates()
        report['duplicates_removed'] = duplicates_before - len(cleaned_df)
    
    # Apply column-specific recommendations
    for column_rec in recommendations.column_recommendations:
        column = column_rec.column_name
        
        # Only process columns that exist
        if column not in cleaned_df.columns:
            continue
        
        # Handle missing values
        missing_method = column_rec.missing_values.get('method', 'none')
        if missing_method != 'none':
            if missing_method == 'drop':
                cleaned_df = cleaned_df.dropna(subset=[column])
            elif missing_method == 'mean' and np.issubdtype(cleaned_df[column].dtype, np.number):
                cleaned_df[column] = cleaned_df[column].fillna(cleaned_df[column].mean())
            elif missing_method == 'median' and np.issubdtype(cleaned_df[column].dtype, np.number):
                cleaned_df[column] = cleaned_df[column].fillna(cleaned_df[column].median())
            elif missing_method == 'mode':
                cleaned_df[column] = cleaned_df[column].fillna(cleaned_df[column].mode()[0] if not cleaned_df[column].mode().empty else None)
            
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
            
            # Apply outlier handling
            if outlier_action == 'remove':
                cleaned_df = cleaned_df[~outliers]
            elif outlier_action == 'cap':
                if outlier_method == 'zscore':
                    mean, std = cleaned_df[column].mean(), cleaned_df[column].std()
                    cleaned_df.loc[outliers, column] = cleaned_df.loc[outliers, column].apply(
                        lambda x: mean + 3 * std if x > mean else mean - 3 * std
                    )
                else:  # IQR method
                    Q1 = cleaned_df[column].quantile(0.25)
                    Q3 = cleaned_df[column].quantile(0.75)
                    IQR = Q3 - Q1
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    cleaned_df.loc[cleaned_df[column] < lower_bound, column] = lower_bound
                    cleaned_df.loc[cleaned_df[column] > upper_bound, column] = upper_bound
            
            report['outliers_handled'][column] = {
                'method': outlier_method,
                'action': outlier_action,
                'count': int(outliers.sum())
            }
    
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