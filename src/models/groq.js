import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';

export class GroqCloudAPI {
    constructor(model_name, url, max_tokens = 16384) {
        this.model_name = model_name || "mixtral-8x7b-32768";
        this.max_tokens = max_tokens;
        this.validateUrl(url);
        this.initializeGroq();
    }

    validateUrl(url) {
        if (url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }
    }

    initializeGroq() {
        const apiKey = getKey('GROQCLOUD_API_KEY');
        this.groq = new Groq({ apiKey });
    }

    prepareMessages(turns, systemMessage) {
        return [
            { role: "system", content: systemMessage },
            ...turns
        ];
    }

    async streamCompletion(completion) {
        let response = "";
        for await (const chunk of completion) {
            response += chunk.choices[0]?.delta?.content || '';
        }
        return response;
    }

    async sendRequest(turns, systemMessage, stop_seq = null) {
        try {
            console.log("Awaiting Groq response...");
            
            const messages = this.prepareMessages(turns, systemMessage);
            const completion = await this.groq.chat.completions.create({
                messages,
                model: this.model_name,
                temperature: 0.2,
                max_tokens: this.max_tokens,
                top_p: 1,
                stream: true,
                stop: stop_seq
            });

            return await this.streamCompletion(completion);
        } catch (error) {
            console.error("Groq API Error:", error);
            return "My brain just kinda stopped working. Try again.";
        }
    }

    async embed(text) {
        console.log("There is no support for embeddings in Groq support. However, the following text was provided:", text);
    }
}
