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

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)
# More permissive CORS configuration for debugging
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", 
                   "http://localhost:3003", "http://localhost:3004", "http://localhost:3005", 
                   "http://localhost:3006", "http://localhost:3007", "http://localhost:3008"],
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
                'rows': len(df),
                'columns': len(df.columns),
                'column_names': df.columns.tolist(),
                'missing_values': df.isnull().sum().to_dict(),
                'file_name': saved_filename
            }
            
            app.logger.info(f"File processed successfully: {saved_filename}")
            return jsonify({
                'message': 'File uploaded successfully',
                'data_info': data_info
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
        
        # Clean the dataset
        cleaned_df, report = clean_dataset(df, cleaning_options)
        
        # Save cleaned dataset
        cleaned_filename = f"cleaned_{filename}"
        cleaned_filepath = os.path.join(app.config['UPLOAD_FOLDER'], cleaned_filename)
        
        if filename.endswith('.csv'):
            cleaned_df.to_csv(cleaned_filepath, index=False)
        else:
            cleaned_df.to_excel(cleaned_filepath, index=False)
        
        return jsonify({
            'message': 'Data cleaned successfully',
            'report': report,
            'cleaned_filename': cleaned_filename
        }), 200
        
    except Exception as e:
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

@app.route('/api/test', methods=['GET'])
def test_connection():
    return jsonify({
        'status': 'success',
        'message': 'Server is running and CORS is configured correctly',
        'env': os.getenv('FLASK_ENV', 'development')
    })

if __name__ == '__main__':
    # Log application startup
    app.logger.info("Starting Flask application on port 8000")
    app.run(debug=True, port=8000) 