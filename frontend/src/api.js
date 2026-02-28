import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

export const fetchRoleRules = async (role) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/role-rules/${role}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching rules for ${role}:`, error);
        throw error;
    }
};

export const fetchHallucinationAnalysis = async (expertAnswer, baseAnswer, question, role) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/analyze-hallucination`, {
            expert_answer: expertAnswer,
            base_answer: baseAnswer,
            question,
            role
        });
        return response.data;
    } catch (error) {
        console.error('Error analyzing hallucination:', error);
        return { analysis: "Analysis failed.", hallucination_score: 0 };
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
};
