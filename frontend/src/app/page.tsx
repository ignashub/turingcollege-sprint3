'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { FileUpload } from 'primereact/fileupload';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { ProgressBar } from 'primereact/progressbar';
import { ProgressSpinner } from 'primereact/progressspinner';
import { uploadFile, cleanData, downloadFile } from '@/services/api';
import { DataInfo, CleaningOptions, CleaningReport } from '@/types';
import { Tooltip } from 'primereact/tooltip';
import { InputSwitch } from 'primereact/inputswitch';
import { InputNumber } from 'primereact/inputnumber';
import { Message } from 'primereact/message';
import { Card } from 'primereact/card';
import { Divider } from 'primereact/divider';
import { TabView, TabPanel } from 'primereact/tabview';

const missingValueDescriptions: Record<string, string> = {
  none: "Keep empty cells as they are without making any changes",
  mean: "Fill empty cells with the average value of all other values in that column. Best for numerical data with a normal distribution.",
  median: "Fill empty cells with the middle value when all values are sorted. Good for numerical data with outliers.",
  mode: "Fill empty cells with the most frequently occurring value in that column. Suitable for both numerical and categorical data.",
  drop: "Remove rows containing empty cells. Use when missing data makes the entire row unreliable."
};

const outlierDescriptions: Record<string, string> = {
  none: "Keep all values as they are without detecting or removing outliers",
  zscore: "Detect unusual values based on how many standard deviations they are from the mean. Values beyond the threshold are considered outliers.",
  iqr: "Detect unusual values using the Interquartile Range method. Values below Q1-(threshold×IQR) or above Q3+(threshold×IQR) are considered outliers."
};

const dataCleaningDescription = "Data cleaning helps improve your data quality by removing errors, duplicates, and handling missing values. Clean data leads to more accurate analysis results!";

const duplicatesDescription = "Duplicate entries are exact copies of the same data. Removing them helps prevent skewed analysis results.";

const missingValuesDescription = "Missing values are empty cells in your data. They can affect analysis results if not handled properly. Choose a method below to deal with them.";

const outliersDescription = "Outliers are extreme values that differ significantly from other observations. They can skew your analysis results if not addressed.";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Define better types for AI recommendations
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiRecommendations, setAIRecommendations] = useState<AIRecommendation | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [cleanedFilename, setCleanedFilename] = useState('');
  const [isCleaningData, setIsCleaningData] = useState(false);
  const toastRef = useRef<Toast>(null);

  // Initialize empty records in cleaningOptions when dataInfo changes
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

  const handleFileUpload = async (event: any) => {
    try {
      setLoading(true);
      const file = event.files[0];
      setSelectedFile(file);
      const dataInfo = await uploadFile(file);
      setDataInfo(dataInfo);
      
      // Read the file to display in the table
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const rows = text.split('\n').map(row => row.split(','));
        const headers = rows[0];
        const data = rows.slice(1).map(row => {
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });
        setData(data);
      };
      reader.readAsText(file);
      
      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'File uploaded successfully',
      });
    } catch (error) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload file',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanData = async () => {
    if (!dataInfo) return;

    try {
      setLoading(true);
      const { report, cleaned_filename } = await cleanData(dataInfo.file_name, cleaningOptions);
      setCleaningReport(report);
      
      // Download the cleaned file
      const blob = await downloadFile(cleaned_filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cleaned_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Data cleaned and downloaded successfully',
      });
    } catch (error) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to clean data',
      });
    } finally {
      setLoading(false);
      setShowCleaningDialog(false);
    }
  };

  const handleDataCleaning = async () => {
    setIsCleaningData(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: dataInfo?.file_name,
          cleaning_options: cleaningOptions,
          use_ai: useAI // Send whether to use AI-based cleaning
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clean data');
      }
      
      const data = await response.json();
      setCleaningReport(data.report);
      setCleanedFilename(data.cleaned_filename);
      toastRef.current?.show({ 
        severity: 'success', 
        summary: 'Success', 
        detail: 'Data cleaned successfully!' 
      });
      
      // Show reports dialog
      setShowReportDialog(true);
    } catch (error: any) {
      console.error('Error cleaning data:', error);
      toastRef.current?.show({ 
        severity: 'error', 
        summary: 'Error', 
        detail: error.message || 'Failed to clean data' 
      });
    } finally {
      setIsCleaningData(false);
    }
  };

  const getAIRecommendations = async () => {
    if (!dataInfo) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Please upload a file first'
      });
      return;
    }
    
    setLoadingRecommendations(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: dataInfo.file_name
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get AI recommendations');
      }
      
      const data = await response.json();
      setAIRecommendations(data.recommendations);
      
      // Apply AI recommendations to the cleaning options
      if (data.recommendations && data.recommendations.column_recommendations) {
        const newCleaningOptions = { ...cleaningOptions };
        
        // Update missing values options based on AI recommendations
        if (newCleaningOptions.missing_values) {
          Object.keys(data.recommendations.column_recommendations).forEach(column => {
            const columnRec = data.recommendations.column_recommendations[column];
            if (columnRec.missing_value_strategy) {
              if (!newCleaningOptions.missing_values[column]) {
                newCleaningOptions.missing_values[column] = { method: 'none' };
              }
              newCleaningOptions.missing_values[column].method = columnRec.missing_value_strategy;
            }
          });
        }
        
        // Update outlier detection options based on AI recommendations
        if (newCleaningOptions.outliers) {
          Object.keys(data.recommendations.column_recommendations).forEach(column => {
            const columnRec = data.recommendations.column_recommendations[column];
            if (columnRec.outlier_strategy) {
              if (!newCleaningOptions.outliers[column]) {
                newCleaningOptions.outliers[column] = { method: 'zscore', enabled: false, threshold: 3 };
              }
              // Only update if there's an explicit recommendation
              if (columnRec.outlier_strategy !== 'none') {
                newCleaningOptions.outliers[column].method = 
                  columnRec.outlier_strategy === 'remove' ? 'zscore' : columnRec.outlier_strategy;
                newCleaningOptions.outliers[column].enabled = true;
              }
            }
          });
        }
        
        // Update duplicates option if recommended
        if (data.recommendations.should_remove_duplicates !== undefined) {
          newCleaningOptions.remove_duplicates = data.recommendations.should_remove_duplicates;
        }
        
        setCleaningOptions(newCleaningOptions);
        toastRef.current?.show({
          severity: 'info',
          summary: 'AI Recommendations Applied',
          detail: 'The cleaning options have been updated with AI recommendations'
        });
      }
      
    } catch (error: any) {
      console.error('Error getting AI recommendations:', error);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to get AI recommendations'
      });
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleMissingValueOptionChange = (column: string, key: string, value: any) => {
    setCleaningOptions(prev => ({
      ...prev,
      missing_values: {
        ...prev.missing_values,
        [column]: {
          ...prev.missing_values[column],
          [key]: value
        }
      }
    }));
  };

  const handleOutlierOptionChange = (column: string, key: string, value: any) => {
    setCleaningOptions(prev => ({
      ...prev,
      outliers: {
        ...prev.outliers,
        [column]: {
          ...prev.outliers[column],
          [key]: value
        }
      }
    }));
  };

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
                <p className="mt-2 mb-0">Choose from AI-powered automatic cleaning or set up your own cleaning rules below.</p>
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
              label={useAI ? "Clean with AI" : "Clean Data"} 
              icon={useAI ? "pi pi-cog" : "pi pi-check"} 
              onClick={handleDataCleaning} 
              loading={isCleaningData} 
              className="p-button-primary" 
            />
          </div>
        }
      >
        <div className="p-4 border-round shadow-2 bg-primary-50 mb-3">
          <div className="flex align-items-center justify-content-between">
            <div>
              <h3 className="m-0">AI-Powered Cleaning</h3>
              <p className="text-sm text-600 mt-1 mb-2">Let AI analyze your data and suggest the best cleaning options automatically</p>
            </div>
            <div className="flex align-items-center gap-3">
              <span className="mr-2">AI Mode: {useAI ? 'On' : 'Off'}</span>
              <InputSwitch 
                checked={useAI} 
                onChange={(e) => setUseAI(e.value)} 
                disabled={loadingRecommendations || isCleaningData}
              />
              <Button 
                label="Get AI Suggestions" 
                icon="pi pi-bolt" 
                className="p-button-outlined p-button-info"
                onClick={getAIRecommendations}
                loading={loadingRecommendations}
                disabled={isCleaningData || !selectedFile?.name}
              />
            </div>
          </div>
          
          {aiRecommendations && (
            <div className="mt-3 p-3 border-1 border-300 border-round bg-white">
              <h4 className="mt-0 mb-2">AI Analysis:</h4>
              <p className="m-0 text-sm">{aiRecommendations.explanation}</p>
              {aiRecommendations.general_advice && (
                <div className="mt-2">
                  <h5 className="mt-0 mb-1">General Advice:</h5>
                  <p className="m-0 text-sm">{aiRecommendations.general_advice}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        <TabView className="mt-3" activeIndex={useAI ? 1 : 0} onTabChange={(e) => setUseAI(e.index === 1)}>
          <TabPanel header="Set up Cleaning Manually">
            <div className="flex align-items-center mb-3">
              <h3 className="m-0">
                Manual Configuration
                <span id="manual-config-info" className="ml-2">
                  <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
                </span>
              </h3>
              <Tooltip target="#manual-config-info" position="right" showDelay={150}>
                <div className="p-2" style={{ maxWidth: '300px' }}>
                  <p className="m-0">Configure your own cleaning options for more control over how your data is processed.</p>
                  <p className="mt-2 mb-0">Click the information icons for guidance on each option.</p>
                </div>
              </Tooltip>
            </div>
            
            <div className="grid">
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3 flex align-items-center">
                    <i className="pi pi-copy text-primary mr-2"></i>
                    Duplicates
                    <span id="duplicates-info" className="ml-2">
                      <i className="pi pi-info-circle" style={{ cursor: 'pointer', fontSize: '0.8rem' }}></i>
                    </span>
                  </h3>
                  <Tooltip target="#duplicates-info" position="right" showDelay={150}>
                    Duplicate rows have identical values across all columns. Removing duplicates helps ensure your analysis isn't skewed by repeated data points.
                  </Tooltip>
                  
                  {/* Duplicate Education and Controls */}
                  <div className="p-3 bg-primary-100 border-round mb-3">
                    <div className="flex align-items-center mb-2">
                      <i className="pi pi-info-circle mr-2 text-primary"></i>
                      <div className="font-medium">What are duplicates?</div>
                    </div>
                    <p className="text-sm m-0">Duplicate entries are exact copies of data rows. They can skew your analysis by giving more weight to certain data points.</p>
                    
                    <div className="mt-3 pt-2 border-top-1 border-primary-200">
                      <div className="flex justify-content-between align-items-center">
                        <label htmlFor="remove-duplicates" className="font-medium">Remove Duplicates</label>
                        <InputSwitch
                          id="remove-duplicates"
                          checked={cleaningOptions.remove_duplicates}
                          onChange={(e) => setCleaningOptions(prev => ({
                            ...prev,
                            remove_duplicates: e.value
                          }))}
                        />
                      </div>
                      
                      <div className="mt-2 flex align-items-center">
                        {cleaningOptions.remove_duplicates ? (
                          <Message severity="success" text="Duplicate rows will be removed from your dataset" />
                        ) : (
                          <Message severity="info" text="Duplicate rows will be preserved in your dataset" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {cleaningReport?.duplicates_removed !== undefined ? (
                    <div>
                      {cleaningReport?.duplicates_removed > 0 ? (
                        <div className="text-center p-3 border-round bg-primary-100">
                          <div className="mb-2 font-medium">Duplicates Removed</div>
                          <div className="text-2xl font-bold text-primary">{cleaningReport?.duplicates_removed}</div>
                          <div className="mt-2 text-sm">
                            {((cleaningReport?.duplicates_removed / (cleaningReport?.original_rows || 1)) * 100).toFixed(1)}% of original dataset
                          </div>
                          <div className="mt-3 pt-2 border-top-1 border-primary-200">
                            <div className="flex justify-content-between">
                              <span>Original rows:</span>
                              <span className="font-medium">{cleaningReport?.original_rows}</span>
                            </div>
                            <div className="flex justify-content-between">
                              <span>After removing duplicates:</span>
                              <span className="font-medium">{cleaningReport?.original_rows - (cleaningReport?.duplicates_removed || 0)}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex align-items-center justify-content-center h-full border-round bg-primary-50 p-4">
                          <div className="text-center">
                            <i className="pi pi-check-circle text-primary" style={{ fontSize: '2rem' }}></i>
                            <p className="mt-2 mb-0">No duplicate rows were found!</p>
                            <p className="text-sm text-600 mt-1">Your dataset has no exact duplicate rows</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex align-items-center justify-content-center h-full border-round bg-primary-50 p-4">
                      <div className="text-center">
                        <i className="pi pi-info-circle text-primary" style={{ fontSize: '2rem' }}></i>
                        <p className="mt-2 mb-0">Duplicate checking not performed yet</p>
                        <p className="text-sm text-600 mt-1">Clean your data to check for duplicates</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
          
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3">
                    Missing Values
                    <span className="ml-2 p-overlay-badge" data-pr-tooltip="Missing Values" data-pr-position="right" data-pr-at="right+5 top">
                      <i className="pi pi-info-circle" style={{ fontSize: '0.75rem', color: 'var(--primary-color)' }}></i>
                      <Tooltip target=".p-overlay-badge" content={missingValuesDescription} />
                    </span>
                  </h3>
                  <Tooltip target="#missing-values-header-info" position="right" showDelay={150}>
                    <div className="p-2">
                      <p className="m-0 mb-2">{missingValuesDescription}</p>
                      <h5 className="mt-2 mb-2">Available options:</h5>
                      <ul className="m-0 p-0" style={{ listStyleType: 'none' }}>
                        <li className="mb-2"><b>Do nothing:</b> {missingValueDescriptions.none}</li>
                        <li className="mb-2"><b>Fill with mean:</b> Use the average value (good for numbers that follow a normal pattern)</li>
                        <li className="mb-2"><b>Fill with median:</b> Use the middle value (good for numbers with some extreme values)</li>
                        <li className="mb-2"><b>Fill with mode:</b> Use the most common value (good for categories or numbers with patterns)</li>
                        <li><b>Drop rows:</b> Remove rows with missing data (use when the missing data makes the row unusable)</li>
                      </ul>
                    </div>
                  </Tooltip>
                  
                  {/* Bulk Actions for Missing Values */}
                  <div className="p-3 bg-primary-100 border-round mb-3">
                    <div className="font-medium mb-2">Bulk Actions</div>
                    <div className="grid">
                      <div className="col-6">
                        <Button 
                          label="All to None" 
                          icon="pi pi-ban" 
                          className="p-button-outlined p-button-secondary p-button-sm w-full"
                          onClick={() => {
                            if (!dataInfo) return;
                            const newMissingValues = { ...cleaningOptions.missing_values };
                            dataInfo.column_names.forEach(column => {
                              newMissingValues[column] = { method: 'none' };
                            });
                            setCleaningOptions(prev => ({
                              ...prev,
                              missing_values: newMissingValues
                            }));
                          }}
                        />
                      </div>
                      <div className="col-6">
                        <Dropdown
                          placeholder="Apply to All"
                          options={[
                            { label: 'Mean', value: 'mean' },
                            { label: 'Median', value: 'median' },
                            { label: 'Mode', value: 'mode' },
                            { label: 'Drop', value: 'drop' }
                          ]}
                          onChange={e => {
                            if (!e.value || !dataInfo) return;
                            const newMissingValues = { ...cleaningOptions.missing_values };
                            dataInfo.column_names.forEach(column => {
                              newMissingValues[column] = { method: e.value };
                            });
                            setCleaningOptions(prev => ({
                              ...prev,
                              missing_values: newMissingValues
                            }));
                          }}
                          className="w-full p-button-sm"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Group columns by type for better organization */}
                  {dataInfo && dataInfo.column_names && (
                    <>
                      {/* ID Fields */}
                      <div className="mb-3">
                        <div className="p-2 bg-primary-200 border-round font-bold">Identifier Fields</div>
                        {dataInfo.column_names
                          .filter(column => column.toLowerCase().includes('id') || column.toLowerCase().includes('code'))
                          .map(column => (
                            <div key={column} className="p-2 border-1 border-primary-200 border-top-none">
                              <div className="flex align-items-center justify-content-between">
                                <div className="flex align-items-center">
                                  <i className="pi pi-key mr-2 text-primary-800" style={{ fontSize: '0.9rem' }}></i>
                                  <span className="font-medium">{column}</span>
                                </div>
                                <span className="text-sm bg-primary-100 px-2 py-1 border-round">{dataInfo.missing_values[column] || 0} missing</span>
                              </div>
                              <div className="mt-1 p-field w-full" id={`missing-value-${column}`}>
                                <Dropdown
                                  value={cleaningOptions.missing_values[column]?.method || 'none'}
                                  options={[
                                    { label: 'Do nothing', value: 'none' },
                                    { label: 'Drop rows', value: 'drop' }
                                  ]}
                                  onChange={e => handleMissingValueOptionChange(column, 'method', e.value)}
                                  className="w-full"
                                />
                                <Tooltip target={`#missing-value-${column}`} position="right" showDelay={150}>
                                  {missingValueDescriptions[cleaningOptions.missing_values[column]?.method || 'none']}
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                      </div>
                      
                      {/* Numeric Fields */}
                      <div className="mb-3">
                        <div className="p-2 bg-primary-200 border-round font-bold">Numeric Fields</div>
                        {dataInfo.column_names
                          .filter(column => 
                            (column.toLowerCase().includes('age') || 
                             column.toLowerCase().includes('amount') || 
                             column.toLowerCase().includes('price') || 
                             column.toLowerCase().includes('points')) && 
                            !column.toLowerCase().includes('id'))
                          .map(column => (
                            <div key={column} className="p-2 border-1 border-primary-200 border-top-none">
                              <div className="flex align-items-center justify-content-between">
                                <div className="flex align-items-center">
                                  <i className="pi pi-hashtag mr-2 text-primary-800" style={{ fontSize: '0.9rem' }}></i>
                                  <span className="font-medium">{column}</span>
                                </div>
                                <span className="text-sm bg-primary-100 px-2 py-1 border-round">{dataInfo.missing_values[column] || 0} missing</span>
                              </div>
                              <div className="mt-1 p-field w-full" id={`missing-value-${column}`}>
                                <Dropdown
                                  value={cleaningOptions.missing_values[column]?.method || 'none'}
                                  options={[
                                    { label: 'Do nothing', value: 'none' },
                                    { label: 'Drop rows', value: 'drop' },
                                    { label: 'Fill with mean', value: 'mean' },
                                    { label: 'Fill with median', value: 'median' },
                                    { label: 'Fill with mode', value: 'mode' }
                                  ]}
                                  onChange={e => handleMissingValueOptionChange(column, 'method', e.value)}
                                  className="w-full"
                                />
                                <Tooltip target={`#missing-value-${column}`} position="right" showDelay={150}>
                                  {missingValueDescriptions[cleaningOptions.missing_values[column]?.method || 'none']}
                                </Tooltip>
                              </div>
                              {cleaningOptions.missing_values[column]?.method && 
                               cleaningOptions.missing_values[column]?.method !== 'none' && 
                               cleaningOptions.missing_values[column]?.method !== 'drop' && (
                                <div className="mt-1 p-1 bg-primary-50 border-round text-xs text-600">
                                  <i className="pi pi-info-circle mr-1"></i>
                                  {cleaningOptions.missing_values[column]?.method === 'mean' && "Will fill with average value"}
                                  {cleaningOptions.missing_values[column]?.method === 'median' && "Will fill with middle value"}
                                  {cleaningOptions.missing_values[column]?.method === 'mode' && "Will fill with most common value"}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                      
                      {/* Date Fields */}
                      <div className="mb-3">
                        <div className="p-2 bg-primary-200 border-round font-bold">Date Fields</div>
                        {dataInfo.column_names
                          .filter(column => 
                            column.toLowerCase().includes('date') || 
                            column.toLowerCase().includes('time'))
                          .map(column => (
                            <div key={column} className="p-2 border-1 border-primary-200 border-top-none">
                              <div className="flex align-items-center justify-content-between">
                                <div className="flex align-items-center">
                                  <i className="pi pi-calendar mr-2 text-primary-800" style={{ fontSize: '0.9rem' }}></i>
                                  <span className="font-medium">{column}</span>
                                </div>
                                <span className="text-sm bg-primary-100 px-2 py-1 border-round">{dataInfo.missing_values[column] || 0} missing</span>
                              </div>
                              <div className="mt-1 p-field w-full" id={`missing-value-${column}`}>
                                <Dropdown
                                  value={cleaningOptions.missing_values[column]?.method || 'none'}
                                  options={[
                                    { label: 'Do nothing', value: 'none' },
                                    { label: 'Drop rows', value: 'drop' },
                                    { label: 'Fill with mode', value: 'mode' }
                                  ]}
                                  onChange={e => handleMissingValueOptionChange(column, 'method', e.value)}
                                  className="w-full"
                                />
                                <Tooltip target={`#missing-value-${column}`} position="right" showDelay={150}>
                                  {missingValueDescriptions[cleaningOptions.missing_values[column]?.method || 'none']}
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                      </div>
                      
                      {/* Text/Categorical Fields */}
                      <div className="mb-3">
                        <div className="p-2 bg-primary-200 border-round font-bold">Text/Categorical Fields</div>
                        {dataInfo.column_names
                          .filter(column => 
                            !column.toLowerCase().includes('id') && 
                            !column.toLowerCase().includes('code') &&
                            !column.toLowerCase().includes('age') && 
                            !column.toLowerCase().includes('amount') && 
                            !column.toLowerCase().includes('price') &&
                            !column.toLowerCase().includes('points') &&
                            !column.toLowerCase().includes('date') && 
                            !column.toLowerCase().includes('time'))
                          .map(column => (
                            <div key={column} className="p-2 border-1 border-primary-200 border-top-none">
                              <div className="flex align-items-center justify-content-between">
                                <div className="flex align-items-center">
                                  <i className="pi pi-list mr-2 text-primary-800" style={{ fontSize: '0.9rem' }}></i>
                                  <span className="font-medium">{column}</span>
                                </div>
                                <span className="text-sm bg-primary-100 px-2 py-1 border-round">{dataInfo.missing_values[column] || 0} missing</span>
                              </div>
                              <div className="mt-1 p-field w-full" id={`missing-value-${column}`}>
                                <Dropdown
                                  value={cleaningOptions.missing_values[column]?.method || 'none'}
                                  options={[
                                    { label: 'Do nothing', value: 'none' },
                                    { label: 'Drop rows', value: 'drop' },
                                    { label: 'Fill with mode', value: 'mode' }
                                  ]}
                                  onChange={e => handleMissingValueOptionChange(column, 'method', e.value)}
                                  className="w-full"
                                />
                                <Tooltip target={`#missing-value-${column}`} position="right" showDelay={150}>
                                  {missingValueDescriptions[cleaningOptions.missing_values[column]?.method || 'none']}
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
          
              <div className="col-12 md:col-4">
                <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                  <h3 className="mt-0 mb-3">
                    Outliers
                    <span className="ml-2 p-overlay-badge" data-pr-tooltip="Outliers" data-pr-position="right" data-pr-at="right+5 top">
                      <i className="pi pi-info-circle" style={{ fontSize: '0.75rem', color: 'var(--primary-color)' }}></i>
                      <Tooltip target=".p-overlay-badge" content={outliersDescription} />
                    </span>
                  </h3>
                  <Tooltip target="#outliers-header-info" position="right" showDelay={150}>
                    <div className="p-2">
                      <p className="m-0 mb-2">{outliersDescription}</p>
                      <h5 className="mt-2 mb-2">Detection methods:</h5>
                      <ul className="m-0 p-0" style={{ listStyleType: 'none' }}>
                        <li className="mb-2"><b>Z-Score:</b> {outlierDescriptions.zscore}</li>
                        <li className="mb-2"><b>IQR:</b> {outlierDescriptions.iqr}</li>
                        <li className="mt-2"><b>Threshold:</b> How sensitive the detection should be - higher values are more lenient</li>
                      </ul>
                    </div>
                  </Tooltip>
                  
                  {/* Outlier Education */}
                  <div className="p-3 bg-primary-100 border-round mb-3">
                    <div className="flex align-items-center mb-2">
                      <i className="pi pi-info-circle mr-2 text-primary"></i>
                      <div className="font-medium">What are outliers?</div>
                    </div>
                    <p className="text-sm m-0">Outliers are unusual values that differ significantly from other observations. They can skew analysis results and may indicate errors or special cases that need attention.</p>
                    <div className="flex justify-content-between align-items-center mt-2">
                      <div className="flex align-items-center">
                        <i className="pi pi-chart-line mr-1 text-primary-800" style={{ fontSize: '0.8rem' }}></i>
                        <span className="text-xs">Z-Score: Statistical distance from mean</span>
                      </div>
                      <div className="flex align-items-center">
                        <i className="pi pi-bars mr-1 text-primary-800" style={{ fontSize: '0.8rem' }}></i>
                        <span className="text-xs">IQR: Based on quartile ranges</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bulk Actions for Outliers */}
                  <div className="p-3 bg-primary-100 border-round mb-3">
                    <div className="font-medium mb-2">Bulk Actions</div>
                    <div className="grid">
                      <div className="col-6">
                        <Button 
                          label="Enable All" 
                          icon="pi pi-check-square" 
                          className="p-button-outlined p-button-success p-button-sm w-full"
                          onClick={() => {
                            if (!dataInfo) return;
                            const newOutliers = { ...cleaningOptions.outliers };
                            dataInfo.column_names
                              .filter(column => 
                                column.toLowerCase().includes('age') || 
                                column.toLowerCase().includes('amount') || 
                                column.toLowerCase().includes('price') || 
                                column.toLowerCase().includes('points'))
                              .forEach(column => {
                                newOutliers[column] = { 
                                  ...newOutliers[column],
                                  enabled: true,
                                  method: newOutliers[column]?.method || 'zscore',
                                  threshold: newOutliers[column]?.threshold || 3
                                };
                              });
                            setCleaningOptions(prev => ({
                              ...prev,
                              outliers: newOutliers
                            }));
                          }}
                        />
                      </div>
                      <div className="col-6">
                        <Button 
                          label="Disable All" 
                          icon="pi pi-ban" 
                          className="p-button-outlined p-button-danger p-button-sm w-full"
                          onClick={() => {
                            if (!dataInfo) return;
                            const newOutliers = { ...cleaningOptions.outliers };
                            dataInfo.column_names.forEach(column => {
                              newOutliers[column] = { 
                                ...newOutliers[column],
                                enabled: false 
                              };
                            });
                            setCleaningOptions(prev => ({
                              ...prev,
                              outliers: newOutliers
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Only show numeric fields for outlier detection since it only makes sense for numbers */}
                  {dataInfo && dataInfo.column_names && (
                    <div className="mb-3">
                      <div className="p-2 bg-primary-200 border-round font-bold">Numeric Fields</div>
                      {dataInfo.column_names
                        .filter(column => 
                          (column.toLowerCase().includes('age') || 
                           column.toLowerCase().includes('amount') || 
                           column.toLowerCase().includes('price') || 
                           column.toLowerCase().includes('points')) && 
                          !column.toLowerCase().includes('id'))
                        .map(column => (
                          <div key={column} className="p-2 border-1 border-primary-200 border-top-none">
                            <div className="flex align-items-center justify-content-between mb-1">
                              <div className="field-checkbox mb-0">
                                <Checkbox
                                  inputId={`outlier-${column}`}
                                  checked={cleaningOptions.outliers[column]?.enabled || false}
                                  onChange={e => handleOutlierOptionChange(column, 'enabled', e.checked)}
                                />
                                <label htmlFor={`outlier-${column}`} className="ml-2 font-medium">
                                  <i className="pi pi-hashtag mr-1 text-primary-800" style={{ fontSize: '0.9rem' }}></i>
                                  {column}
                                </label>
                              </div>
                              <span className="text-xs bg-primary-300 px-1 py-1 border-round">Numeric</span>
                            </div>
                            {cleaningOptions.outliers[column]?.enabled && (
                              <div className="pl-4 pt-2 border-left-2 border-primary-300">
                                <div className="mb-2">
                                  <div className="flex justify-content-between align-items-center">
                                    <label className="block text-sm mb-1">Detection Method</label>
                                    <div className="p-tag p-tag-info p-tag-rounded text-xs">
                                      {cleaningOptions.outliers[column]?.method === 'zscore' ? 
                                        <span>Statistical</span> : 
                                        <span>Range-based</span>
                                      }
                                    </div>
                                  </div>
                                  <div className="p-field w-full" id={`outlier-method-${column}`}>
                                    <Dropdown
                                      value={cleaningOptions.outliers[column]?.method || 'zscore'}
                                      options={[
                                        { label: 'Z-Score (Statistical)', value: 'zscore' },
                                        { label: 'IQR (Range-based)', value: 'iqr' }
                                      ]}
                                      onChange={e => handleOutlierOptionChange(column, 'method', e.value)}
                                      className="w-full"
                                    />
                                    <Tooltip target={`#outlier-method-${column}`} position="right" showDelay={150}>
                                      {outlierDescriptions[cleaningOptions.outliers[column]?.method || 'zscore']}
                                    </Tooltip>
                                  </div>
                                </div>
                                <div className="mb-2">
                                  <div className="flex justify-content-between align-items-center">
                                    <label className="block text-sm mb-1">
                                      {cleaningOptions.outliers[column]?.method === 'zscore' ? 'Z-Score Threshold' : 'IQR Multiplier'}
                                    </label>
                                    <div className="text-xs bg-primary-50 px-2 py-1 border-round">
                                      {cleaningOptions.outliers[column]?.threshold || 3}
                                    </div>
                                  </div>
                                  <div className="grid">
                                    <div className="col-3 text-center pt-1">
                                      <span className="text-xs">Strict</span>
                                    </div>
                                    <div className="col-6">
                                      <div className="p-field w-full" id={`outlier-threshold-${column}`}>
                                        <InputNumber
                                          value={cleaningOptions.outliers[column]?.threshold || 3}
                                          onChange={e => handleOutlierOptionChange(column, 'threshold', e.value)}
                                          min={0.1}
                                          max={10}
                                          step={0.1}
                                          showButtons
                                          className="w-full"
                                        />
                                        <Tooltip target={`#outlier-threshold-${column}`} position="right" showDelay={150}>
                                          {`Higher values mean fewer outliers will be detected. ${cleaningOptions.outliers[column]?.method === 'zscore' ? 'Typical values are between 2-4' : 'Typical values are between 1.5-3'}`}
                                        </Tooltip>
                                      </div>
                                    </div>
                                    <div className="col-3 text-center pt-1">
                                      <span className="text-xs">Lenient</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-2 bg-primary-50 border-round text-xs">
                                  <i className="pi pi-info-circle mr-1 text-primary-700"></i>
                                  {cleaningOptions.outliers[column]?.method === 'zscore' 
                                    ? `Values more than ${cleaningOptions.outliers[column]?.threshold || 3} standard deviations from the mean will be removed.` 
                                    : `Values below Q1-${cleaningOptions.outliers[column]?.threshold || 3}×IQR or above Q3+${cleaningOptions.outliers[column]?.threshold || 3}×IQR will be removed.`
                                  }
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabPanel>
          
          <TabPanel header="AI Recommendations">
            <div className="flex align-items-center mb-3">
              <h3 className="m-0">AI Recommendations</h3>
              <i 
                className="pi pi-info-circle ml-2" 
                style={{ cursor: 'pointer' }}
                id="ai-recommendations-info"
              />
              <Tooltip target="#ai-recommendations-info" position="right" showDelay={150}>
                Let AI analyze your data and suggest optimal cleaning strategies
              </Tooltip>
            </div>
            
            {!aiRecommendations ? (
              <div className="flex flex-column align-items-center justify-content-center p-5">
                <Message severity="info" text="Click 'Get AI Recommendations' to analyze your dataset and receive personalized cleaning suggestions." />
                <Button 
                  label="Get Recommendations" 
                  icon="pi pi-bolt" 
                  className="p-button-outlined p-button-info mt-3"
                  onClick={getAIRecommendations}
                  loading={loadingRecommendations}
                  disabled={isCleaningData || !selectedFile?.name}
                />
              </div>
            ) : (
              <div className="p-3">
                <h3 className="mt-0 mb-2">AI Cleaning Summary</h3>
                <p>{aiRecommendations.explanation}</p>
                
                <Divider />
                
                <div className="grid">
                  <div className="col-12 md:col-4">
                    <Card title="General Strategy" className="h-full">
                      <p className="m-0">{aiRecommendations.general_advice}</p>
                      <div className="mt-3">
                        <span className="font-bold">Duplicates: </span>
                        <span>{aiRecommendations.should_remove_duplicates ? 'Remove' : 'Keep'}</span>
                      </div>
                    </Card>
                  </div>
                  
                  <div className="col-12 md:col-8">
                    <Card title="Column-Specific Recommendations" className="h-full">
                      <div className="grid">
                        {Object.entries(aiRecommendations.column_recommendations || {}).map(([column, rec]) => (
                          <div key={column} className="col-12 md:col-6 lg:col-4">
                            <div className="p-3 border-1 border-round mb-3">
                              <h4 className="mt-0 mb-2">{column}</h4>
                              {rec.missing_value_strategy && (
                                <div className="mb-2">
                                  <span className="font-bold">Missing Values: </span>
                                  <span>{rec.missing_value_strategy}</span>
                                </div>
                              )}
                              {rec.outlier_strategy && (
                                <div className="mb-2">
                                  <span className="font-bold">Outliers: </span>
                                  <span>{rec.outlier_strategy}</span>
                                </div>
                              )}
                              {rec.recommendation && (
                                <p className="text-sm mt-2 mb-0">{rec.recommendation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </TabPanel>
        </TabView>
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
    window.open(`${API_BASE_URL}/api/download/${cleanedFilename}`, '_blank');
  };

  return (
    <main className="p-4">
      <Toast ref={setToast} />
      <Tooltip target=".pi-info-circle" position="right" showDelay={150} />
      <Tooltip target="[data-pr-tooltip]" position="right" showDelay={150} />
      
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">Data Cleaning Tool</h1>
        
        <div className="mb-3 text-center">
          <h2 className="text-xl font-bold mb-2">Step 1: Upload your data file</h2>
          <p className="mb-2">Upload a CSV or Excel file to begin the cleaning process.</p>
          <FileUpload
            mode="basic"
            name="file"
            url="/api/upload"
            accept=".csv,.xlsx"
            maxFileSize={10000000}
            chooseLabel="Upload File"
            auto
            onUpload={handleFileUpload}
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
