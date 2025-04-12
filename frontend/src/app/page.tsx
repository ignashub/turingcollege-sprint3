'use client';

import { useState } from 'react';
import { FileUpload } from 'primereact/fileupload';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { ProgressBar } from 'primereact/progressbar';
import { uploadFile, cleanData, downloadFile } from '@/services/api';
import { DataInfo, CleaningOptions, CleaningReport } from '@/types';
import { Tooltip } from 'primereact/tooltip';

const missingValueDescriptions: Record<string, string> = {
  none: "Keep empty cells as they are",
  mean: "Fill in empty cells with the average value of the column",
  median: "Fill in empty cells with the middle value of the column",
  mode: "Fill in empty cells with the most common value in the column",
  drop: "Remove any rows that have empty cells in this column"
};

const outlierDescriptions: Record<string, string> = {
  none: "Keep all values as they are",
  zscore: "Find unusual values that are way different from most other values. These odd values can mess up your results if left alone.",
  iqr: "Catch values that are too far from the middle chunk of your data (like the really high or really low numbers)"
};

const dataCleaningDescription = "Data cleaning helps fix your data by removing or fixing errors, duplicates, and missing values. Clean data gives you better results when analyzing!";

const duplicatesDescription = "Find and remove repeat entries so they don't throw off your results";

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

  const handleFileUpload = async (event: any) => {
    try {
      setLoading(true);
      const file = event.files[0];
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
      
      toast?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'File uploaded successfully',
      });
    } catch (error) {
      toast?.show({
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
      
      toast?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Data cleaned and downloaded successfully',
      });
    } catch (error) {
      toast?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to clean data',
      });
    } finally {
      setLoading(false);
      setShowCleaningDialog(false);
    }
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
            <Tooltip target="#data-cleaning-info" position="right">
              {dataCleaningDescription}
            </Tooltip>
          </>
        }
        visible={showCleaningDialog}
        onHide={() => setShowCleaningDialog(false)}
        style={{ width: '50vw' }}
      >
        <div className="p-fluid">
          <div className="field-checkbox mb-3">
            <Checkbox
              checked={cleaningOptions.remove_duplicates}
              onChange={(e) => setCleaningOptions({
                ...cleaningOptions,
                remove_duplicates: e.checked || false,
              })}
            />
            <label className="ml-2">Remove Duplicates</label>
            <span id="duplicates-info" className="ml-2">
              <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
            </span>
            <Tooltip target="#duplicates-info">
              {duplicatesDescription}
            </Tooltip>
          </div>

          {dataInfo.column_names.map((column) => (
            <div key={column} className="mb-3">
              <h3 className="mb-2 font-semibold">{column}</h3>
              <div className="grid">
                <div className="col-6">
                  <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                    <div className="mb-2">
                      <label className="font-medium block">Missing Values</label>
                      <span id={`missing-values-${column}`} className="p-overlay-badge ml-2">
                        <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
                      </span>
                      <Tooltip target={`#missing-values-${column}`} position="right" className="max-w-20rem">
                        <div className="p-2">
                          <h5 className="mt-0 mb-2">Missing Values Options:</h5>
                          <ul className="m-0 p-0 pl-4">
                            <li className="mb-2"><strong>None</strong>: {missingValueDescriptions.none}</li>
                            <li className="mb-2"><strong>Mean</strong>: {missingValueDescriptions.mean}</li>
                            <li className="mb-2"><strong>Median</strong>: {missingValueDescriptions.median}</li>
                            <li className="mb-2"><strong>Mode</strong>: {missingValueDescriptions.mode}</li>
                            <li><strong>Drop</strong>: {missingValueDescriptions.drop}</li>
                          </ul>
                        </div>
                      </Tooltip>
                    </div>
                    <Dropdown
                      value={cleaningOptions.missing_values[column] || 'none'}
                      options={[
                        { label: 'None', value: 'none' },
                        { label: 'Mean', value: 'mean' },
                        { label: 'Median', value: 'median' },
                        { label: 'Mode', value: 'mode' },
                        { label: 'Drop', value: 'drop' },
                      ]}
                      onChange={(e) => setCleaningOptions({
                        ...cleaningOptions,
                        missing_values: {
                          ...cleaningOptions.missing_values,
                          [column]: e.value,
                        },
                      })}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-4 border-round shadow-2 bg-primary-50 h-full">
                    <div className="mb-2">
                      <label className="font-medium block">Outliers</label>
                      <span id={`outliers-${column}`} className="ml-2">
                        <i className="pi pi-info-circle" style={{ cursor: 'pointer' }}></i>
                      </span>
                      <Tooltip target={`#outliers-${column}`} position="left" className="max-w-20rem">
                        <div className="p-2">
                          <h5 className="mt-0 mb-2">Outlier Detection Methods:</h5>
                          <ul className="m-0 p-0 pl-4">
                            <li className="mb-2"><strong>None</strong>: {outlierDescriptions.none}</li>
                            <li className="mb-2"><strong>Z-Score</strong>: {outlierDescriptions.zscore}</li>
                            <li><strong>IQR</strong>: {outlierDescriptions.iqr}</li>
                          </ul>
                        </div>
                      </Tooltip>
                    </div>
                    <Dropdown
                      value={cleaningOptions.outliers[column]?.method || 'none'}
                      options={[
                        { label: 'None', value: 'none' },
                        { label: 'Z-Score', value: 'zscore' },
                        { label: 'IQR', value: 'iqr' },
                      ]}
                      onChange={(e) => {
                        if (e.value === 'none') {
                          const { [column]: _, ...rest } = cleaningOptions.outliers;
                          setCleaningOptions({
                            ...cleaningOptions,
                            outliers: rest,
                          });
                        } else {
                          setCleaningOptions({
                            ...cleaningOptions,
                            outliers: {
                              ...cleaningOptions.outliers,
                              [column]: {
                                method: e.value,
                                action: 'cap',
                              },
                            },
                          });
                        }
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-content-end mt-3">
          <Button
            label="Clean Data"
            icon="pi pi-check"
            onClick={handleCleanData}
            loading={loading}
          />
        </div>
      </Dialog>
    );
  };

  return (
    <main className="p-4">
      <Toast ref={setToast} />
      
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">Data Cleaning Tool</h1>
        
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
            toast?.show({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to upload file',
            });
          }}
        />

        {loading && <ProgressBar mode="indeterminate" className="mt-3" />}

        {dataInfo && (
          <div className="mt-4">
            <div className="flex justify-content-between align-items-center mb-3">
              <h2 className="text-xl font-bold">Dataset Information</h2>
              <Button
                label="Clean Data"
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
      </div>
    </main>
  );
}
