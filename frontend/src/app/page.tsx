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
import { uploadFile, cleanData, downloadFile } from '@/services/api';
import { DataInfo, CleaningOptions, CleaningReport } from '@/types';
import { Tooltip } from 'primereact/tooltip';
import { Card } from 'primereact/card';
import axios from 'axios';
import { API_BASE_URL } from '@/services/api';


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
      
      // Send request to backend with LangChain agent mode
      const response = await axios.post(`${API_BASE_URL}/clean`, {
        filename: filename,
        cleaning_options: {
          use_agent: true,
          get_recommendations_only: false
        }
      });
      
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

  // Render dialogs
  const renderCleaningDialog = () => {
    if (!dataInfo) return null;

    return (
      <Dialog
        header={
          <>
            Data Cleaning Options
            <span id="data-cleaning-info" className="ml-2">
              <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
            </span>
            <Tooltip target="#data-cleaning-info" position="right" showDelay={150}>
              <div className="p-2" style={{ maxWidth: '300px' }}>
                <p className="m-0">{dataCleaningDescription}</p>
                <p className="mt-2 mb-0">Our AI agent will analyze your dataset and apply intelligent cleaning strategies tailored to your dataset.</p>
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
              label="Clean Data with LangChain Agent" 
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
            <h3 className="m-0">LangChain Agentic Data Cleaning</h3>
          </div>
          <p>Our intelligent agent uses LangChain to analyze your dataset and apply the most appropriate cleaning strategies.</p>
          
          <div className="grid mt-4">
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-ban text-blue-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Missing Values</h4>
                </div>
                <p className="text-sm">Detects and handles missing values using statistical methods best suited for your data type.</p>
                <div className="p-2 bg-blue-50 border-round text-sm mt-2">
                  Includes mean, median, mode imputation and intelligent row removal.
                </div>
              </Card>
            </div>
            
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-exclamation-triangle text-orange-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Outliers</h4>
                </div>
                <p className="text-sm">Identifies and handles outliers using Z-score and IQR methods with appropriate thresholds.</p>
                <div className="p-2 bg-orange-50 border-round text-sm mt-2">
                  Can remove or cap outliers based on data characteristics.
                </div>
              </Card>
            </div>
            
            <div className="col-12 md:col-6 lg:col-3">
              <Card className="h-full shadow-1">
                <div className="flex align-items-center mb-3">
                  <i className="pi pi-copy text-green-500 mr-2" style={{ fontSize: '1.2rem' }}></i>
                  <h4 className="m-0">Duplicates</h4>
                </div>
                <p className="text-sm">Detects and removes duplicate rows to ensure data integrity and accuracy.</p>
                <div className="p-2 bg-green-50 border-round text-sm mt-2">
                  Preserves original data while eliminating redundancy.
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
            <Button label="Close" icon="pi pi-times" onClick={() => setShowReportDialog(false)} className="p-button-text" />
            {cleanedFilename && (
              <Button label="Download Cleaned Data" icon="pi pi-download" onClick={handleDownloadCleanedData} className="p-button-success" />
            )}
          </div>
        }
      >
        {cleaningReport ? (
          <div>
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
              </div>
            )}
            
            {cleaningReport.audit_log && cleaningReport.audit_log.length > 0 && (
              <div className="p-3 mb-4 border-round shadow-2 bg-yellow-50">
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center">
                    <i className="pi pi-history text-yellow-700 mr-2" style={{ fontSize: '1.5rem' }}></i>
                    <h3 className="m-0 text-yellow-700">Data Cleaning Audit Log</h3>
                  </div>
                  <span className="p-badge p-badge-info">{cleaningReport.audit_log.length} operations</span>
                </div>
                <div className="p-2 bg-white border-round" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <ul className="list-none p-0 m-0">
                    {cleaningReport.audit_log.map((entry, index) => (
                      <li key={index} className="p-2 mb-1 border-bottom-1 border-300">
                        <div className="flex align-items-center justify-content-between">
                          <div>
                            <span className="font-medium">{entry.operation}</span>
                            {entry.column && <span className="ml-2 text-500">on column: <span className="text-primary">{entry.column}</span></span>}
                          </div>
                          <div className="text-sm text-500">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                        </div>
                        {entry.rows_affected && (
                          <div className="text-sm mt-1">
                            Rows affected: <span className="font-medium">{entry.rows_affected}</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            
              <div className="grid">
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3">Dataset Size</h3>
                  <div className="mb-3">
                    <div className="flex justify-content-between align-items-center mb-2">
                      <span>Original Rows:</span>
                      <span className="font-bold">{cleaningReport.original_rows}</span>
                    </div>
                    <div className="flex justify-content-between align-items-center">
                      <span>Final Rows:</span>
                      <span className="font-bold">{cleaningReport.final_rows}</span>
                    </div>
                  </div>
                  
                  {cleaningReport.duplicates_removed > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-content-between align-items-center">
                        <span>Duplicates Removed:</span>
                        <span className="font-bold">{cleaningReport.duplicates_removed}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3 flex align-items-center">
                    <i className="pi pi-ban text-primary mr-2"></i>
                    Missing Values
                    <span id="missing-values-info" className="ml-2">
                      <i className="pi pi-info-circle" style={{ cursor: 'pointer', fontSize: '0.8rem' }}></i>
                  </span>
                  </h3>
                  <Tooltip target="#missing-values-info" position="right" showDelay={150}>
                    {missingValuesDescription}
                  </Tooltip>
                  
                  {cleaningReport.missing_values_handled && 
                    Object.entries(cleaningReport.missing_values_handled).length > 0 ? (
                      <div>
                        <div className="grid">
                          {Object.entries(cleaningReport.missing_values_handled)
                            .filter(([_, details]) => typeof details === 'object' ? (details as any).method !== 'none' : details !== 'none')
                            .map(([column, details]) => (
                              <div key={column} className="col-12 mb-3 border-bottom-1 border-primary-100 pb-2">
                                <div className="font-medium text-primary mb-2">{column}</div>
                                <div className="flex justify-content-between align-items-center mb-1 text-sm">
                                  <span>Method:</span>
                                  <span className="font-bold bg-primary-100 px-2 py-1 border-round">
                                    {typeof details === 'string' ? details : (details as any).method}
                                  </span>
                                </div>
                                {typeof details === 'object' && (details as any).count > 0 && (
                                  <div className="flex justify-content-between align-items-center text-sm">
                                    <span>Values Fixed:</span>
                                    <span className="font-bold">{(details as any).count}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                        
                        {Object.entries(cleaningReport.missing_values_handled)
                          .filter(([_, details]) => typeof details === 'object' ? (details as any).method === 'none' : details === 'none')
                          .length > 0 && (
                            <div className="mt-3 p-2 bg-primary-100 border-round">
                              <p className="m-0 text-sm">
                                <i className="pi pi-info-circle mr-1 text-primary"></i>
                                {Object.entries(cleaningReport.missing_values_handled)
                                  .filter(([_, details]) => typeof details === 'object' ? (details as any).method === 'none' : details === 'none')
                                  .length} columns with missing values were left unchanged.
                              </p>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="flex align-items-center justify-content-center h-full">
                        <div className="text-center">
                          <i className="pi pi-check-circle text-primary" style={{ fontSize: '2rem' }}></i>
                          <p className="mt-2">No missing values needed handling!</p>
                        </div>
                      </div>
                    )
                  }
                </div>
              </div>
              
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3 flex align-items-center">
                    <i className="pi pi-exclamation-triangle text-primary mr-2"></i>
                    Outliers
                    <span id="outliers-info" className="ml-2">
                      <i className="pi pi-info-circle" style={{ cursor: 'pointer', fontSize: '0.8rem' }}></i>
                  </span>
                  </h3>
                  <Tooltip target="#outliers-info" position="right" showDelay={150}>
                    {outliersDescription}
                  </Tooltip>
                  
                  {cleaningReport.outliers_handled && 
                    Object.entries(cleaningReport.outliers_handled).length > 0 ? (
                      <div>
                        {Object.entries(cleaningReport.outliers_handled)
                          .filter(([_, details]) => 
                            typeof details === 'object' && 
                            (details as any).count > 0)
                          .map(([column, details]) => (
                            <div key={column} className="mb-3 border-bottom-1 border-primary-100 pb-2">
                              <div className="font-medium text-primary mb-2">{column}</div>
                              <div className="grid">
                                <div className="col-6">
                                  <div className="text-sm font-bold">Detected:</div>
                                  <div className="text-lg">{typeof details === 'string' ? 0 : (details as any).count}</div>
                                </div>
                                <div className="col-6">
                                  <div className="text-sm font-bold">Method:</div>
                                  <div className="bg-primary-100 px-2 py-1 border-round text-center">
                                    {typeof details === 'string' ? details : (details as any).method}
                                  </div>
                                </div>
                                <div className="col-12 mt-2">
                                  <div className="text-sm font-bold">Action:</div>
                                  <div className="text-sm">
                                    {typeof details === 'object' && (details as any).action === 'remove' 
                                      ? 'Removed from dataset' 
                                      : 'Capped at normal range'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        
                        {Object.entries(cleaningReport.outliers_handled)
                          .filter(([_, details]) => 
                            typeof details === 'object' && 
                            (details as any).count === 0)
                          .length > 0 && (
                            <div className="mt-3 p-2 bg-primary-100 border-round">
                              <p className="m-0 text-sm">
                                <i className="pi pi-info-circle mr-1 text-primary"></i>
                                No outliers were found in {
                                  Object.entries(cleaningReport.outliers_handled)
                                    .filter(([_, details]) => 
                                      typeof details === 'object' && 
                                      (details as any).count === 0)
                                    .length
                                } columns that were checked.
                              </p>
                            </div>
                          )}
                        
                        {Object.entries(cleaningReport.outliers_handled).length === 0 && (
                          <div className="flex align-items-center justify-content-center h-full">
                            <div className="text-center">
                              <i className="pi pi-check-circle text-primary" style={{ fontSize: '2rem' }}></i>
                              <p className="mt-2">No outlier detection was performed!</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex align-items-center justify-content-center h-full">
                        <div className="text-center">
                          <i className="pi pi-check-circle text-primary" style={{ fontSize: '2rem' }}></i>
                          <p className="mt-2">No outlier handling was needed!</p>
                        </div>
                      </div>
                    )
                  }
                </div>
              </div>
            </div>
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

  return (
    <main className="p-4">
      <Toast ref={toastRef} />
      <Tooltip target=".pi-info-circle" position="right" showDelay={150} />
      <Tooltip target="[data-pr-tooltip]" position="right" showDelay={150} />
      
      <div className="card">
        <h1 className="text-2xl font-bold mb-4 text-center">Data Cleaning Tool</h1>
        
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
            
            <div className="grid">
              <div className="col-12 md:col-6 lg:col-3">
                <div className="p-4 border-round shadow-2 bg-primary-50">
                  <div className="flex align-items-center mb-2">
                    <i className="pi pi-table text-primary mr-2" style={{ fontSize: '1.5rem' }}></i>
                    <h3 className="text-lg font-semibold m-0 text-primary">Rows</h3>
              </div>
                  <p className="text-2xl font-bold m-0">{dataInfo.rows}</p>
                </div>
              </div>
              
              <div className="col-12 md:col-6 lg:col-3">
                <div className="p-4 border-round shadow-2 bg-primary-50">
                  <div className="flex align-items-center mb-2">
                    <i className="pi pi-list text-primary mr-2" style={{ fontSize: '1.5rem' }}></i>
                    <h3 className="text-lg font-semibold m-0 text-primary">Columns</h3>
                  </div>
                  <p className="text-2xl font-bold m-0">{dataInfo.columns}</p>
                </div>
              </div>
              
              <div className="col-12 lg:col-6">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <div className="flex align-items-center mb-2">
                    <i className="pi pi-exclamation-circle text-primary mr-2" style={{ fontSize: '1.5rem' }}></i>
                    <h3 className="text-lg font-semibold m-0 text-primary">Missing Values</h3>
                  </div>
                  {Object.keys(dataInfo.missing_values).length > 0 ? (
                    <div className="grid">
                  {Object.entries(dataInfo.missing_values).map(([column, count]) => (
                        <div key={column} className="col-6 md:col-4">
                          <div className="flex align-items-center">
                            <span className="font-medium">{column}:</span>
                            <span className="ml-2 px-2 py-1 bg-primary border-round text-white text-sm">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0">No missing values found</p>
                  )}
                </div>
              </div>
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
    </main>
  );
}
