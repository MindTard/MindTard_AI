import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class GPT {
    constructor(modelName, url) {
        this.modelName = modelName;
        this.openai = this.initializeOpenAI(url);
    }

    initializeOpenAI(url) {
        const config = {
            apiKey: getKey('OPENAI_API_KEY')
        };

        if (url) {
            config.baseURL = url;
        }

        if (hasKey('OPENAI_ORG_ID')) {
            config.organization = getKey('OPENAI_ORG_ID');
        }

        return new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stopSeq = '***') {
        const messages = [
            { role: 'system', content: systemMessage },
            ...turns
        ];

        const requestConfig = this.buildRequestConfig(messages, stopSeq);

        try {
            return await this.makeRequest(requestConfig);
        } catch (error) {
            return this.handleRequestError(error, turns, systemMessage, stopSeq);
        }
    }

    buildRequestConfig(messages, stopSeq) {
        const config = {
            model: this.modelName || 'gpt-3.5-turbo',
            messages,
            stop: stopSeq
        };

        if (this.modelName?.includes('o1')) {
            config.messages = strictFormat(messages);
            delete config.stop;
        }

        return config;
    }

    async makeRequest(config) {
        console.log('Awaiting openai api response...');
        const completion = await this.openai.chat.completions.create(config);

        if (completion.choices[0].finish_reason === 'length') {
            throw new Error('Context length exceeded');
        }

        console.log('Received.');
        return completion.choices[0].message.content;
    }

    async handleRequestError(error, turns, systemMessage, stopSeq) {
        const isContextLengthError = 
            error.message === 'Context length exceeded' || 
            error.code === 'context_length_exceeded';

        if (isContextLengthError && turns.length > 1) {
            console.log('Context length exceeded, trying again with shorter context.');
            return await this.sendRequest(
                turns.slice(1), 
                systemMessage, 
                stopSeq
            );
        }

        console.log(error);
        return 'My brain disconnected, try again.';
    }

    async embed(text) {
        const embedding = await this.openai.embeddings.create({
            model: this.modelName || 'text-embedding-3-small',
            input: text,
            encoding_format: 'float'
        });
        
        return embedding.data[0].embedding;
    }
}
