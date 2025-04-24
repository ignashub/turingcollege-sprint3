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
- Web interface for OpenAI API key setup

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

4. Start the Flask server:
   ```bash
   python app.py
   ```

## OpenAI API Key Setup

You can set up your OpenAI API key in two ways:

1. **Through the web interface** (Recommended):
   - After launching the application, click on the "Settings" button
   - Enter your OpenAI API key in the provided field
   - Click "Save" to store the API key for the current session

2. **Using environment variables**:
   ```bash
   export OPENAI_API_KEY=your_api_key_here  # On Windows: set OPENAI_API_KEY=your_api_key_here
   ```

## Testing the Application

The repository includes a sample e-commerce dataset for testing purposes:

1. Launch the application (both frontend and backend)
2. Upload the `ecomm_data.csv` file from the root directory
3. The application should automatically detect it as an e-commerce dataset
4. You can experiment with:
   - Viewing the AI recommendations 
   - Running automated data cleaning
   - Visualizing the data before and after cleaning
   - Downloading the cleaned dataset

The sample dataset includes common data issues like:
- Missing values
- Duplicated records
- Outlier values
- Negative numbers in fields that should be positive
- Age values outside reasonable ranges

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
   # Optional: OpenAI API key can also be set through the web interface
   OPENAI_API_KEY=your-openai-api-key-here
   
   # Additional security (change in production)
   SECRET_KEY=your-secret-key-change-me
   ```

3. Never commit your `.env` file to the repository as it may contain sensitive information. 

# Feeback

It was third project review with Ignas in the course and again he demonstrated solid understanding on the topic, so we had very productive and insightful conversation. I would split my feedback on two parts: front-end and the back-end. Since front-end is very intuitive and clear as well as minimalistic and easy to use, backend has some areas which may require additional consideration and/or improvements, such as:
- As Ignas decided to use React agent (which was really good solution), there is no clear information about the workflow this kind of agent perform with the application. The README file and/or UI should provide clear guidelines for the end user to get know how (which principles will be applied) the input data will be applied once I click Submit.
- Some calculated vales are misleading and seems incorrect (as we noticed during the review - Outliers). To improve that, I strongly recommend to enrich the initial prompts for different task and tool with expected ranges, limitations and requirements. We clearly discussed that during the project review.
- There is no any information about data input limitation. What would happen if I upload&submit 100MB of file? Where is the limit? That would be very useful and important information for the end user.
- Also, as we have discussed it would be worth to user decide which transformations should be accepted and which ones not, or - what is the outlier sensitivity, missing values strategy should be applied. That is why AI agent is being decided the correct tool and made it’s job, but parameters which would decide HOW specific function should be executed can be slightly controlled by the end user (think about human in the loop).
All in all, the well though UI made this application very user friendly and would bring real value in case the key points mentioned above would be fixed. Ignas was able to explain all the details and positively reflected to all the advices and tips we brainstormed. Appreciate that. It was very good idea to display a full detailed log window after data transformations that AI did - it made entire application very transparent and clear.
So, congratulation with another great achievement and good luck in next activities in the course!

# Task

Task Requirements
The exact task requirements are as follows:

Core Requirements:

Agentic system for data processing:

Implement at least three features (five is our recommendation) from this list for the dataset cleaning pipeline using agents (LangChain/LangGraph):
Missing Value Handling: Implement strategies to detect and handle missing values. This could include options to impute missing values with mean, median, or mode, or to drop rows/columns with missing values.
Outlier Detection and Removal: Use statistical methods to identify and flag, remove or replace outliers in the dataset.
Duplicate Removal: Implement functionality to detect and remove duplicate rows from the dataset.
Data Transformation: Implement functionality to transform data types, normalize data, and apply conversions like converting from categorical data to numerical values or ensuring consistent data formats.
Data Validation: Implement validation checks to ensure data integrity and consistency. This could include checking for valid data ranges, ensuring data types match expected formats, and verifying that data adheres to predefined rules or constraints.
Data Aggregation & Statistics: Aggregate data based on specific criteria like grouping data by certain columns, calculating summary statistics, and generating aggregated views of the dataset.
Data Visualization: Implement data visualization features to visualize the dataset: charts, graphs, and plots to visualize data distributions, trends, and patterns.
Data Auditing: Implement functionality to track changes made to the dataset during the cleaning process. Example: maintain a log of actions taken.
Function Calling:

Implement at least 3 distinct function calls.
Functions should be tailored to dataset cleaning tasks.
Examples: data validation, anomaly detection, data transformation.
Domain Specialization:

Select a specific domain or use case (e.g., e-commerce, education, healthcare).
Implement domain-specific data cleaning rules and responses.
Incorporate security measures for your domain.
Technical Implementation:

Use LangChain or LangGraph for the agentic system.
Ensure robust error handling mechanisms.
Validate user inputs rigorously.
Manage API keys securily.
We recommend LangChain for whose who are feeling less comfortable with agents as a good starting point. If you feel more comfortable with agent topic, use LangGraph, as you can build more complex applications with it

User Interface:

Design a user-friendly interface using Streamlit or Next.js.
Provide contextual information and data sources.
Display results of function calls clearly.
Include indicators for long-running operations.
File Upload and Downloadable Output:

Enable users to upload CSV files.
Make sure users can download the cleaned dataset.
Security

Make sure your app is secure: validate user input, store API keys securely, and prevent the general misuse of the app.
Optional Tasks
After the main functionality is implemented and your code works correctly, and you feel that you want to upgrade your project, choose various improvements from this list. The list is sorted by difficulty levels.

Caution: Some of the tasks in medium or hard categories may contain tasks with concepts or libraries that may be introduced in later sections or even require outside knowledge/time to research outside of the course.

Easy:

Ask ChatGPT to critique your solution from the usability, security, and prompt-engineering sides.
Give the agent a personality—tweak responses to make them more formal, friendly, or concise based on user needs.
Provide the user with the ability to choose from a list of LLMs (Gemini, OpenAI, etc.) for this project.
Add all of the OpenAI settings (temperature, top-5 frequency) for the user to tune as sliders/fields.
Add a feature to allow users to preview the dataset before and after cleaning.
Add an interactive help feature or chatbot guide.
Medium:

Calculate and display token usage and costs.
Add retry logic for agents.
Implement long-term or short-term memory in LangChain/LangGraph.
Implement one more function tool that would call an external API.
Add user authentication and personalization.
Implement a caching mechanism to store and retrieve frequently used responses.
Implement a feedback loop where users can rate the responses, and use this feedback to improve the agent's performance.
Implement 2 extra function tools (5 in total). Have a UI for the user to either enable or disable these function tools. Develop a plugin system that allows users to add or remove functionalities from the chatbot dynamically.
Implement multi-model support (OpenAI, Anthropic, etc.).
Hard:

Agentic RAG: Think of a way to add RAG functionality to the LangChain/LangGraph application and implement it.

Add one off these LLM observability tools: Arize Pheonix, LangSmith, Lunary, or others.

Make your solution scalable, meaning that you can clean large CSV files: 500MB or even in the GB range.

Fine-tune the model for your specific domain.

Create an agent that can learn from user feedback on the cleaned dataset. This agent should be able to adjust its cleaning strategies based on the feedback to improve future performance.

Implement an agent that can integrate with external data sources to enrich the dataset. This could involve fetching additional data from APIs or databases.

Implement an agent that can collaborate with other agents in a distributed system. This agent should be able to work with agents running on different machines or in different environments, coordinating their efforts to clean the dataset efficiently.

Deploy your app to the cloud with proper scaling.