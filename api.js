import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const askExpert = async (question, plugin) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ask-expert`, {
            question,
            plugin,
        });
        return response.data;
    } catch (error) {
        console.error(`Error querying ${plugin} expert:`, error);
        throw error;
    }
};

export const checkHealth = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/health`);
        return response.data;
    } catch (error) {
        console.error('API Health check failed:', error);
        return { status: 'error', detail: error.message };
    }
}
