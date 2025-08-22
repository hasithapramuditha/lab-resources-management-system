import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach JWT token to every request if provided
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Log all outgoing requests and their headers
api.interceptors.request.use(request => {
  console.log('API Request:', request.method, request.url, request.headers, request.data);
  return request;
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';
export const socket = io(SOCKET_URL, {
  withCredentials: true
});

export default api; 