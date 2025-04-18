# Data Cleaning Web Application

A full-stack web application for automated data cleaning and analysis, built with Next.js, Flask, LangChain, and PrimeReact.

## Project Structure

```bash
.
├── frontend/           # Next.js frontend application
│   ├── src/           # Source files
│   ├── public/        # Static files
│   └── package.json   # Frontend dependencies
│
└── backend/           # Flask backend application
    ├── app.py         # Main Flask application
    ├── requirements.txt # Python dependencies
    └── utils/         # Utility functions
        └── ai_data_cleaner.py # LangChain agentic data cleaning
```

## Features

- File upload (.csv and .xlsx)
- Automated data cleaning
  - Missing value detection and handling
  - Outlier detection
  - Duplicate removal
- **LangChain Agentic Data Cleaning**
  - AI-driven data analysis and cleaning recommendations
  - Domain-specific cleaning strategies (e.g., e-commerce rules)
  - Intelligent value transformations based on data types
  - Comprehensive cleaning audit logs
- Interactive data table view
- Download cleaned datasets
- Data cleaning summary reports

## Agentic Data Cleaning

This application leverages LangChain and OpenAI's GPT models to create an intelligent data cleaning agent that can:

1. **Analyze datasets**: The agent examines the data structure, identifies patterns, and detects potential issues
2. **Generate recommendations**: Based on analysis, the agent suggests appropriate cleaning strategies
3. **Domain awareness**: Recognizes domain-specific datasets (e.g., e-commerce) and applies specialized rules
4. **Automated execution**: Implements cleaning operations with human-readable explanations
5. **Decision tracking**: Maintains an audit log of all operations performed on the data

The agentic components are primarily implemented in the backend using:
- `backend/app.py`: Initializes and runs the LangChain agent
- `backend/utils/ai_data_cleaner.py`: Contains the core AI data cleaning logic

## Setup Instructions

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your_api_key_here  # On Windows: set OPENAI_API_KEY=your_api_key_here
   ```

5. Start the Flask server:
   ```bash
   python app.py
   ```

## Technologies Used

- Frontend:
  - Next.js
  - TypeScript
  - PrimeReact
  - Axios

- Backend:
  - Flask
  - Pandas
  - Openpyxl
  - LangChain (for agentic data cleaning)
  - OpenAI API (for GPT model integration)

## Security Considerations

- File upload validation
- Size limits
- File type verification
- Error handling 
- API key protection 

# Environment Variables

This project uses environment variables for configuration. To set up:

1. Copy the example environment file:
   ```
   cp backend/env.example backend/.env
   ```

2. Edit the `.env` file and add your actual values:
   ```
   # Required for OpenAI-based features
   OPENAI_API_KEY=your-openai-api-key-here
   
   # Additional security (change in production)
   SECRET_KEY=your-secret-key-change-me
   ```

3. Never commit your `.env` file to the repository as it may contain sensitive information. 