import { CleaningOptions, CleaningReport } from '@/types';
import apiClient from '@/services/apiClient';
export { API_BASE_URL } from '@/services/apiClient';

/**
 * Uploads a file to the server
 * @param file The file to upload
 * @param onProgress Callback for upload progress
 * @returns Promise with the server response
 */
export const uploadFile = async (file: File, onProgress?: (percentage: number) => void): Promise<any> => {
  try {
    // Create FormData instance
    const formData = new FormData();
    formData.append('file', file);

    // Configure upload request
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent: any) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`Upload Progress: ${percentCompleted}%`);
        if (onProgress) {
          onProgress(percentCompleted);
        }
      },
    };

    // Make the request
    const response = await apiClient.post('/upload', formData, config);
    console.log('File uploaded successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

/**
 * Formats cleaning options before sending to the backend
 * @param cleaningOptions The cleaning options to format
 * @returns Formatted cleaning options
 */
export const formatCleaningOptions = (cleaningOptions: CleaningOptions): any => {
  const formattedCleaningOptions = { ...cleaningOptions };
  
  // Create a new missing_values object formatted for the backend
  const missing_values: Record<string, string> = {};
  
  // Process each column's missing values settings
  Object.entries(formattedCleaningOptions.missing_values || {}).forEach(([column, options]) => {
    // Convert to format expected by backend (simple method string)
    missing_values[column] = options.method;
  });
  
  // Create a formatted outliers object for the backend
  const outliers: Record<string, any> = {};
  
  Object.entries(formattedCleaningOptions.outliers || {}).forEach(([column, options]) => {
    if (!options.enabled) {
      // Skip disabled outlier detection
    } else {
      outliers[column] = {
        method: options.method,
        threshold: options.threshold || 3,
        action: options.action || 'remove'
      };
    }
  });
  
  // Return the formatted object for the backend
  return {
    missing_values,
    outliers,
    remove_duplicates: formattedCleaningOptions.remove_duplicates
  };
};

/**
 * Sends cleaning options to the server to clean data
 * @param filename The name of the file to clean
 * @param cleaningOptions The cleaning options to apply
 * @returns Promise with the cleaning report
 */
export const cleanData = async (
  filename: string, 
  cleaningOptions: CleaningOptions
): Promise<{ report: CleaningReport; cleaned_filename: string }> => {
  try {
    // Format cleaning options before sending
    const formattedOptions = formatCleaningOptions(cleaningOptions);
    console.log('Sending cleaning options:', formattedOptions);
    
    // Make the request
    const response = await apiClient.post('/clean', {
      filename,
      cleaning_options: formattedOptions
    });
    
    console.log('Data cleaned successfully');
    return response.data;
  } catch (error) {
    console.error('Error cleaning data:', error);
    throw error;
  }
};

/**
 * Downloads the cleaned file from the server
 * @param filename The name of the file to download
 * @returns Promise with the file data
 */
export const downloadFile = async (filename: string): Promise<Blob> => {
  try {
    // Make the request with blob response type
    const response = await apiClient.get(`/download/${filename}`, {
      responseType: 'blob'
    });
    console.log('File downloaded successfully');
    return response.data;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

/**
 * Tests connection to the backend server
 * @returns Promise with connection status
 */
export const testConnection = async (): Promise<{status: string}> => {
  try {
    const response = await apiClient.get('/test');
    console.log('Backend connection successful');
    return response.data;
  } catch (error) {
    console.error('Backend connection failed:', error);
    throw error;
  }
};

/**
 * Sets a custom OpenAI API key for the session
 * @param apiKey The OpenAI API key to use
 * @returns Promise with the operation status
 */
export const setApiKey = async (apiKey: string): Promise<{status: string}> => {
  try {
    const response = await apiClient.post('/set-api-key', {
      api_key: apiKey
    });
    console.log('API key set successfully');
    return response.data;
  } catch (error) {
    console.error('Error setting API key:', error);
    throw error;
  }
}; 