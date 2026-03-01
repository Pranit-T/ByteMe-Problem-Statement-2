import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const getAuthHeaders = () => {
    const groqKey = localStorage.getItem('groqKey');
    const openaiKey = localStorage.getItem('openaiKey');
    const headers = {};
    if (groqKey) headers['x-groq-key'] = groqKey;
    if (openaiKey) headers['x-openai-key'] = openaiKey;
    return headers;
};

export const askExpert = async (question, plugin, provider = 'groq') => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ask-expert`, {
            question,
            plugin,
            provider,
        }, { headers: getAuthHeaders() });
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
        }, { headers: getAuthHeaders() });
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

export const fetchCustomRoles = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/custom-roles`);
        return response.data;
    } catch (error) {
        console.error('Error fetching custom roles:', error);
        throw error;
    }
};

export const saveCustomRole = async (roleData) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/custom-roles`, roleData);
        return response.data;
    } catch (error) {
        console.error('Error saving custom role:', error);
        throw error;
    }
};

export const generateRules = async (roleName, knowledgeBase = null, provider = 'groq') => {
    try {
        const payload = { role_name: roleName, provider };
        if (knowledgeBase) payload.knowledge_base = knowledgeBase;
        const response = await axios.post(`${API_BASE_URL}/generate-rules`, payload, { headers: getAuthHeaders() });
        return response.data;
    } catch (error) {
        console.error('Error generating rules:', error);
        throw error;
    }
};

export const uploadKnowledgeFile = async (file) => {
    try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_BASE_URL}/extract-text`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    } catch (error) {
        console.error('Error uploading knowledge file:', error);
        throw error;
    }
};
