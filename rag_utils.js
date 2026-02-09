
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

// Initialize embeddings once to avoid reloading model
let embeddingsInstance = null;

async function getEmbeddings() {
    if (!embeddingsInstance) {
        console.log("Initializing RAG Embeddings Model (Xenova/all-MiniLM-L6-v2)...");
        embeddingsInstance = new HuggingFaceTransformersEmbeddings({
            modelName: "Xenova/all-MiniLM-L6-v2",
        });
    }
    return embeddingsInstance;
}

/**
 * Processes text content using RAG to retrieve relevant context.
 * @param {string} text - The full text content to process.
 * @param {string} query - The query to search for relevant context.
 * @returns {Promise<string>} - Concatenated relevant text chunks.
 */
export async function retrieveContext(text, query) {
    if (!text || text.trim().length === 0) {
        return "";
    }

    try {
        console.log("Starting RAG processing...", text.length, "characters");

        // 1. Split Text
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 50,
        });
        const docs = await splitter.createDocuments([text]);
        console.log(`Split text into ${docs.length} chunks.`);

        // 2. Index Documents
        const embeddings = await getEmbeddings();
        const vectorStore = await HNSWLib.fromDocuments(docs, embeddings);

        // 3. Retrieve Relevant Context
        // We search for key clinical terms if no specific query is provided, 
        // or ensure the query covers broad clinical aspects.
        // Optimized query to target abnormal findings and specific panels
        const effectiveQuery = query || "complete blood count cbc hemoglobin thyroid tsh cardiac biomarkers bnp troponin electrolytes potassium magnesium kidney creatinine abnormal high low";

        console.log("Performing RAG Search with query:", effectiveQuery);
        const retrievedDocs = await vectorStore.similaritySearch(effectiveQuery, 4); // Increase to 4 chunks

        let relevantContext = retrievedDocs.map(doc => doc.pageContent).join("\n\n---\n\n");

        // Strict limit to 1500 chars to match context window constraints
        if (relevantContext.length > 1500) {
            relevantContext = relevantContext.substring(0, 1500) + "...(truncated)";
        }

        console.log("RAG Retrieval Complete. Context length:", relevantContext.length);
        console.log("DEBUG: RETRIEVED CONTEXT:\n", relevantContext); // Explicit logging for debugging

        return relevantContext;

    } catch (error) {
        console.error("RAG Processing Error:", error);
        // Fallback: Return truncated original text if RAG fails
        return text.substring(0, 1500) + "\n...(RAG Failed, truncated)...";
    }
}
