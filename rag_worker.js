import { parentPort } from "worker_threads";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

let embeddingsInstance = null;

async function getEmbeddings() {
    if (!embeddingsInstance) {
        // This is the heavy blocking operation
        console.log("[RAG Worker] Initializing Embeddings Model...");
        embeddingsInstance = new HuggingFaceTransformersEmbeddings({
            modelName: "Xenova/all-MiniLM-L6-v2",
        });
    }
    return embeddingsInstance;
}

async function retrieveContext(text, query) {
    if (!text || text.trim().length === 0) return "";

    try {
        console.log(`[RAG Worker] Processing ${text.length} chars...`);

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 50,
        });
        const docs = await splitter.createDocuments([text]);

        const embeddings = await getEmbeddings();
        const vectorStore = await HNSWLib.fromDocuments(docs, embeddings);

        const effectiveQuery = query || "complete blood count cbc hemoglobin thyroid tsh cardiac biomarkers bnp troponin electrolytes potassium magnesium kidney creatinine abnormal high low";

        // Retrieve top 4 chunks
        const retrievedDocs = await vectorStore.similaritySearch(effectiveQuery, 4);

        let relevantContext = retrievedDocs.map(doc => doc.pageContent).join("\n\n---\n\n");

        // STRICT LIMIT: 1000 chars to prevent context overflow crashing the LLM
        if (relevantContext.length > 1000) {
            relevantContext = relevantContext.substring(0, 1000) + "...(truncated)";
        }

        console.log(`[RAG Worker] Retrieval Complete. Length: ${relevantContext.length}`);
        return relevantContext;

    } catch (error) {
        console.error("[RAG Worker] Error:", error);
        return text.substring(0, 1000) + "\n...(RAG Failed)...";
    }
}

// Worker Message Handler
parentPort.on("message", async (msg) => {
    try {
        if (msg.type === "init") {
            await getEmbeddings(); // Pre-load
            parentPort.postMessage({ type: "init_success" });
        } else if (msg.type === "retrieve") {
            const context = await retrieveContext(msg.text, msg.query);
            parentPort.postMessage({ type: "result", context });
        }
    } catch (error) {
        parentPort.postMessage({ type: "error", error: error.message });
    }
});
