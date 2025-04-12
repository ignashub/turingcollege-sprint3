# Data Cleaning Web Application

A full-stack web application for automated data cleaning and analysis, built with Next.js, Flask, and PrimeReact.

## Project Structure

```
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
```

## Features

- File upload (.csv and .xlsx)
- Automated data cleaning
  - Missing value detection and handling
  - Outlier detection
  - Duplicate removal
- Interactive data table view
- Download cleaned datasets
- Data cleaning summary reports

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

4. Start the Flask server:
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
  - LangChain (optional)

## Security Considerations

- File upload validation
- Size limits
- File type verification
- Error handling 