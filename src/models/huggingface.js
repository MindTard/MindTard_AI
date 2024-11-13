import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { HfInference } from "@huggingface/inference";

const DEFAULT_MODEL = 'meta-llama/Meta-Llama-3-8B';
const STOP_SEQUENCE = '***';

export class HuggingFace {
    #huggingface;
    #modelName;

    constructor(modelName, url) {
        if (url) {
            console.warn("Hugging Face doesn't support custom urls!");
        }

        this.#modelName = modelName?.replace('huggingface/', '') || DEFAULT_MODEL;
        this.#huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    }

    async sendRequest(turns, systemMessage) {
        const prompt = this.#buildPrompt(turns, systemMessage);
        
        try {
            const response = await this.#streamCompletion(prompt);
            console.log('Received.');
            console.log(response);
            return response;
        } catch (error) {
            console.error('HuggingFace API Error:', error);
            return 'My brain disconnected, try again.';
        }
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by HuggingFace.');
    }

    #buildPrompt(turns, systemMessage) {
        const prompt = toSinglePrompt(turns, null, STOP_SEQUENCE);
        return systemMessage ? `${systemMessage}\n${prompt}` : prompt;
    }

    async #streamCompletion(input) {
        console.log('Awaiting Hugging Face API response...');
        let response = '';

        try {
            for await (const chunk of this.#huggingface.chatCompletionStream({
                model: this.#modelName,
                messages: [{ role: "user", content: input }]
            })) {
                response += (chunk.choices[0]?.delta?.content || "");
            }
            return response;
        } catch (error) {
            throw error;
        }
    }
}
