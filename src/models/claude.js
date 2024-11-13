import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

const DEFAULT_MODEL = "claude-3-sonnet-20240229";
const DEFAULT_MAX_TOKENS = 2048;

export class Claude {
    #anthropic;
    #modelName;

    constructor(modelName, baseURL) {
        this.#modelName = modelName;
        this.#anthropic = this.#initializeClient(baseURL);
    }

    #initializeClient(baseURL) {
        const config = {
            apiKey: this.#getApiKey(),
            ...(baseURL && { baseURL })
        };

        return new Anthropic(config);
    }

    #getApiKey() {
        const apiKey = getKey('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        return apiKey;
    }

    async sendRequest(turns, systemMessage) {
        const messages = strictFormat(turns);
        
        try {
            console.log('Awaiting Anthropic API response...');
            
            const response = await this.#createMessage(messages, systemMessage);
            console.log('Response received successfully.');
            
            return this.#extractResponseText(response);
        } catch (error) {
            return this.#handleError(error);
        }
    }

    async #createMessage(messages, systemMessage) {
        return await this.#anthropic.messages.create({
            model: this.#modelName || DEFAULT_MODEL,
            system: systemMessage,
            max_tokens: DEFAULT_MAX_TOKENS,
            messages: messages,
        });
    }

    #extractResponseText(response) {
        if (!response?.content?.[0]?.text) {
            throw new Error('Invalid response format from Anthropic API');
        }
        return response.content[0].text;
    }

    #handleError(error) {
        console.error('Error in Claude API request:', error);
        return 'My brain disconnected, try again.';
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Claude.');
    }
}
