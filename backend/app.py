from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
from werkzeug.utils import secure_filename
import os
from datetime import datetime
import json
import logging
from dotenv import load_dotenv
from utils.ai_data_cleaner import ai_clean_dataset, analyze_dataframe, get_ai_cleaning_recommendations, create_default_recommendations, apply_ai_recommendations
from langchain.agents import initialize_agent, AgentType
from langchain.chains import LLMChain
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.tools import Tool
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
from langgraph.prebuilt import create_react_agent

# Custom JSON encoder to handle NumPy types and other non-serializable objects
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        # Handle NumPy data types
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        
        # Handle pandas data types
        if isinstance(obj, pd.Series):
            return obj.tolist()
        if isinstance(obj, pd.DataFrame):
            return obj.to_dict(orient='records')
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        
        # Handle sets and other iterables
        if isinstance(obj, set):
            return list(obj)
        
        # Handle objects with a to_dict method (like Pydantic models)
        if hasattr(obj, 'to_dict') and callable(getattr(obj, 'to_dict')):
            return obj.to_dict()
            
        # Handle objects with a dict method (like Pydantic models)
        if hasattr(obj, 'dict') and callable(getattr(obj, 'dict')):
            return obj.dict()
            
        # Let the base class default method raise the TypeError
        return super(NumpyEncoder, self).default(obj)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)
# Configure Flask to use the custom JSON encoder
app.json_encoder = NumpyEncoder

# More permissive CORS configuration for debugging
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        "expose_headers": ["Content-Disposition"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'csv', 'xlsx'}
MAX_FILE_SIZE = 32 * 1024 * 1024  # 32MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
app.config['TIMEOUT'] = 120  # 2 minutes

# Create uploads directory if it doesn't exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# LangChain Tool Functions for the Agent
def detect_missing_values(df_path: str) -> Dict[str, Any]:
    """
    Detect missing values in the dataset
    Args:
        df_path: Path to the dataset file
    Returns:
        Dictionary containing missing values per column
    """
    try:
        # Handle string input from LangChain
        if isinstance(df_path, str) and not df_path.endswith(('.csv', '.xlsx')):
            try:
                # Try to access the global filepath from the context
                global filepath
                df_path = filepath
            except:
                # If fails, return an error
                return {"error": "Invalid file path"}
        
        # Load dataframe
        if df_path.endswith('.csv'):
            df = pd.read_csv(df_path)
        else:
            df = pd.read_excel(df_path)
            
        missing_values = df.isnull().sum().to_dict()
        missing_percent = {col: (count/len(df))*100 for col, count in missing_values.items()}
        
        return {
            "total_missing": df.isnull().sum().sum(),
            "columns_with_missing": {k: v for k, v in missing_values.items() if v > 0},
            "missing_percent": {k: round(v, 2) for k, v in missing_percent.items() if v > 0}
        }
    except Exception as e:
        return {"error": str(e)}

def detect_outliers(df_path: str, columns: Optional[List[str]] = None, method: str = "zscore") -> Dict[str, Any]:
    """
    Detect outliers in numeric columns
    Args:
        df_path: Path to the dataset file
        columns: List of columns to check for outliers, if None checks all numeric columns
        method: Outlier detection method ('zscore' or 'iqr')
    Returns:
        Dictionary with outlier information per column
    """
    try:
        # Handle string input from LangChain
        if isinstance(df_path, str) and df_path.strip().startswith('{'):
            try:
                # If input is a JSON string, parse it
                import json
                params = json.loads(df_path)
                if isinstance(params, dict):
                    # Extract parameters if available
                    if 'columns' in params:
                        columns = params['columns']
                    if 'method' in params:
                        method = params['method']
                    # Use the filepath from the agent context
                    df_path = filepath
            except:
                # If parsing fails, continue with original parameters
                pass
                
        # Load dataframe
        if df_path.endswith('.csv'):
            df = pd.read_csv(df_path)
        else:
            df = pd.read_excel(df_path)
            
        # Select numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        
        # Filter columns if specified
        if columns:
            numeric_cols = [col for col in columns if col in numeric_cols]
            
        result = {}
        
        for col in numeric_cols:
            if method == "zscore":
                # Z-score method
                z_scores = np.abs((df[col] - df[col].mean()) / df[col].std())
                outliers = z_scores > 3  # Values beyond 3 std devs
                outlier_count = outliers.sum()
                outlier_percent = (outlier_count / len(df)) * 100
            else:  # IQR method
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                outliers = (df[col] < (Q1 - 1.5 * IQR)) | (df[col] > (Q3 + 1.5 * IQR))
                outlier_count = outliers.sum()
                outlier_percent = (outlier_count / len(df)) * 100
                
            if outlier_count > 0:
                result[col] = {
                    "count": int(outlier_count),
                    "percent": round(outlier_percent, 2),
                    "method": method
                }
                
        return result
    except Exception as e:
        return {"error": str(e)}

def detect_duplicates(df_path: str) -> Dict[str, Any]:
    """
    Detect duplicate rows in the dataset
    Args:
        df_path: Path to the dataset file
    Returns:
        Dictionary with duplicate information
    """
    try:
        # Handle string input from LangChain
        if isinstance(df_path, str) and not df_path.endswith(('.csv', '.xlsx')):
            try:
                # Try to access the global filepath from the context
                global filepath
                df_path = filepath
            except:
                # If fails, return an error
                return {"error": "Invalid file path"}
        
        # Load dataframe
        if df_path.endswith('.csv'):
            df = pd.read_csv(df_path)
        else:
            df = pd.read_excel(df_path)
            
        dup_count = len(df) - len(df.drop_duplicates())
        dup_percent = (dup_count / len(df)) * 100
            
        return {
            "duplicate_rows": int(dup_count),
            "duplicate_percent": round(dup_percent, 2),
            "total_rows": len(df),
            "unique_rows": len(df.drop_duplicates())
        }
    except Exception as e:
        return {"error": str(e)}

def generate_statistics(df_path: str) -> Dict[str, Any]:
    """
    Generate descriptive statistics for the dataset
    Args:
        df_path: Path to the dataset file
    Returns:
        Dictionary with descriptive statistics
    """
    try:
        # Handle string input from LangChain
        if isinstance(df_path, str) and not df_path.endswith(('.csv', '.xlsx')):
            try:
                # Try to access the global filepath from the context
                global filepath
                df_path = filepath
            except:
                # If fails, return an error
                return {"error": "Invalid file path"}
        
        # Load dataframe
        if df_path.endswith('.csv'):
            df = pd.read_csv(df_path)
        else:
            df = pd.read_excel(df_path)
            
        # Basic info
        num_rows = len(df)
        num_cols = len(df.columns)
        
        # Column types
        dtypes = df.dtypes.astype(str).to_dict()
        
        # Numeric column statistics
        numeric_stats = {}
        for col in df.select_dtypes(include=[np.number]).columns:
            numeric_stats[col] = {
                "mean": float(df[col].mean()),
                "median": float(df[col].median()),
                "std": float(df[col].std()),
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "unique_values": int(df[col].nunique())
            }
            
        # Categorical column statistics
        categorical_stats = {}
        for col in df.select_dtypes(include=['object']).columns:
            categorical_stats[col] = {
                "unique_values": int(df[col].nunique()),
                "most_common": df[col].value_counts().index[0] if df[col].nunique() > 0 else None,
                "most_common_count": int(df[col].value_counts().iloc[0]) if df[col].nunique() > 0 else 0
            }
            
        return {
            "rows": num_rows,
            "columns": num_cols,
            "column_types": dtypes,
            "numeric_stats": numeric_stats,
            "categorical_stats": categorical_stats
        }
    except Exception as e:
        return {"error": str(e)}

# Initialize LangChain Agent for data cleaning
def initialize_data_cleaning_agent(filepath):
    """
    Initialize a LangChain agent for data cleaning tasks
    Args:
        filepath: Path to the dataset file to clean
    Returns:
        Initialized LangChain agent
    """
    try:
        # Check OpenAI API key
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key or openai_api_key == "empty-string":
            raise ValueError("OpenAI API key not properly configured")
            
        # Initialize LLM
        llm = ChatOpenAI(
            model="gpt-3.5-turbo-0125",
            temperature=0.1,
            api_key=openai_api_key
        )
        
        # Create a function that captures the filepath in its closure
        def create_tool_function(func_name, filepath):
            def tool_function(input_str=""):
                # Call the appropriate function with the filepath
                if func_name == "detect_missing_values":
                    return detect_missing_values(filepath)
                elif func_name == "detect_outliers":
                    return detect_outliers(filepath)
                elif func_name == "detect_duplicates":
                    return detect_duplicates(filepath)
                elif func_name == "generate_statistics":
                    return generate_statistics(filepath)
                else:
                    return {"error": f"Unknown function: {func_name}"}
            return tool_function
        
        # Define tools with proper function wrappers
        tools = [
            Tool(
                name="DetectMissingValues",
                func=create_tool_function("detect_missing_values", filepath),
                description="Detects missing values in the dataset"
            ),
            Tool(
                name="DetectOutliers",
                func=create_tool_function("detect_outliers", filepath),
                description="Detects outliers in numeric columns using statistical methods"
            ),
            Tool(
                name="DetectDuplicates",
                func=create_tool_function("detect_duplicates", filepath),
                description="Identifies duplicate rows in the dataset"
            ),
            Tool(
                name="GenerateStatistics",
                func=create_tool_function("generate_statistics", filepath),
                description="Generates descriptive statistics for the dataset"
            )
        ]
        
        # Initialize agent
        agent = create_react_agent(llm, tools, debug=True)
        
        return agent
    except Exception as e:
        app.logger.error(f"Error initializing agent: {str(e)}")
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        # Check if the request has the 'file' part
        if 'file' not in request.files:
            app.logger.error("No file part in the request")
            app.logger.debug(f"Request headers: {request.headers}")
            app.logger.debug(f"Request form: {request.form}")
            app.logger.debug(f"Request files: {request.files}")
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            app.logger.error("Empty filename submitted")
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            app.logger.error(f"File type not allowed: {file.filename}")
            return jsonify({'error': f'File type not allowed. Please use one of: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # Ensure upload directory exists
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        saved_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], saved_filename)
        
        app.logger.info(f"Saving file to {filepath}")
        file.save(filepath)
        app.logger.info(f"File saved successfully to {filepath}")
        
        # Read the file and get initial data info
        try:
            app.logger.info(f"Processing file {filepath}")
            if filename.endswith('.csv'):
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
            
            # Get basic dataset information
            data_info = {
                'rows': int(len(df)),
                'columns': int(len(df.columns)),
                'column_names': df.columns.tolist(),
                'missing_values': {col: int(val) for col, val in df.isnull().sum().to_dict().items()},
                'file_name': saved_filename
            }
            
            # Include a sample of the data (first 100 rows) for display in the datatable
            sample_data = df.head(100).fillna('').to_dict(orient='records')
            
            # Get AI analysis if OpenAI key is configured
            try:
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if openai_api_key and openai_api_key != "empty-string":
                    # More detailed analysis
                    df_analysis = analyze_dataframe(df)
                    # Convert df_analysis to JSON-serializable dict
                    data_info['detailed_analysis'] = json.loads(json.dumps(df_analysis, cls=NumpyEncoder))
                    
                    # Initialize and run the LangChain agent for initial analysis
                    agent = initialize_data_cleaning_agent(filepath)
                    if agent:
                        agent_analysis = agent.invoke(
                            "Analyze this dataset and provide comprehensive recommendations for cleaning. "
                            "Focus on detecting missing values, outliers, and duplicates."
                        )
                        data_info['agent_analysis'] = agent_analysis
                    
                    # Try to get AI recommendations
                    ai_recommendations = get_ai_cleaning_recommendations(df)
                    # Convert Pydantic model to dict and ensure it's JSON-serializable
                    ai_recommendations_dict = ai_recommendations.dict()
                    data_info['ai_recommendations'] = json.loads(json.dumps(ai_recommendations_dict, cls=NumpyEncoder))
            except Exception as ai_error:
                app.logger.warning(f"AI analysis failed, but will continue with basic analysis: {str(ai_error)}")
            
            app.logger.info(f"File processed successfully: {saved_filename}")
            try:
                return jsonify({
                    'message': 'File uploaded successfully',
                    'data_info': data_info,
                    'data': sample_data
                }), 200
            except TypeError as json_error:
                app.logger.error(f"JSON serialization error: {str(json_error)}")
                # Convert data_info to a fully serializable format
            return jsonify({
                'message': 'File uploaded successfully',
                    'data_info': json.loads(json.dumps(data_info, cls=NumpyEncoder)),
                    'data': json.loads(json.dumps(sample_data, cls=NumpyEncoder))
            }), 200
        except Exception as e:
            app.logger.error(f"Error processing file: {str(e)}")
            return jsonify({'error': f'Error processing file: {str(e)}'}), 500
            
    except Exception as e:
        app.logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/clean', methods=['POST'])
def clean_data():
    try:
        data = request.json
        filename = data.get('filename')
        cleaning_options = data.get('cleaning_options', {})
        
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        # Read the file
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
        
        # Check if OpenAI API is configured
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key or openai_api_key == "empty-string":
            app.logger.warning("OpenAI API key not configured, will use default recommendations")
        
        # Log the cleaning options for debugging
        app.logger.info(f"Received cleaning options: {json.dumps(cleaning_options, indent=2)}")
        
        # Clean using AI with LangChain
        app.logger.info("Using AI-based cleaning")
        
        try:
            # First try with LangChain agent for suggestions
            agent_suggestions = ""
            try:
                agent = initialize_data_cleaning_agent(filepath)
                if agent:
                    agent_suggestions = agent.invoke(
                        "Analyze this dataset and provide comprehensive recommendations for cleaning. "
                        "Focus on detecting missing values, outliers, and duplicates. "
                        "Suggest specific methods for each column based on data characteristics."
                    )
                    app.logger.info("Agent analysis completed successfully")
                else:
                    agent_suggestions = "Failed to initialize LangChain agent, proceeding with basic cleaning"
                    app.logger.warning(agent_suggestions)
            except Exception as agent_error:
                app.logger.warning(f"Agent analysis failed, but continuing with cleaning: {str(agent_error)}")
                agent_suggestions = f"Agent analysis unavailable. Error: {str(agent_error)}"
            
            # Try the AI cleaning function which includes recommendations and application
            try:
                # Directly call the ai_clean_dataset function
                cleaned_df, report = ai_clean_dataset(df)
                app.logger.info(f"AI cleaning completed with {len(report.get('audit_log', []))} operations")
                
                # If no cleaning was actually performed, use the fallback basic cleaning
                if len(report.get('audit_log', [])) == 0:
                    app.logger.warning("AI cleaning didn't perform any operations, falling back to basic cleaning")
                    raise Exception("No cleaning operations performed")
                    
            except Exception as e:
                app.logger.warning(f"AI cleaning failed: {str(e)}. Falling back to basic cleaning")
                
                # Create basic recommendations
                recommendations = create_default_recommendations(df)
                cleaned_df, report = apply_ai_recommendations(df, recommendations)
                app.logger.info(f"Basic cleaning completed with {len(report.get('audit_log', []))} operations")
            
            # Add agent suggestions to the report
            report['agent_suggestions'] = agent_suggestions
            
        except Exception as ai_error:
            app.logger.error(f"All cleaning methods failed: {str(ai_error)}", exc_info=True)
            return jsonify({'error': f'Data cleaning failed: {str(ai_error)}'}), 500
        
        # Save cleaned dataset
        cleaned_filename = f"cleaned_{filename}"
        cleaned_filepath = os.path.join(app.config['UPLOAD_FOLDER'], cleaned_filename)
        
        if filename.endswith('.csv'):
            cleaned_df.to_csv(cleaned_filepath, index=False)
        else:
            cleaned_df.to_excel(cleaned_filepath, index=False)
        
        # Add human-readable report
        report['human_readable'] = (
            f"AI cleaning completed successfully.\n\n"
            f"Dataset Summary:\n"
            f"- Original rows: {report.get('original_rows', 0)}\n"
            f"- Final rows: {report.get('final_rows', 0)}\n"
            f"- Duplicates removed: {report.get('duplicates_removed', 0)}\n\n"
            f"The AI agent analyzed your data and automatically applied appropriate cleaning methods "
            f"based on the characteristics of each column."
        )
        
        try:
            # Use our custom NumpyEncoder to handle serialization issues
            return jsonify({
                'message': 'Data cleaned successfully',
                'report': json.loads(json.dumps(report, cls=NumpyEncoder)),
                'cleaned_filename': cleaned_filename
            }), 200
        except TypeError as json_error:
            app.logger.error(f"JSON serialization error in clean_data: {str(json_error)}")
            # Make another attempt with manual conversion of problematic types
            simplified_report = {
                'original_rows': int(report.get('original_rows', 0)),
                'final_rows': int(report.get('final_rows', 0)),
                'duplicates_removed': int(report.get('duplicates_removed', 0)),
                'human_readable': report.get('human_readable', ''),
                'agent_suggestions': report.get('agent_suggestions', '')
            }
            
            # Add the audit log if it exists
            if 'audit_log' in report:
                simplified_report['audit_log'] = report['audit_log']
                
            return jsonify({
                'message': 'Data cleaned successfully',
                'report': simplified_report,
                'cleaned_filename': cleaned_filename
            }), 200
        
    except Exception as e:
        app.logger.error(f"Error in clean_data: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/set-api-key', methods=['POST'])
def set_api_key():
    try:
        data = request.json
        api_key = data.get('api_key')
        
        if not api_key:
            return jsonify({'error': 'No API key provided'}), 400
        
        # Validate API key format (basic check)
        if not api_key.startswith('sk-') or len(api_key) < 20:
            return jsonify({'error': 'Invalid API key format'}), 400
        
        # Store the API key in the session
        # Note: This will only persist for the current session
        # and won't modify the .env file
        os.environ["OPENAI_API_KEY"] = api_key
        app.logger.info("Custom API key set for this session")
        
        return jsonify({
            'status': 'success',
            'message': 'API key set successfully for this session'
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error setting API key: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Log application startup
    app.logger.info("Starting Flask application on port 8000")
    app.run(debug=True, port=8000) 