import { getKey } from '../utils/keys.js';

export class Qwen {
    constructor(modelName, url) {
        this.modelName = modelName || 'qwen-plus';
        this.url = url || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
        this.apiKey = getKey('QWEN_API_KEY');
        this.maxRetries = 5;
    }

    async sendRequest(turns, systemMessage, stopSeq = '***') {
        return this._handleRequest('chat', {
            turns,
            systemMessage,
            stopSeq
        });
    }

    async embed(text) {
        return this._handleRequest('embedding', { text });
    }

    async _handleRequest(type, params) {
        const requestData = this._buildRequestData(type, params);
        
        try {
            const response = await this._makeHttpRequest(this.url, requestData);
            return this._processResponse(type, response, params);
        } catch (error) {
            console.error(`Error in ${type} request:`, error);
            return 'An error occurred, please try again.';
        }
    }

    _buildRequestData(type, { turns, systemMessage, stopSeq, text }) {
        if (type === 'chat') {
            const messages = [
                { role: 'system', content: systemMessage },
                ...turns
            ];

            // Add default user message if all messages are 'system' role
            if (turns.every((msg) => msg.role === 'system')) {
                messages.push({ role: 'user', content: 'hello' });
            }

            return {
                model: this.modelName,
                input: { messages },
                parameters: { result_format: 'message', stop: stopSeq }
            };
        }

        if (type === 'embedding') {
            if (!text || typeof text !== 'string') {
                throw new Error('Invalid embedding input: text must be a non-empty string.');
            }

            return {
                model: 'text-embedding-v2',
                input: { texts: [text] },
                parameters: { text_type: 'query' }
            };
        }

        throw new Error(`Invalid request type: ${type}`);
    }

    _processResponse(type, response, { turns, systemMessage, stopSeq }) {
        if (type === 'chat') {
            const choice = response?.output?.choices?.[0];
            
            if (choice?.finish_reason === 'length' && turns?.length > 0) {
                return this.sendRequest(turns.slice(1), systemMessage, stopSeq);
            }
            
            return choice?.message?.content || 'No content received.';
        }

        if (type === 'embedding') {
            return response?.output?.embeddings?.[0]?.embedding || 'No embedding result received.';
        }

        throw new Error(`Invalid response type: ${type}`);
    }

    async _makeHttpRequest(url, data) {
        this._validateRequestData(data);

        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw await this._handleHttpError(response);
        }

        return this._parseResponse(await response.text());
    }

    _validateRequestData(data) {
        const isValid = data.model && 
                       data.input && 
                       ((data.input.messages && data.parameters) || 
                        (data.input.texts && data.parameters));
                        
        if (!isValid) {
            throw new Error('Invalid request data format.');
        }
    }

    async _handleHttpError(response) {
        const errorText = await response.text();
        const error = new Error(`Request failed, status code ${response.status}: ${response.statusText}`);
        console.error(error.message);
        console.error('Error response content:', errorText);
        return error;
    }

    _parseResponse(responseText) {
        try {
            return JSON.parse(responseText);
        } catch (error) {
            console.error('Failed to parse response JSON:', error);
            throw new Error('Invalid response JSON format.');
        }
    }
}
