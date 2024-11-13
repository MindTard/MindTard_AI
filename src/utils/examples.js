import { cosineSimilarity } from './math.js';
import { stringifyTurns } from './text.js';

export class Examples {
    #examples = [];
    #model = null;
    #selectNum = 2;
    #embeddings = {};

    constructor(model, selectNum = 2) {
        this.#model = model;
        this.#selectNum = selectNum;
    }

    #extractMessageContent(turns) {
        return turns
            .filter(turn => turn.role !== 'assistant')
            .map(turn => turn.content.substring(turn.content.indexOf(':') + 1).trim())
            .join('\n')
            .trim();
    }

    #getUniqueWords(text) {
        return new Set(
            text.replace(/[^a-zA-Z ]/g, '')
                .toLowerCase()
                .split(' ')
                .filter(Boolean)
        );
    }

    #calculateWordOverlap(text1, text2) {
        const words1 = this.#getUniqueWords(text1);
        const words2 = this.#getUniqueWords(text2);
        
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const unionSize = words1.size + words2.size - intersection.size;
        
        return intersection.size / unionSize;
    }

    async load(examples) {
        this.#examples = examples;

        if (!this.#model) return;

        try {
            const embeddingTasks = examples.map(async example => {
                const turnText = this.#extractMessageContent(example);
                this.#embeddings[turnText] = await this.#model.embed(turnText);
            });

            await Promise.all(embeddingTasks);
        } catch (error) {
            console.warn('Error with embedding model, falling back to word overlap:', error);
            this.#model = null;
        }
    }

    async #sortExamplesByRelevance(turns) {
        const turnText = this.#extractMessageContent(turns);

        if (this.#model) {
            const currentEmbedding = await this.#model.embed(turnText);
            return this.#examples.sort((a, b) => {
                const textA = this.#extractMessageContent(a);
                const textB = this.#extractMessageContent(b);
                return cosineSimilarity(currentEmbedding, this.#embeddings[textB]) -
                       cosineSimilarity(currentEmbedding, this.#embeddings[textA]);
            });
        }

        return this.#examples.sort((a, b) => {
            const textA = this.#extractMessageContent(a);
            const textB = this.#extractMessageContent(b);
            return this.#calculateWordOverlap(turnText, textB) -
                   this.#calculateWordOverlap(turnText, textA);
        });
    }

    async getRelevant(turns) {
        const sortedExamples = await this.#sortExamplesByRelevance(turns);
        return JSON.parse(JSON.stringify(sortedExamples.slice(0, this.#selectNum)));
    }

    async createExampleMessage(turns) {
        const selectedExamples = await this.getRelevant(turns);

        console.log('Selected examples:');
        selectedExamples.forEach(example => console.log(example[0].content));

        const examplesText = selectedExamples
            .map((example, index) => `Example ${index + 1}:\n${stringifyTurns(example)}`)
            .join('\n\n');

        return `Examples of how to respond:\n${examplesText}\n\n`;
    }
}
