import axios from 'axios';
import { DataInfo, CleaningOptions, CleaningReport } from '@/types';

// Use the direct backend URL
const API_BASE_URL = 'http://localhost:8000/api';

// Create axios instance with proper configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Increase timeout for large file uploads
  timeout: 60000, // 1 minute
  // Do not use withCredentials when making cross-origin requests
  withCredentials: false
});

// Add request interceptor for debugging
api.interceptors.request.use(request => {
  console.log('Starting API Request:', request.method, request.url);
  return request;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  response => {
    console.log('API Response:', response.status, response.statusText);
    return response;
  },
  error => {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    }
    return Promise.reject(error);
  }
);

export const uploadFile = async (file: File): Promise<DataInfo> => {
  console.log('Uploading file:', file.name, file.size, file.type);
  
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ message: string; data_info: DataInfo }>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
        console.log(`Upload progress: ${percentCompleted}%`);
      },
    });

    console.log('Upload successful:', response.data);
    return response.data.data_info;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

export const cleanData = async (
  filename: string,
  options: CleaningOptions
): Promise<{ report: CleaningReport; cleaned_filename: string }> => {
  try {
    const response = await api.post('/clean', {
      filename,
      cleaning_options: options,
    });

    return response.data;
  } catch (error) {
    console.error('Data cleaning failed:', error);
    throw error;
  }
};

export const downloadFile = async (filename: string): Promise<Blob> => {
  try {
    const response = await api.get(`/download/${filename}`, {
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    console.error('File download failed:', error);
    throw error;
  }
};

// Simple test endpoint to verify connectivity
export const testConnection = async (): Promise<boolean> => {
  try {
    const response = await api.get('/test');
    console.log('Backend connection test successful:', response.data);
    return true;
  } catch (error) {
    console.error('Backend connection test failed:', error);
    return false;
  }
}; 