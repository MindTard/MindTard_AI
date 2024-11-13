import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;
        this.defaultModel = "gemini-1.5-flash";
        this.embeddingModel = "text-embedding-004";
        this.safetySettings = this.initSafetySettings();
        this.genAI = new GoogleGenerativeAI(getKey('GEMINI_API_KEY'));
    }

    initSafetySettings() {
        const categories = [
            "HARM_CATEGORY_DANGEROUS",
            "HARM_CATEGORY_HARASSMENT", 
            "HARM_CATEGORY_HATE_SPEECH",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "HARM_CATEGORY_DANGEROUS_CONTENT"
        ];

        return categories.map(category => ({
            category,
            threshold: "BLOCK_NONE"
        }));
    }

    getModel(modelName, options = {}) {
        const modelConfig = {
            model: modelName || this.defaultModel,
            ...options
        };

        if (this.url) {
            modelConfig.baseUrl = this.url;
        }

        return this.genAI.getGenerativeModel(modelConfig);
    }

    async sendRequest(turns, systemMessage) {
        const model = this.getModel(this.model_name, { safetySettings: this.safetySettings });

        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        
        console.log('Awaiting Google API response...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log('Received.');

        return this.truncateAtStopSequence(text, stop_seq);
    }

    truncateAtStopSequence(text, stopSeq) {
        if (!text.includes(stopSeq)) return text;
        return text.slice(0, text.indexOf(stopSeq));
    }

    async embed(text) {
        const model = this.getModel(this.embeddingModel);
        const result = await model.embedContent(text);
        return result.embedding.values;
    }
}
