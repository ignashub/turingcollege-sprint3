import axios from 'axios';

// Base API URL from environment variable or fallback
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance with proper configuration
const apiClient = axios.create({
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
apiClient.interceptors.request.use(request => {
  console.log('Starting API Request:', request.method, request.url);
  return request;
});

// Add response interceptor for debugging
apiClient.interceptors.response.use(
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

export default apiClient; 