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
from utils.data_cleaner import clean_dataset, generate_cleaning_report
from utils.ai_data_cleaner import ai_clean_dataset, analyze_dataframe, get_ai_cleaning_recommendations

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
    r"/api/*": {
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

@app.route('/api/upload', methods=['POST'])
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
            
            # Get AI analysis if OpenAI key is configured
            try:
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if openai_api_key and openai_api_key != "empty-string":
                    # More detailed analysis
                    df_analysis = analyze_dataframe(df)
                    # Convert df_analysis to JSON-serializable dict
                    data_info['detailed_analysis'] = json.loads(json.dumps(df_analysis, cls=NumpyEncoder))
                    
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
                    'data_info': data_info
                }), 200
            except TypeError as json_error:
                app.logger.error(f"JSON serialization error: {str(json_error)}")
                # Convert data_info to a fully serializable format
                return jsonify({
                    'message': 'File uploaded successfully',
                    'data_info': json.loads(json.dumps(data_info, cls=NumpyEncoder))
                }), 200
        except Exception as e:
            app.logger.error(f"Error processing file: {str(e)}")
            return jsonify({'error': f'Error processing file: {str(e)}'}), 500
            
    except Exception as e:
        app.logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/clean', methods=['POST'])
def clean_data():
    try:
        data = request.json
        filename = data.get('filename')
        cleaning_options = data.get('cleaning_options', {})
        use_ai = data.get('use_ai', False)
        
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
        
        # Choose cleaning method: AI-based or manual
        if use_ai:
            app.logger.info("Using AI-based cleaning")
            try:
                # Check if OpenAI API is configured
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if not openai_api_key or openai_api_key == "empty-string":
                    return jsonify({'error': 'OpenAI API key not configured for AI cleaning'}), 400
                
                # Clean using AI
                cleaned_df, report = ai_clean_dataset(df)
            except Exception as ai_error:
                app.logger.error(f"AI cleaning failed: {str(ai_error)}")
                return jsonify({'error': f'AI cleaning failed: {str(ai_error)}'}), 500
        else:
            # Clean using manual options
            app.logger.info("Using manual cleaning with options")
            cleaned_df, report = clean_dataset(df, cleaning_options)
        
        # Save cleaned dataset
        cleaned_filename = f"cleaned_{filename}"
        cleaned_filepath = os.path.join(app.config['UPLOAD_FOLDER'], cleaned_filename)
        
        if filename.endswith('.csv'):
            cleaned_df.to_csv(cleaned_filepath, index=False)
        else:
            cleaned_df.to_excel(cleaned_filepath, index=False)
        
        # Generate human-readable report in addition to JSON data
        report['human_readable'] = generate_cleaning_report(report)
        
        try:
            return jsonify({
                'message': 'Data cleaned successfully',
                'report': report,
                'cleaned_filename': cleaned_filename
            }), 200
        except TypeError as json_error:
            app.logger.error(f"JSON serialization error in clean_data: {str(json_error)}")
            # Use our custom JSON encoder to handle all types
            return jsonify({
                'message': 'Data cleaned successfully',
                'report': json.loads(json.dumps(report, cls=NumpyEncoder)),
                'cleaned_filename': cleaned_filename
            }), 200
        
    except Exception as e:
        app.logger.error(f"Error in clean_data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai-recommendations', methods=['POST'])
def get_ai_recommendations():
    try:
        data = request.json
        filename = data.get('filename')
        
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        # Check if OpenAI API is configured
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key or openai_api_key == "empty-string":
            return jsonify({'error': 'OpenAI API key not configured'}), 400
        
        # Read the file
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
        
        # Get AI recommendations
        recommendations = get_ai_cleaning_recommendations(df)
        # Convert Pydantic model to dict and ensure it's JSON-serializable
        recommendations_dict = recommendations.dict()
        serialized_recommendations = json.loads(json.dumps(recommendations_dict, cls=NumpyEncoder))
        
        return jsonify({
            'message': 'AI recommendations generated successfully',
            'recommendations': serialized_recommendations
        }), 200
            
    except Exception as e:
        app.logger.error(f"Error getting AI recommendations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<filename>', methods=['GET'])
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

if __name__ == '__main__':
    # Log application startup
    app.logger.info("Starting Flask application on port 8000")
    app.run(debug=True, port=8000) 