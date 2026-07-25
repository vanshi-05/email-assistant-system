import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export interface UserStatus {
  email: string;
  google_linked: boolean;
}

export interface EmailRecord {
  id: number;
  sender: string;
  subject: string;
  body: string;
  ai_reply: string;
  intent: string;
  priority: number;
  status: string; // 'Auto Sent', 'Human Review', 'Skipped'
  created_at: string;
}

export const authAPI = {
  async signup(email: string, password: string) {
    const response = await api.post('/auth/signup', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('email', response.data.email);
    }
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('email', response.data.email);
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
  },

  async getStatus(): Promise<UserStatus> {
    const response = await api.get('/auth/status');
    return response.data;
  },

  async getGoogleAuthURL(): Promise<string> {
    const token = localStorage.getItem('token');
    const response = await api.get(`/auth/google?token=${token}`);
    return response.data.url;
  }
};

export const emailAPI = {
  async getEmails(): Promise<EmailRecord[]> {
    const response = await api.get('/emails');
    return response.data;
  },

  async triggerProcess(): Promise<{ message: string }> {
    const response = await api.post('/emails/process');
    return response.data;
  },

  async sendReply(id: number, aiReply: string): Promise<{ message: string }> {
    const response = await api.post(`/emails/${id}/send-reply`, { ai_reply: aiReply });
    return response.data;
  },

  async skipReply(id: number): Promise<{ message: string }> {
    const response = await api.post(`/emails/${id}/skip`);
    return response.data;
  }
};

export default api;
