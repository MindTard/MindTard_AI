import Replicate from 'replicate';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

const DEFAULT_CONFIG = {
  defaultModel: 'meta/meta-llama-3-70b-instruct',
  embeddingModel: 'mark3labs/embeddings-gte-base:d619cff29338b9a37c3d06605042e1ff0594a8c3eff0175fd6967f5643fc4d47',
  stopSequence: '***',
  errorMessage: 'My brain disconnected, try again.'
};

export class ReplicateAPI {
  constructor(modelName, url) {
    this.modelName = modelName;
    
    if (url) {
      console.warn('Replicate API does not support custom URLs. Ignoring provided URL.');
    }

    this.initializeClient();
  }

  initializeClient() {
    const apiKey = getKey('REPLICATE_API_KEY');
    if (!apiKey) {
      throw new Error('REPLICATE_API_KEY is not configured');
    }

    this.replicate = new Replicate({ auth: apiKey });
  }

  async processStream(stream, stopSequence) {
    let result = '';
    try {
      for await (const event of stream) {
        result += event;
        if (result === '') break;
        if (result.includes(stopSequence)) {
          return result.slice(0, result.indexOf(stopSequence));
        }
      }
      return result;
    } catch (error) {
      console.error('Stream processing error:', error);
      throw error;
    }
  }

  async sendRequest(turns, systemMessage) {
    const prompt = toSinglePrompt(turns, null, DEFAULT_CONFIG.stopSequence);
    const modelName = this.modelName || DEFAULT_CONFIG.defaultModel;
    const input = { prompt, system_prompt: systemMessage };

    try {
      console.log('Awaiting Replicate API response...');
      const stream = this.replicate.stream(modelName, { input });
      const result = await this.processStream(stream, DEFAULT_CONFIG.stopSequence);
      console.log('Received response successfully.');
      return result;
    } catch (error) {
      console.error('Replicate API error:', error);
      return DEFAULT_CONFIG.errorMessage;
    }
  }

  async embed(text) {
    if (!text) {
      throw new Error('Text is required for embedding');
    }

    try {
      const output = await this.replicate.run(
        this.modelName || DEFAULT_CONFIG.embeddingModel,
        { input: { text } }
      );

      if (!output?.vectors) {
        throw new Error('Invalid embedding response format');
      }

      return output.vectors;
    } catch (error) {
      console.error('Embedding error:', error);
      throw error;
    }
  }
}
