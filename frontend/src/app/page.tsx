'use client';

import { useState, useRef, useEffect } from 'react';
import { FileUpload } from 'primereact/fileupload';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { ProgressBar } from 'primereact/progressbar';
import { ProgressSpinner } from 'primereact/progressspinner';
import { uploadFile, cleanData, downloadFile, setApiKey } from '@/services/api';
import { DataInfo, CleaningOptions, CleaningReport } from '@/types';
import { Tooltip } from 'primereact/tooltip';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import axios from 'axios';
import { API_BASE_URL } from '@/services/api';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { TabView, TabPanel } from 'primereact/tabview';
import { Chart } from 'primereact/chart';


const dataCleaningDescription = "Data cleaning helps improve your data quality by removing errors, duplicates, and handling missing values. Clean data leads to more accurate analysis results!";
const missingValuesDescription = "Missing values are empty cells in your data. They can affect analysis results if not handled properly. Choose a method below to deal with them.";
const outliersDescription = "Outliers are extreme values that differ significantly from other observations. They can skew your analysis results if not addressed.";

// Define types for AI recommendations
type ColumnRecommendation = {
  missing_value_strategy: string;
  outlier_strategy: string;
  recommendation?: string;
};

type AIRecommendation = {
  explanation: string;
  general_advice: string;
  should_remove_duplicates: boolean;
  column_recommendations: Record<string, ColumnRecommendation>;
};

export default function Home() {
  // State variables
  const [dataInfo, setDataInfo] = useState<DataInfo | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCleaningDialog, setShowCleaningDialog] = useState(false);
  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>({
    missing_values: {},
    outliers: {},
    remove_duplicates: false,
  });
  const [cleaningReport, setCleaningReport] = useState<CleaningReport | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiRecommendations, setAIRecommendations] = useState<AIRecommendation | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [cleanedFilename, setCleanedFilename] = useState<string | null>('');
  const [isCleaningData, setIsCleaningData] = useState(false);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(true);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [apiKey, setApiKeyState] = useState('');
  const toastRef = useRef<Toast>(null);

  // Initialize cleaning options when dataInfo changes
  useEffect(() => {
    if (dataInfo) {
      const newMissingValues: CleaningOptions['missing_values'] = {};
      const newOutliers: CleaningOptions['outliers'] = {};
      
      dataInfo.column_names.forEach(column => {
        newMissingValues[column] = { method: 'none' };
        newOutliers[column] = { method: 'zscore', enabled: false, threshold: 3 };
      });
      
      setCleaningOptions(prev => ({
        ...prev,
        missing_values: newMissingValues,
        outliers: newOutliers
      }));
    }
  }, [dataInfo]);

  // File upload handler
  const handleUploadFile = async (file: File) => {
    try {
      setLoading(true);
      
      // Upload file to backend
      const response = await uploadFile(file);
      
      // Update file info state
      setSelectedFile(file);
      
      // Set data info for cleaned file
      setDataInfo(response.data_info);
      
      // Set the sample data returned from the backend
      if (response.data && Array.isArray(response.data)) {
        setData(response.data);
        console.log('Data loaded:', response.data.length, 'rows');
      } else {
        console.warn('No data received from backend or data is not an array');
        setData([]);
      }
      
      setLoading(false);
      
      // Show toast for successful upload
      toastRef.current?.show({
        severity: 'success', 
        summary: 'File Uploaded', 
        detail: `${file.name} has been uploaded and analyzed.`,
        life: 3000
      });
      
      // Reset states for a new file upload
      setCleaningReport(null);
      setCleanedFilename(null);
      setAIRecommendations(null);
      
      // Initialize cleaning options with default values
      const newMissingValues: CleaningOptions['missing_values'] = {};
      
      if (response.data_info.column_names) {
        response.data_info.column_names.forEach((column: string) => {
          newMissingValues[column] = { method: 'none' };
        });
      }
      
      setCleaningOptions({
        missing_values: newMissingValues,
        outliers: {},
        remove_duplicates: true
      });
      
      // Show cleaning dialog
      setShowCleaningDialog(true);
      
      console.log('Data info:', response.data_info);
      
    } catch (error) {
      setLoading(false);
      console.error('Error uploading file:', error);
      
      toastRef.current?.show({
        severity: 'error', 
        summary: 'Upload Failed', 
        detail: 'Failed to upload and analyze the file.'
      });
    }
  };

  // Clean data with LangChain Agent
  const handleDataCleaning = async () => {
    if (!selectedFile) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Please upload a file first'
      });
      return;
    }
    
    try {
      setIsCleaningData(true);
      
      // Get the filename from dataInfo
      const filename = dataInfo?.file_name;
      
      if (!filename) {
        throw new Error('Filename not found');
      }
      
      // Create a simple configuration that lets the AI handle all cleaning decisions
      const cleaningConfiguration = {
        filename: filename,
        cleaning_options: {
          // Tell the backend to use pure AI-driven cleaning
          use_ai_only: true
        }
      };
      
      console.log('Requesting AI-driven cleaning');
      
      // Send request to backend with minimal options to let AI do the work
      const response = await axios.post(`${API_BASE_URL}/clean`, cleaningConfiguration);
      
      // Handle successful response
      const data = response.data;
      setCleaningReport(data.report);
      setCleanedFilename(data.cleaned_filename);
      setShowReportDialog(true);
      
      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Data cleaning completed successfully'
      });
    } catch (error: any) {
      console.error('Error cleaning data:', error);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: error.response?.data?.error || 'Failed to clean data'
      });
    } finally {
      setIsCleaningData(false);
      setShowCleaningDialog(false);
    }
  };

  // Handle API key submission
  const handleApiKeySubmit = async () => {
    try {
      // Call the backend to set the API key
      await setApiKey(apiKey);
      
      toastRef.current?.show({
        severity: 'success',
        summary: 'API Key Set',
        detail: 'Your OpenAI API key has been set successfully',
        life: 3000
      });
      
      setShowApiKeyDialog(false);
    } catch (error) {
      console.error('Error setting API key:', error);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to set the API key. Please try again.',
        life: 5000
      });
    }
  };

  // Continue from welcome dialog to API key dialog
  const handleWelcomeContinue = () => {
    setShowWelcomeDialog(false);
    setShowApiKeyDialog(true);
  };

  // Skip API key dialog and use the default key from .env
  const handleSkipApiKey = () => {
    setShowApiKeyDialog(false);
    toastRef.current?.show({
      severity: 'info',
      summary: 'Using Default API Key',
      detail: 'The application will use the default API key',
      life: 3000
    });
  };

  // Render dialogs
  const renderCleaningDialog = () => {
    if (!dataInfo) return null;

    return (
      <Dialog
        header={
          <>
            Data Cleaning with AI
            <span id="data-cleaning-info" className="ml-2">
              <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
            </span>
            <Tooltip target="#data-cleaning-info" position="right" showDelay={150}>
              <div className="p-2" style={{ maxWidth: '300px' }}>
                <p className="m-0">{dataCleaningDescription}</p>
                <p className="mt-2 mb-0">Our AI agent will analyze your dataset and automatically apply the most appropriate cleaning strategies.</p>
              </div>
            </Tooltip>
          </>
        }
        visible={showCleaningDialog}
        onHide={() => setShowCleaningDialog(false)}
        style={{ width: '80vw', maxWidth: '1200px' }}
        footer={
          <div className="flex justify-content-end gap-2">
            <Button 
              label="Cancel" 
              icon="pi pi-times" 
              onClick={() => setShowCleaningDialog(false)} 
              className="p-button-danger" 
            />
            <Button 
              label="Clean Data with AI" 
              icon="pi pi-bolt" 
              onClick={handleDataCleaning} 
              loading={isCleaningData} 
              className="p-button-primary" 
            />
          </div>
        }
      >
        <div className="p-4 border-round shadow-2 bg-primary-50 mb-4">
          <div className="flex align-items-center mb-3">
            <i className="pi pi-bolt text-primary mr-2" style={{ fontSize: '1.5rem' }}></i>
            <h3 className="m-0">Fully Automated AI Data Cleaning</h3>
          </div>
          <p>Our intelligent AI system will analyze your dataset and automatically apply the most appropriate cleaning strategies without any manual configuration needed.</p>
          
          <div className="grid mt-4">
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-ban text-blue-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Missing Values</h4>
                </div>
                <p className="text-sm">AI will automatically detect missing values and apply the optimal strategy for each column based on data type and distribution.</p>
                <div className="p-2 bg-blue-50 border-round text-sm mt-2">
                  The AI selects from strategies like mean, median, mode, or intelligent row removal.
                </div>
              </Card>
            </div>
            
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-exclamation-triangle text-orange-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Outliers</h4>
                </div>
                <p className="text-sm">AI will intelligently identify outliers using statistical methods appropriate for your specific data distribution.</p>
                <div className="p-2 bg-orange-50 border-round text-sm mt-2">
                  The system chooses between Z-score, IQR, or domain-specific approaches automatically.
                </div>
              </Card>
            </div>
            
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-copy text-green-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Duplicates</h4>
                </div>
                <p className="text-sm">AI will detect and remove exact and near-duplicate rows based on intelligent pattern recognition.</p>
                <div className="p-2 bg-green-50 border-round text-sm mt-2">
                  Preserves data integrity while eliminating redundancy.
                </div>
              </Card>
            </div>
            
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-shopping-cart text-purple-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Domain Intelligence</h4>
                </div>
                <p className="text-sm">Applies specialized rules for e-commerce datasets with price, quantity and transaction data.</p>
                <div className="p-2 bg-purple-50 border-round text-sm mt-2">
                  Automatically detects your domain and applies relevant rules.
                </div>
              </Card>
            </div>
          </div>
          
          <div className="mt-4 p-3 border-round bg-white">
            <h4 className="mt-0 mb-2">Agentic Cleaning Process:</h4>
            <ol className="m-0 pl-4">
              <li className="mb-2">The LangChain agent will analyze your dataset structure</li>
              <li className="mb-2">Domain-specific patterns will be detected and appropriate rules applied</li>
              <li className="mb-2">Missing values, outliers, and duplicates will be handled with optimal strategies</li>
              <li className="mb-2">Data types will be transformed and validated as needed</li>
              <li>A comprehensive audit log will track all changes made to your data</li>
            </ol>
          </div>
        </div>
        
        {cleaningReport && (
          <div className="mt-4 p-3 border-round bg-primary-50">
            <h4 className="mt-0 mb-2 text-primary">Previous Cleaning Report</h4>
            <p>Your data has already been cleaned. You can view the detailed report or clean again.</p>
            <Button 
              label="View Report" 
              icon="pi pi-file" 
              onClick={() => setShowReportDialog(true)} 
              className="p-button-outlined p-button-info mt-2" 
            />
          </div>
        )}
      </Dialog>
    );
  };

  const renderReportDialog = () => {
    return (
      <Dialog
        visible={showReportDialog}
        style={{ width: '80vw', maxWidth: '1200px' }}
        header="Data Cleaning Report"
        modal
        className="p-fluid"
        onHide={() => setShowReportDialog(false)}
        footer={
          <div className="flex justify-content-end gap-2">
            <Button label="Close" icon="pi pi-times" onClick={() => setShowReportDialog(false)} className="p-button-danger" />
            {cleanedFilename && (
              <Button label="Download Cleaned Data" icon="pi pi-download" onClick={handleDownloadCleanedData} className="p-button-success" />
            )}
          </div>
        }
      >
        {cleaningReport ? (
          <div>
            <TabView>
              <TabPanel header="Cleaning Results">
                {cleaningReport.human_readable && (
                  <div className="p-4 border-round shadow-2 bg-primary-50 mb-4">
                    <h3 className="mt-0 mb-3 text-primary">
                      <i className="pi pi-check-circle mr-2"></i>
                      Cleaning Results
                    </h3>
                    <div className="whitespace-pre-line text-lg">
                      {cleaningReport.human_readable.split('\n').map((line, index) => (
                        <p key={index} className={`mb-2 ${line.startsWith('Dataset') ? 'text-xl font-bold text-primary' : ''}`}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                
                {cleaningReport.is_ecommerce_dataset && (
                  <div className="p-3 mb-4 border-round shadow-2 bg-blue-50">
                    <div className="flex align-items-center mb-2">
                      <i className="pi pi-shopping-cart text-blue-700 mr-2" style={{ fontSize: '1.5rem' }}></i>
                      <h3 className="m-0 text-blue-700">E-commerce Domain Detected</h3>
                    </div>
                    <p>Our LangChain agent detected this dataset is from the e-commerce domain and applied specialized data cleaning rules:</p>
                    <ul className="mt-2 mb-2">
                      <li>Price columns: Used median for imputation and capped outliers to preserve premium product data</li>
                      <li>Quantity columns: Converted to integers and used mode imputation to maintain data integrity</li>
                      <li>Date columns: Standardized formats and validated values</li>
                      <li>ID columns: Ensured uniqueness and proper formatting</li>
                    </ul>
                  </div>
                )}
                
                {cleaningReport.agent_suggestions && (
                  <div className="p-3 mb-4 border-round shadow-2 bg-green-50">
                    <div className="flex align-items-center mb-2">
                      <i className="pi pi-bolt text-green-700 mr-2" style={{ fontSize: '1.5rem' }}></i>
                      <h3 className="m-0 text-green-700">LangChain Agent Analysis</h3>
                    </div>
                    <p className="p-2 bg-white border-round">{cleaningReport.agent_suggestions}</p>
                    
                    {/* Add detailed AI thought process with expansion panel */}
                    <div className="mt-3">
                      <Accordion>
                        <AccordionTab header="View AI Thought Process">
                          <div className="p-3 bg-white border-round">
                            <h4 className="mt-0 mb-3 text-green-700">AI Processing Steps</h4>
                            <ol className="m-0 pl-4">
                              <li className="mb-3">
                                <strong>Step 1: Detect Missing Values</strong>
                                <div className="ml-3 mt-1 p-2 bg-blue-50 border-round">
                                  {Object.keys(cleaningReport.missing_values_before || {}).length > 0 ? (
                                    <ul className="m-0 pl-4">
                                      {Object.entries(cleaningReport.missing_values_before || {})
                                        .filter(([_, count]) => count > 0)
                                        .map(([col, count]) => (
                                        <li key={col}><strong>{col}</strong>: {count} missing values</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="m-0">No missing values found</p>
                                  )}
                                </div>
                              </li>
                              
                              <li className="mb-3">
                                <strong>Step 2: Detect Outliers</strong>
                                <div className="ml-3 mt-1 p-2 bg-orange-50 border-round">
                                  {Object.keys(cleaningReport.outliers_handled || {}).length > 0 ? (
                                    <ul className="m-0 pl-4">
                                      {Object.entries(cleaningReport.outliers_handled || {})
                                        .map(([col, details]) => (
                                        <li key={col}>
                                          <strong>{col}</strong>: 
                                          {typeof details === 'object' ? 
                                            ` ${(details as any).count || 0} outliers detected using ${(details as any).method || 'unknown'} method` : 
                                            ' No outliers detected'}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="m-0">No outliers detected</p>
                                  )}
                                </div>
                              </li>
                              
                              <li className="mb-3">
                                <strong>Step 3: Check for Duplicates</strong>
                                <div className="ml-3 mt-1 p-2 bg-green-50 border-round">
                                  {cleaningReport.duplicates_removed > 0 ? (
                                    <p className="m-0">Found and removed {cleaningReport.duplicates_removed} duplicate rows</p>
                                  ) : (
                                    <p className="m-0">No duplicate rows found</p>
                                  )}
                                </div>
                              </li>
                            </ol>
                          </div>
                        </AccordionTab>
                      </Accordion>
                    </div>
                  </div>
                )}
                
                <div className="col-12 mb-4">
                  <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                    <h3 className="mt-0 mb-3 flex align-items-center">
                      <i className="pi pi-check-circle text-primary mr-2"></i>
                      Cleaning Summary
                    </h3>
                    
                    <div className="p-3 bg-white border-round mb-3">
                      <h4 className="mt-0 mb-2">Detected Issues</h4>
                      <div className="grid">
                        <div className="col-12 md:col-4">
                          <div className="p-3 border-round bg-blue-50 mb-2">
                            <div className="flex align-items-center justify-content-between">
                              <div className="font-medium text-blue-800">Missing Values</div>
                            </div>
                            <div className="text-sm mt-2">
                              {Object.entries(dataInfo.missing_values)
                                .filter(([_, count]) => Number(count) > 0).length > 0 
                                  ? `Found in ${Object.entries(dataInfo.missing_values)
                                      .filter(([_, count]) => Number(count) > 0).length} columns` 
                                  : 'No missing values detected'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-12 md:col-4">
                          <div className="p-3 border-round bg-orange-50 mb-2">
                            <div className="flex align-items-center justify-content-between">
                              <div className="font-medium text-orange-800">Outliers</div>
                            </div>
                            <div className="text-sm mt-2">
                              {Object.values(cleaningReport.outliers_handled || {}).some(
                                v => typeof v === 'object' && (v as any).count > 0
                              ) 
                                ? `${Object.values(cleaningReport.outliers_handled || {})
                                    .reduce((a, v) => a + (typeof v === 'object' ? (v as any).count || 0 : 0), 0)} values identified as outliers`
                                : 'No outliers detected'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-12 md:col-4">
                          <div className="p-3 border-round bg-green-50 mb-2">
                            <div className="flex align-items-center justify-content-between">
                              <div className="font-medium text-green-800">Duplicates</div>
                            </div>
                            <div className="text-sm mt-2">
                              {cleaningReport.duplicates_removed > 0 
                                ? `${cleaningReport.duplicates_removed} duplicate rows removed` 
                                : 'No duplicate rows found'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-white border-round">
                      <h4 className="mt-0 mb-2">Actions Performed</h4>
                      <div className="text-sm">
                        {(() => {
                          // Create a safe reference to the audit log
                          const auditLog = cleaningReport?.audit_log || [];
                          return auditLog.length > 0 ? (
                            <ul className="m-0 pl-4">
                              {Array.from(new Set(auditLog.map(entry => entry.operation))).map(operation => (
                                <li key={operation} className="mb-1">{operation}: 
                                  <span className="ml-2 font-bold">
                                    {auditLog.filter(entry => entry.operation === operation).length} actions
                  </span>
                              </li>
                            ))}
                            </ul>
                          ) : (
                            <div className="p-2 border-round bg-yellow-50">
                              <i className="pi pi-exclamation-triangle mr-2 text-yellow-600"></i>
                              <span className="text-yellow-600">No cleaning actions were performed. This may be due to an error with the AI recommendations.</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </TabPanel>
              
              <TabPanel header="Data Visualization">
                <div className="p-4 border-round shadow-2 bg-primary-50 mb-4">
                  <h3 className="mt-0 mb-3 text-primary">
                    <i className="pi pi-chart-bar mr-2"></i>
                    Data Visualization
                  </h3>
                  
                  <div className="grid">
                    <div className="col-12 md:col-6 mb-4">
                      <div className="p-3 bg-white border-round shadow-1">
                        <h4 className="mt-0 mb-3">Missing Values by Column</h4>
                        {renderMissingValuesChart()}
                      </div>
                    </div>
                    
                    <div className="col-12 md:col-6 mb-4">
                      <div className="p-3 bg-white border-round shadow-1">
                        <h4 className="mt-0 mb-3">Outliers Detected</h4>
                        {renderOutliersChart()}
                      </div>
                    </div>
                    
                    <div className="col-12 md:col-6 mb-4">
                      <div className="p-3 bg-white border-round shadow-1">
                        <h4 className="mt-0 mb-3">Rows Before vs After Cleaning</h4>
                        {renderRowsComparisonChart()}
                      </div>
                    </div>
                  </div>
                </div>
              </TabPanel>
              
              <TabPanel header="Audit Log">
                <div className="p-4 border-round shadow-2 bg-primary-50 mb-4">
                  <h3 className="mt-0 mb-3 text-primary">
                    <i className="pi pi-history mr-2"></i>
                    Data Cleaning Audit Log
                  </h3>
                  
                  <div className="p-3 bg-white border-round">
                    <div className="mb-3">
                      <div className="flex justify-content-between align-items-center">
                        <h4 className="m-0">Operations Performed</h4>
                        <span style={{ color: 'black' }}>{cleaningReport?.audit_log?.length || 0} operations</span>
                      </div>
                    </div>
                    
                    <div className="p-datatable">
                      <div className="p-datatable-wrapper" style={{maxHeight: '400px', overflowY: 'auto'}}>
                        <table className="p-datatable-table">
                          <thead className="p-datatable-thead">
                            <tr>
                              <th style={{width: '180px'}}>Timestamp</th>
                              <th style={{width: '150px'}}>Operation</th>
                              <th style={{width: '150px'}}>Column</th>
                              <th>Details</th>
                              <th style={{width: '120px'}}>Rows Affected</th>
                            </tr>
                          </thead>
                          <tbody className="p-datatable-tbody">
                            {cleaningReport?.audit_log?.map((entry, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'p-datatable-even' : 'p-datatable-odd'}>
                                <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                <td>
                                  <span className="p-tag p-tag-rounded" style={{
                                    backgroundColor: getOperationColor(entry.operation)
                                  }}>
                                    {entry.operation}
                                  </span>
                                </td>
                                <td>{entry.column || 'N/A'}</td>
                                <td>
                                  {entry.details && (
                                    <div>
                                      {entry.details.method && <div><strong>Method:</strong> {entry.details.method}</div>}
                                      {entry.details.fill_value !== undefined && <div><strong>Fill value:</strong> {entry.details.fill_value}</div>}
                                      {entry.details.reason && <div><strong>Reason:</strong> {entry.details.reason}</div>}
                                      {entry.details.upper_cap !== undefined && <div><strong>Upper cap:</strong> {entry.details.upper_cap}</div>}
                                      {entry.details.lower_cap !== undefined && <div><strong>Lower cap:</strong> {entry.details.lower_cap}</div>}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {entry.rows_affected ? (
                                    <span>{entry.rows_affected}</span>
                                  ) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </TabPanel>
            </TabView>
          </div>
        ) : (
          <div className="flex justify-content-center">
            <ProgressSpinner style={{ width: '50px', height: '50px' }} />
          </div>
        )}
      </Dialog>
    );
  };

  const handleDownloadCleanedData = () => {
    window.open(`${API_BASE_URL}/download/${cleanedFilename}`, '_blank');
  };

  // Welcome dialog
  const renderWelcomeDialog = () => {
    return (
      <Dialog
        header="Welcome to Data Cleaning Assistant"
        visible={showWelcomeDialog}
        style={{ width: '80%', maxWidth: '800px' }}
        onHide={() => setShowWelcomeDialog(false)}
        footer={
          <div className="flex justify-content-end">
            <Button label="Continue" icon="pi pi-arrow-right" onClick={handleWelcomeContinue} />
          </div>
        }
      >
        <div className="p-4">
          <h2 className="text-xl mb-4">What is this application?</h2>
          <p className="mb-4">
            This Data Cleaning Assistant helps you prepare your datasets for analysis by:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">Finding and handling missing values in your data</li>
            <li className="mb-2">Detecting and removing outliers that might skew your results</li>
            <li className="mb-2">Identifying and removing duplicate records</li>
            <li className="mb-2">Using AI to provide cleaning recommendations specific to your dataset</li>
          </ul>
          <p className="mb-4">
            Simply upload your CSV or Excel file, and the application will analyze it and help you clean it efficiently.
            The AI-powered assistant will provide recommendations tailored to your specific dataset.
          </p>
          <div className="bg-blue-50 p-4 border-round">
            <h3 className="text-lg mb-2">Why clean your data?</h3>
            <p>
              Clean data leads to more accurate analysis, better insights, and more reliable machine learning models.
              This tool simplifies the data cleaning process, saving you time and improving your results.
            </p>
          </div>
        </div>
      </Dialog>
    );
  };

  // API key dialog
  const renderApiKeyDialog = () => {
    return (
      <Dialog
        header="Set Your OpenAI API Key"
        visible={showApiKeyDialog}
        style={{ width: '80%', maxWidth: '600px' }}
        onHide={() => setShowApiKeyDialog(false)}
        footer={
          <div className="flex justify-content-between">
            <Button label="Skip (Use Default)" className="p-button-text" onClick={handleSkipApiKey} />
            <Button label="Set API Key" icon="pi pi-check" onClick={handleApiKeySubmit} disabled={!apiKey} />
          </div>
        }
      >
        <div className="p-4">
          <p className="mb-4">
            This application uses OpenAI's GPT models to analyze and clean your data.
            Provide your own API key for the best performance and to avoid using the shared key.
          </p>
          <div className="bg-yellow-50 p-3 border-round mb-4">
            <p>
              <i className="pi pi-info-circle mr-2"></i>
              Your API key will only be used for this session and will not be stored permanently.
            </p>
          </div>
          <div className="field">
            <label htmlFor="apiKey" className="block mb-2">OpenAI API Key</label>
            <InputText
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              className="w-full"
              placeholder="sk-..."
              type="password"
            />
            <small className="block mt-1">
              You can get an API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI's website</a>
            </small>
          </div>
        </div>
      </Dialog>
    );
  };

  // Welcome content to be shown when no file is uploaded
  const renderWelcomeContent = () => {
    if (dataInfo) return null;
    
    return (
      <Card className="mb-4">
        <div className="p-4">
          <h2 className="text-xl mb-4">Welcome to the Data Cleaning Assistant</h2>
          <p className="mb-4">
            This tool helps you prepare your datasets for analysis by cleaning and transforming your data.
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">Upload CSV or Excel files</li>
            <li className="mb-2">Clean missing values and outliers</li>
            <li className="mb-2">Remove duplicate records</li>
            <li className="mb-2">Get AI-powered recommendations</li>
          </ul>
          <div className="bg-blue-50 p-3 border-round">
            <p>
              <i className="pi pi-info-circle mr-2"></i>
              Get started by uploading a CSV or Excel file using the upload button below.
            </p>
          </div>
        </div>
      </Card>
    );
  };

  // Helper function for the audit log
  const getOperationColor = (operation) => {
    const colorMap = {
      'fill_missing_values': '#3B82F6', // blue
      'cap_outliers': '#F59E0B',       // amber
      'remove_duplicates': '#10B981',  // emerald
      'value_transformation': '#8B5CF6', // violet
      'remove_rows': '#EF4444'         // red
    };
    return colorMap[operation] || '#6B7280'; // gray as default
  };

  // Chart rendering functions
  const renderMissingValuesChart = () => {
    if (!cleaningReport || !dataInfo) return <p>No data available</p>;
    
    const missingValues = dataInfo.missing_values;
    const columnsWithMissing = Object.entries(missingValues)
      .filter(([_, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1])); // Sort by count (descending)
    
    if (columnsWithMissing.length === 0) return <p>No missing values detected</p>;
    
    const chartData = {
      labels: columnsWithMissing.map(([col]) => col),
      datasets: [
        {
          label: 'Missing Values',
          data: columnsWithMissing.map(([_, count]) => Number(count)),
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgb(255, 99, 132)',
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Count'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Column'
          }
        }
      }
    };
    
    return <Chart type="bar" data={chartData} options={options} />;
  };

  const renderOutliersChart = () => {
    if (!cleaningReport || !cleaningReport.outliers_handled) return <p>No data available</p>;
    
    const outliers = cleaningReport.outliers_handled;
    const columnsWithOutliers = Object.entries(outliers)
      .filter(([_, details]) => typeof details === 'object' && (details as any).count > 0)
      .map(([col, details]) => ({
        column: col,
        count: (details as any).count,
        method: (details as any).method
      }))
      .sort((a, b) => b.count - a.count); // Sort by count (descending)
    
    if (columnsWithOutliers.length === 0) return <p>No outliers detected</p>;
    
    const chartData = {
      labels: columnsWithOutliers.map(item => item.column),
      datasets: [
        {
          label: 'Outliers Detected',
          data: columnsWithOutliers.map(item => item.count),
          backgroundColor: 'rgba(255, 159, 64, 0.5)',
          borderColor: 'rgb(255, 159, 64)',
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Count'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Column'
          }
        }
      }
    };
    
    return <Chart type="bar" data={chartData} options={options} />;
  };

  const renderRowsComparisonChart = () => {
    if (!cleaningReport) return <p>No data available</p>;
    
    const originalRows = cleaningReport.original_rows || 0;
    const finalRows = cleaningReport.final_rows || 0;
    const duplicatesRemoved = cleaningReport.duplicates_removed || 0;
    
    const chartData = {
      labels: ['Original Rows', 'Duplicates Removed', 'Final Rows'],
      datasets: [
        {
          label: 'Row Count',
          data: [originalRows, duplicatesRemoved, finalRows],
          backgroundColor: [
            'rgba(54, 162, 235, 0.5)',
            'rgba(255, 99, 132, 0.5)',
            'rgba(75, 192, 192, 0.5)'
          ],
          borderColor: [
            'rgb(54, 162, 235)',
            'rgb(255, 99, 132)',
            'rgb(75, 192, 192)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Count'
          }
        }
      }
    };
    
    return <Chart type="bar" data={chartData} options={options} />;
  };

  return (
    <div className="container mx-auto p-4">
      <Toast ref={toastRef} />
      <Tooltip target=".pi-info-circle" position="right" showDelay={150} />
      <Tooltip target="[data-pr-tooltip]" position="right" showDelay={150} />
      {renderWelcomeDialog()}
      {renderApiKeyDialog()}
      
      <div className="card">
        <div className="flex justify-content-between align-items-center mb-4">
          <h1 className="text-2xl font-bold m-0">Data Cleaning Assistant</h1>
          <Button 
            label="Change API Key" 
            icon="pi pi-key" 
            className="p-button-outlined p-button-sm"
            onClick={() => setShowApiKeyDialog(true)}
          />
        </div>
        
        {renderWelcomeContent()}
        
        <div className="mb-3 text-center">
          <h2 className="text-xl font-bold mb-2">Step 1: Upload your data file</h2>
          <p className="mb-2">Upload a CSV or Excel file to begin the cleaning process.</p>
        <FileUpload
          mode="basic"
          name="file"
          url="#"
          accept=".csv,.xlsx"
          maxFileSize={10000000}
          chooseLabel="Upload File"
          auto={false}
          onSelect={(e) => handleUploadFile(e.files[0])}
          onError={(e) => {
              toastRef.current?.show({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to upload file',
            });
          }}
        />
        </div>

        {loading && <ProgressBar mode="indeterminate" className="mt-3" />}

        {dataInfo && (
          <div className="mt-4">
            <div className="flex justify-content-between align-items-center mb-3">
              <h2 className="text-xl font-bold">Step 2: Review your data</h2>
              <Button
                label="Step 3: Clean Data"
                icon="pi pi-filter"
                onClick={() => setShowCleaningDialog(true)}
                className="p-button-primary"
              />
            </div>
            
            <DataTable 
              value={data} 
              className="mt-3 shadow-2" 
              paginator 
              rows={10} 
              rowsPerPageOptions={[5, 10, 25, 50]} 
              tableStyle={{ minWidth: '50rem' }}
              emptyMessage="No data found"
              scrollable
              scrollHeight="400px"
              resizableColumns
              columnResizeMode="fit"
            >
              {dataInfo.column_names.map((column) => (
                <Column key={column} field={column} header={column} sortable />
              ))}
            </DataTable>
          </div>
        )}

        {renderCleaningDialog()}
        {renderReportDialog()}
      </div>
    </div>
  );
}
