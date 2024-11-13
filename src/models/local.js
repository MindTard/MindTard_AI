import { strictFormat } from '../utils/text.js';

export class Local {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url || 'http://127.0.0.1:11434';
        this.endpoints = {
            chat: '/api/chat',
            embedding: '/api/embeddings'
        };
        this.defaultModels = {
            chat: 'llama3',
            embedding: 'nomic-embed-text'
        };
    }

    async chat(turns, systemMessage) {
        const model = this.model_name || this.defaultModels.chat;
        const messages = this._prepareChatMessages(turns, systemMessage);

        try {
            console.log(`Awaiting local response... (model: ${model})`);
            const response = await this._makeRequest(
                this.endpoints.chat, 
                { 
                    model, 
                    messages, 
                    stream: false 
                }
            );
            
            return response?.message?.content || '';
        } catch (error) {
            return this._handleChatError(error, turns, systemMessage);
        }
    }

    async embed(text) {
        const model = this.model_name || this.defaultModels.embedding;
        
        try {
            const response = await this._makeRequest(
                this.endpoints.embedding, 
                { 
                    model, 
                    prompt: text 
                }
            );
            return response?.embedding || [];
        } catch (error) {
            console.error('Embedding generation failed:', error);
            throw new Error('Failed to generate embedding');
        }
    }

    async _makeRequest(endpoint, body) {
        const url = new URL(endpoint, this.url);
        const requestOptions = {
            method: 'POST',
            headers: new Headers(),
            body: JSON.stringify(body)
        };

        try {
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                throw new Error(`Ollama Status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Ollama request failed:', error);
            throw error;
        }
    }

    _prepareChatMessages(turns, systemMessage) {
        const messages = strictFormat(turns);
        messages.unshift({ 
            role: 'system', 
            content: systemMessage 
        });
        return messages;
    }

    _handleChatError(error, turns, systemMessage) {
        const isContextLengthError = error.message.toLowerCase().includes('context length');
        
        if (isContextLengthError && turns.length > 1) {
            console.log('Context length exceeded, trying again with shorter context.');
            return this.chat(turns.slice(1), systemMessage);
        }
        
        console.error('Chat error:', error);
        return 'My brain disconnected, try again.';
    }
}
