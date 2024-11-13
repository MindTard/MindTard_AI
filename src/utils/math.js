/**
 * Calculates the dot product of two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Dot product of the vectors
 */
function calculateDotProduct(a, b) {
    return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

/**
 * Calculates the magnitude (length) of a vector
 * @param {number[]} vector - Input vector
 * @returns {number} Magnitude of the vector
 */
function calculateMagnitude(vector) {
    const sumOfSquares = vector.reduce((sum, value) => sum + Math.pow(value, 2), 0);
    return Math.sqrt(sumOfSquares);
}

/**
 * Calculates the cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity value between -1 and 1
 * @throws {Error} If vectors have different lengths or are empty
 */
export function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        throw new Error('Input vectors must be arrays');
    }
    
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    if (a.length === 0) {
        throw new Error('Vectors cannot be empty');
    }

    const dotProduct = calculateDotProduct(a, b);
    const magnitudeA = calculateMagnitude(a);
    const magnitudeB = calculateMagnitude(b);
    
    if (magnitudeA === 0 || magnitudeB === 0) {
        throw new Error('Vector magnitude cannot be zero');
    }

    return dotProduct / (magnitudeA * magnitudeB);
}
